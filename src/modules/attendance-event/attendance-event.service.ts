import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import { AccessEventModel, AccessDecision, ControllerOutcome } from './model/access-event.model';
import { AccessScanRequestModel, ScanResultType } from './model/access-scan-request.model';
import { OfflineSyncBatchModel } from './model/offline-sync-batch.model';
import { canonicalOfflineBatch, canonicalOfflineEvent, sha256Hex, verifyOfflineSignature } from './offline-evidence';
import { GateStationService } from '../gate-station/gate-station.service';
import {
  ExportHRBatchDto,
  SyncOfflineResultDto,
  SyncOfflineScansDto,
  OfflineAccessEventDto,
  SyncOfflineEventResultDto,
} from './dto/access-event.dto';
import type { GateStationContext } from '../gate-station/dto/gate-station.dto';

interface OfflinePolicyTrust {
  validFrom : string;
  validUntil : string;
  policyVersion : string;
  factoryId : string;
  direction : string;
  allowedEmployeeIds : string[];
}

interface OfflineStationTrust {
  publicKeyPem : string;
  policies : Record<string, OfflinePolicyTrust>;
}

@Injectable()
export class AttendanceEventService {
  private readonly logger = new Logger(AttendanceEventService.name);

  constructor(
    private readonly gateStationService : GateStationService,
    @InjectModel(AccessEventModel)
    private readonly accessEventModel : typeof AccessEventModel,
    @InjectModel(AccessScanRequestModel)
    private readonly scanRequestModel : typeof AccessScanRequestModel,
    @InjectModel(OfflineSyncBatchModel)
    private readonly offlineBatchModel : typeof OfflineSyncBatchModel,
  ) {}

  // --- UC-06 & ADR-004: Monthly Raw Event Export to HR/Payroll ---
  async exportHRBatch(dto: ExportHRBatchDto) {
    const batchId = `BATCH-${dto.reportingPeriod}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const rawEvents = await this.accessEventModel.findAll();

    const batch = {
      batchId,
      reportingPeriod: dto.reportingPeriod,
      eventCount: rawEvents.length,
      status: 'EXPORT_SIMULATED',
      exportedAt: new Date(),
      sampleEvents: rawEvents.slice(0, 5),
    };

    this.logger.log(
      `Prepared simulated HR/Payroll Batch ${batchId} with ${rawEvents.length} raw events`,
    );
    return batch;
  }

  // Historical import only. Never call live QR validation or controller dispatch from this path.
  async syncOfflineScans(dto : SyncOfflineScansDto) : Promise<SyncOfflineResultDto> {
    if (dto.schemaVersion !== 1 || !Array.isArray(dto.events) || dto.events.length < 1 ||
        dto.events.length > 25 || dto.eventCount !== dto.events.length) {
      throw new BadRequestException('INVALID_OFFLINE_BATCH');
    }

    const eventIds   = dto.events.map((event) => event.eventId);
    const requestIds = dto.events.map((event) => event.requestId);
    const sequences  = dto.events.map((event) => event.journalSequence);
    if (new Set(eventIds).size !== eventIds.length || new Set(requestIds).size !== requestIds.length ||
        new Set(sequences).size !== sequences.length) {
      throw new BadRequestException('DUPLICATE_IDENTITIES_IN_BATCH');
    }

    // No trust configuration means no offline attendance can be accepted.
    let trust : OfflineStationTrust;
    try {
      const configured = JSON.parse(process.env.OFFLINE_SYNC_TRUST_JSON ?? '{}') as Record<string, OfflineStationTrust>;
      trust = configured[dto.stationId];
    } catch {
      throw new ServiceUnavailableException('OFFLINE_SYNC_TRUST_CONFIGURATION_INVALID');
    }
    if (!trust?.publicKeyPem || !trust.policies || typeof trust.policies !== 'object') {
      throw new ServiceUnavailableException('OFFLINE_SYNC_STATION_NOT_CONFIGURED');
    }

    let digest : string;
    let canonical : string;
    try {
      canonical = canonicalOfflineBatch(dto);
      digest = sha256Hex(canonical);
    } catch {
      throw new BadRequestException('INVALID_OFFLINE_TIMESTAMP');
    }
    if (dto.payloadDigest !== `sha256:${digest}`) throw new BadRequestException('BATCH_DIGEST_MISMATCH');
    if (!verifyOfflineSignature(canonical, dto.batchSignature, trust.publicKeyPem)) {
      throw new ForbiddenException('INVALID_OFFLINE_BATCH_SIGNATURE');
    }

    const station = await this.gateStationService.validateActiveStation(dto.stationId);
    const database = this.accessEventModel.sequelize;
    if (!database) throw new ServiceUnavailableException('Attendance database is not configured');

    return database.transaction(async (transaction) => {
      const [claimed] = await database.query(`
        INSERT INTO offline_sync_batches
          (batch_id, station_id, payload_digest, event_count, results_json, created_at, updated_at)
        VALUES (:batchId, :stationId, :digest, :eventCount, '[]'::jsonb, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (batch_id) DO NOTHING RETURNING batch_id
      `, { replacements : { batchId : dto.batchId, stationId : dto.stationId, digest, eventCount : dto.eventCount }, transaction });

      if ((claimed as Array<{ batch_id : string }>).length === 0) {
        const previous = await this.offlineBatchModel.findByPk(dto.batchId, { transaction });
        if (!previous) throw new Error('Committed offline batch could not be loaded');
        if (previous.stationId !== dto.stationId || previous.payloadDigest !== digest ||
            previous.eventCount !== dto.eventCount) {
          throw new ConflictException('OFFLINE_BATCH_ID_CONFLICT');
        }
        return this.offlineBatchResponse(dto, previous.resultsJson);
      }

      const resultById = new Map<string, SyncOfflineEventResultDto>();
      // Stable locking order reduces deadlocks between overlapping batches.
      for (const event of [...dto.events].sort((a, b) => a.requestId.localeCompare(b.requestId))) {
        let reasonCode = this.offlineEvidenceRejection(event, dto.stationId, station, trust);
        if (!reasonCode) {
          const signatureValid = verifyOfflineSignature(
            canonicalOfflineEvent(event), event.evidenceSignature, trust.publicKeyPem,
          );
          if (!signatureValid) reasonCode = 'INVALID_OFFLINE_EVENT_SIGNATURE';
        }
        const response = reasonCode ? {
          eventId : event.eventId, status : 'REJECTED' as const, reasonCode,
        } : await this.importOfflineEvent(event, dto.batchId, station, transaction);
        resultById.set(event.eventId, response);
      }
      const results = dto.events.map((event) => resultById.get(event.eventId)!);
      const [updated] = await this.offlineBatchModel.update({ resultsJson : results }, {
        where : { batchId : dto.batchId }, transaction,
      });
      if (updated !== 1) throw new Error('Offline batch acknowledgements were not persisted');
      return this.offlineBatchResponse(dto, results);
    });
  }

  private offlineEvidenceRejection(
    event : OfflineAccessEventDto, stationId : string, station : GateStationContext, trust : OfflineStationTrust,
  ) : string | null {
    if (event.stationId !== stationId) return 'OFFLINE_STATION_MISMATCH';
    const policy = trust.policies[event.policySnapshotId];
    if (!policy || !Array.isArray(policy.allowedEmployeeIds) ||
        policy.factoryId !== station.factoryId || policy.direction !== station.direction ||
        policy.policyVersion !== event.policyVersion ||
        !policy.allowedEmployeeIds.includes(event.employeeId)) {
      return 'OFFLINE_POLICY_NOT_AUTHORIZED';
    }
    const timestamp = new Date(event.deviceTimestamp).getTime();
    const validFrom = new Date(policy.validFrom).getTime();
    const validUntil = new Date(policy.validUntil).getTime();
    if (!Number.isFinite(timestamp) || !Number.isFinite(validFrom) || !Number.isFinite(validUntil) ||
        timestamp < validFrom || timestamp > validUntil || timestamp > Date.now() + 300000) {
      return 'OFFLINE_POLICY_OUTSIDE_VALIDITY';
    }
    if (!Number.isSafeInteger(event.journalSequence) || event.journalSequence < 1) return 'INVALID_JOURNAL_SEQUENCE';
    if (event.accessDecision === AccessDecision.APPROVED) {
      if (event.denialReason || ![
        ControllerOutcome.CONTROLLER_CONFIRMED, ControllerOutcome.CONTROLLER_FAILED, ControllerOutcome.CONTROLLER_UNKNOWN,
      ].includes(event.controllerOutcome)) return 'INVALID_OFFLINE_CONTROLLER_OUTCOME';
    } else if (event.accessDecision === AccessDecision.DENIED) {
      if (!event.denialReason || event.controllerOutcome !== ControllerOutcome.NOT_APPLICABLE) {
        return 'INVALID_OFFLINE_DENIAL';
      }
    } else {
      return 'INVALID_OFFLINE_DECISION';
    }
    return null;
  }

  private async importOfflineEvent(
    event : OfflineAccessEventDto, batchId : string, station : GateStationContext, transaction : Transaction,
  ) : Promise<SyncOfflineEventResultDto> {
    const database = this.accessEventModel.sequelize!;
    const eventDigest = sha256Hex(canonicalOfflineEvent(event));
    const [requestClaim] = await database.query(`
      INSERT INTO access_scan_requests
        (request_id, station_id, server_timestamp, created_at, updated_at)
      VALUES (:requestId, :stationId, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      ON CONFLICT (request_id) DO NOTHING RETURNING request_id
    `, { replacements : { requestId : event.requestId, stationId : event.stationId }, transaction });

    if ((requestClaim as Array<{ request_id : string }>).length === 0) {
      const [existingRequest, existingEvent] = await Promise.all([
        this.scanRequestModel.findByPk(event.requestId, { transaction }),
        this.accessEventModel.findByPk(event.eventId, { transaction }),
      ]);
      if (existingRequest?.eventId === event.eventId && existingEvent?.eventSource === 'OFFLINE_EDGE' &&
          existingEvent.offlineEventDigest === eventDigest && existingEvent.requestId === event.requestId) {
        return { eventId : event.eventId, status : 'DUPLICATE' };
      }
      return { eventId : event.eventId, status : 'CONFLICT', reasonCode : 'REQUEST_ID_CONFLICT' };
    }

    const [inserted] = await database.query(`
      INSERT INTO access_events (
        event_id, request_id, employee_id, employee_name, station_id, factory_id, direction,
        access_decision, denial_reason, controller_outcome, server_timestamp, device_timestamp,
        correlation_id, policy_version, dispatch_claimed_at, event_source, offline_event_digest,
        offline_batch_id, offline_policy_snapshot_id, offline_journal_sequence,
        offline_evidence_signature, created_at, updated_at
      ) VALUES (
        :eventId, :requestId, :employeeId, NULL, :stationId, :factoryId, :direction,
        :decision, :denialReason, :outcome, CURRENT_TIMESTAMP, :deviceTimestamp,
        :correlationId, :policyVersion, NULL, 'OFFLINE_EDGE', :eventDigest,
        :batchId, :snapshotId, :sequence, :signature, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      ) ON CONFLICT DO NOTHING RETURNING event_id
    `, { replacements : {
      eventId : event.eventId, requestId : event.requestId, employeeId : event.employeeId,
      stationId : event.stationId, factoryId : station.factoryId, direction : station.direction,
      decision : event.accessDecision, denialReason : event.denialReason ?? null,
      outcome : event.controllerOutcome, deviceTimestamp : new Date(event.deviceTimestamp),
      correlationId : `OFFLINE-${event.eventId}`, policyVersion : event.policyVersion,
      eventDigest, batchId, snapshotId : event.policySnapshotId,
      sequence : event.journalSequence, signature : event.evidenceSignature,
    }, transaction });

    if ((inserted as Array<{ event_id : string }>).length === 0) {
      // A failed event insert must not leave a reserved Request ID.
      await database.query(`
        DELETE FROM access_scan_requests WHERE request_id = :requestId AND result_type IS NULL
      `, { replacements : { requestId : event.requestId }, transaction });
      const existingEvent = await this.accessEventModel.findByPk(event.eventId, { transaction });
      const reasonCode = existingEvent ? 'EVENT_ID_CONTENT_MISMATCH' : 'JOURNAL_SEQUENCE_CONFLICT';
      return { eventId : event.eventId, status : 'CONFLICT', reasonCode };
    }

    const [updated] = await this.scanRequestModel.update({
      resultType : ScanResultType.EVENT_RECORDED,
      eventId    : event.eventId,
      serverTimestamp : new Date(),
    }, { where : { requestId : event.requestId }, transaction });
    if (updated !== 1) throw new Error('Offline Request ID was not linked to its event');
    return { eventId : event.eventId, status : 'ACCEPTED' };
  }

  private offlineBatchResponse(
    dto : SyncOfflineScansDto, results : SyncOfflineEventResultDto[],
  ) : SyncOfflineResultDto {
    const acceptedCount  = results.filter((item) => item.status === 'ACCEPTED').length;
    const duplicateCount = results.filter((item) => item.status === 'DUPLICATE').length;
    const conflictCount  = results.filter((item) => item.status === 'CONFLICT').length;
    const rejectedCount  = results.filter((item) => item.status === 'REJECTED').length;
    return {
      batchId : dto.batchId, stationId : dto.stationId,
      status : conflictCount || rejectedCount ? 'PARTIAL' : 'COMPLETE',
      totalReceived : results.length, acceptedCount, duplicateCount, conflictCount, rejectedCount, results,
    };
  }
}
