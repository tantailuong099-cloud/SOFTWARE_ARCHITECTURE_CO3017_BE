import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { UserQRService } from '../user-qr/user-qr.service';
import { GateStationService } from '../gate-station/gate-station.service';
import type { ITurnstilePort } from '../../adapters/turnstile/turnstile.port';
import {
  TURNSTILE_PORT,
  TurnstileCommandResult,
} from '../../adapters/turnstile/turnstile.port';
import { AccessDecision, ControllerOutcome } from './model/access-event.model';
import {
  AccessScanResponseDto,
  ExportHRBatchDto,
  OfflineScanItemDto,
  QueryRawEventsDto,
  SubmitAccessScanDto,
  SyncOfflineResultDto,
  SyncOfflineScansDto,
} from './dto/access-event.dto';
import { UserStatus } from '../users/model/user.model';
import type { GateStationContext } from '../gate-station/dto/gate-station.dto';

@Injectable()
export class AttendanceEventService {
  private readonly logger = new Logger(AttendanceEventService.name);

  // In-memory durable store for access events & idempotency registry
  private readonly eventsStore = new Map<string, any>(); // eventId -> AccessEvent
  private readonly requestRegistry = new Map<string, any>(); // requestId -> AccessScanResponseDto

  constructor(
    private readonly userQRService: UserQRService,
    private readonly gateStationService: GateStationService,
    @Inject(TURNSTILE_PORT)
    private readonly turnstileAdapter: ITurnstilePort,
  ) {}

  // --- Main Mission-Critical Gate Transaction: UC-03 & ADR-003 ---
  async submitAccessScan(
    dto: SubmitAccessScanDto,
  ): Promise<AccessScanResponseDto> {
    const startTime = Date.now();
    const correlationId = `CORR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;

    this.logger.log(
      `[Gate Scan Received] ReqID: ${dto.requestId}, Station: ${dto.stationId}, CorrID: ${correlationId}`,
    );

    // 1. Idempotency Check (NFR-DI-02 & ADR-003)
    if (this.requestRegistry.has(dto.requestId)) {
      const cached = this.requestRegistry.get(dto.requestId);
      this.logger.warn(
        `[Duplicate Request Detected] Returning established result for ReqID ${dto.requestId}`,
      );
      return {
        ...cached,
        isCachedDuplicate: true,
      };
    }

    // Validate the selected predefined station before QR processing.
    let station: GateStationContext;
    try {
      station = await this.gateStationService.validateActiveStation(
        dto.stationId,
      );
    } catch (error) {
      let reasonCode: string;
      if (error instanceof NotFoundException) {
        reasonCode = 'STATION_NOT_FOUND';
      } else if (error instanceof ForbiddenException) {
        reasonCode = 'STATION_INACTIVE';
      } else if (error instanceof BadRequestException) {
        reasonCode = 'INVALID_STATION_CONFIGURATION';
      } else {
        throw error;
      }
      const elapsed = Date.now() - startTime;
      const response: AccessScanResponseDto = {
        requestId: dto.requestId,
        accessDecision: AccessDecision.DENIED,
        reasonCode,
        controllerOutcome: ControllerOutcome.NOT_APPLICABLE,
        serverTimestamp: new Date(),
        processingLatencyMs: elapsed,
      };
      this.requestRegistry.set(dto.requestId, response);
      return response;
    }

    // 3. Credential Validation (ADR-002: Stage 1)
    const credValidation = await this.userQRService.validateCredential(
      dto.qrPayload,
    );

    // Unrecognized or out-of-scope QR: Rejected without raw event per FR-AE-03
    if (!credValidation.isRecognized) {
      const elapsed = Date.now() - startTime;
      this.logger.warn(
        `[Unrecognized QR] Payload outside company scope. ReqID: ${dto.requestId}`,
      );
      const response: AccessScanResponseDto = {
        requestId: dto.requestId,
        accessDecision: AccessDecision.DENIED,
        reasonCode: credValidation.denialReason || 'UNRECOGNIZED_CREDENTIAL',
        controllerOutcome: ControllerOutcome.NOT_APPLICABLE,
        serverTimestamp: new Date(),
        processingLatencyMs: elapsed,
      };
      this.requestRegistry.set(dto.requestId, response);
      return response;
    }

    // Recognized QR but failed credential checks (e.g. Expired, Suspended, Revoked)
    if (!credValidation.isValid) {
      return this.persistAndReturnDenial(
        dto.requestId,
        station,
        credValidation.employeeId,
        credValidation.employeeName,
        credValidation.denialReason || 'INVALID_CREDENTIAL',
        correlationId,
        startTime,
      );
    }

    // 4. Current Authorization Evaluation (ADR-002: Stage 2)
    // Check Employee Active Status
    if (credValidation.employeeStatus !== UserStatus.ACTIVE) {
      return this.persistAndReturnDenial(
        dto.requestId,
        station,
        credValidation.employeeId,
        credValidation.employeeName,
        'INACTIVE_EMPLOYEE',
        correlationId,
        startTime,
      );
    }

    // Check Factory Assignment
    if (credValidation.factoryId !== station.factoryId) {
      this.logger.warn(
        `[Factory Access Mismatch] Employee factory ${credValidation.factoryId} vs Gate station factory ${station.factoryId}`,
      );
      return this.persistAndReturnDenial(
        dto.requestId,
        station,
        credValidation.employeeId,
        credValidation.employeeName,
        'UNAUTHORIZED_FACTORY_GATE',
        correlationId,
        startTime,
      );
    }

    // 5. Approved Path - Durable Pre-command Persistence (ADR-003 & Fig 15)
    const eventId = crypto.randomUUID();
    const serverTimestamp = new Date();

    const accessEvent = {
      eventId,
      requestId: dto.requestId,
      employeeId: credValidation.employeeId!,
      employeeName: credValidation.employeeName!,
      stationId: station.stationCode,
      factoryId: station.factoryId,
      direction: station.direction,
      accessDecision: AccessDecision.APPROVED,
      denialReason: null,
      controllerOutcome: ControllerOutcome.CONTROLLER_PENDING,
      serverTimestamp,
      deviceTimestamp: dto.deviceTimestamp
        ? new Date(dto.deviceTimestamp)
        : null,
      correlationId,
      policyVersion: 'v1.0',
    };

    // Persist approved decision before sending unlock command (NFR-DI-01, ADR-003)
    this.eventsStore.set(eventId, accessEvent);

    // 6. Send One Bounded Unlock Command to Turnstile Adapter (FR-GS-03)
    let finalControllerOutcome = ControllerOutcome.CONTROLLER_CONFIRMED;
    try {
      const turnstileRes = await this.turnstileAdapter.unlockTurnstile({
        requestId: dto.requestId,
        eventId,
        controllerReference: station.stationCode,
        stationId: station.stationCode,
        direction: station.direction,
      });

      if (turnstileRes.result === TurnstileCommandResult.UNLOCK_CONFIRMED) {
        finalControllerOutcome = ControllerOutcome.CONTROLLER_CONFIRMED;
      } else if (
        turnstileRes.result === TurnstileCommandResult.MECHANICAL_FAULT
      ) {
        finalControllerOutcome = ControllerOutcome.CONTROLLER_FAILED;
      } else {
        finalControllerOutcome = ControllerOutcome.CONTROLLER_UNKNOWN;
      }
    } catch (err) {
      this.logger.error(`Turnstile interaction failed: ${err.message}`);
      finalControllerOutcome = ControllerOutcome.CONTROLLER_FAILED;
    }

    // 7. Append controller outcome to immutable Access Event
    accessEvent.controllerOutcome = finalControllerOutcome;
    this.eventsStore.set(eventId, accessEvent);

    const elapsed = Date.now() - startTime;
    this.logger.log(
      `[Access Scan Completed] ReqID: ${dto.requestId}, EventID: ${eventId}, Decision: APPROVED, Outcome: ${finalControllerOutcome}, Latency: ${elapsed}ms`,
    );

    const response: AccessScanResponseDto = {
      requestId: dto.requestId,
      accessDecision: AccessDecision.APPROVED,
      eventId,
      controllerOutcome: finalControllerOutcome,
      serverTimestamp,
      employeeId: credValidation.employeeId,
      employeeName: credValidation.employeeName,
      factoryId: station.factoryId,
      direction: station.direction,
      processingLatencyMs: elapsed,
    };

    this.requestRegistry.set(dto.requestId, response);
    return response;
  }

  private persistAndReturnDenial(
    requestId: string,
    station: any,
    employeeId: string | undefined,
    employeeName: string | undefined,
    denialReason: string,
    correlationId: string,
    startTime: number,
  ): AccessScanResponseDto {
    const eventId = crypto.randomUUID();
    const serverTimestamp = new Date();

    const denialEvent = {
      eventId,
      requestId,
      employeeId: employeeId || 'UNKNOWN',
      employeeName: employeeName || 'UNKNOWN',
      stationId: station.stationCode,
      factoryId: station.factoryId,
      direction: station.direction,
      accessDecision: AccessDecision.DENIED,
      denialReason,
      controllerOutcome: ControllerOutcome.NOT_APPLICABLE,
      serverTimestamp,
      correlationId,
      policyVersion: 'v1.0',
    };

    this.eventsStore.set(eventId, denialEvent);

    const elapsed = Date.now() - startTime;
    this.logger.warn(
      `[Access Denied] ReqID: ${requestId}, Reason: ${denialReason}, Employee: ${employeeId}, Latency: ${elapsed}ms`,
    );

    const response: AccessScanResponseDto = {
      requestId,
      accessDecision: AccessDecision.DENIED,
      eventId,
      reasonCode: denialReason,
      controllerOutcome: ControllerOutcome.NOT_APPLICABLE,
      serverTimestamp,
      employeeId,
      employeeName,
      factoryId: station.factoryId,
      direction: station.direction,
      processingLatencyMs: elapsed,
    };

    this.requestRegistry.set(requestId, response);
    return response;
  }

  // --- UC-04: View Recent Gate Events (for Guards) ---
  async getRecentEvents(stationId: string, limit = 20) {
    const events = Array.from(this.eventsStore.values())
      .filter((ev) => ev.stationId === stationId)
      .sort((a, b) => b.serverTimestamp.getTime() - a.serverTimestamp.getTime())
      .slice(0, limit);
    return events;
  }

  // --- UC-07: Query Raw Access Events ---
  async queryEvents(dto: QueryRawEventsDto) {
    let result = Array.from(this.eventsStore.values());

    if (dto.stationId) {
      result = result.filter((e) => e.stationId === dto.stationId);
    }
    if (dto.factoryId) {
      result = result.filter((e) => e.factoryId === dto.factoryId);
    }
    if (dto.employeeId) {
      result = result.filter((e) => e.employeeId === dto.employeeId);
    }
    if (dto.accessDecision) {
      result = result.filter((e) => e.accessDecision === dto.accessDecision);
    }

    result.sort(
      (a, b) => b.serverTimestamp.getTime() - a.serverTimestamp.getTime(),
    );

    if (dto.limit) {
      result = result.slice(0, dto.limit);
    }

    const total = result.length;
    const approved = result.filter(
      (e) => e.accessDecision === AccessDecision.APPROVED,
    ).length;
    const denied = result.filter(
      (e) => e.accessDecision === AccessDecision.DENIED,
    ).length;

    return {
      total,
      approved,
      denied,
      events: result,
    };
  }

  // --- UC-06 & ADR-004: Monthly Raw Event Export to HR/Payroll ---
  async exportHRBatch(dto: ExportHRBatchDto) {
    const batchId = `BATCH-${dto.reportingPeriod}-${crypto.randomBytes(3).toString('hex').toUpperCase()}`;
    const rawEvents = Array.from(this.eventsStore.values());

    const batch = {
      batchId,
      reportingPeriod: dto.reportingPeriod,
      eventCount: rawEvents.length,
      status: 'EXPORT_ACKNOWLEDGED',
      exportedAt: new Date(),
      sampleEvents: rawEvents.slice(0, 5),
    };

    this.logger.log(
      `Exported HR/Payroll Batch ${batchId} with ${rawEvents.length} raw events`,
    );
    return batch;
  }

  // --- M2 Contract: SyncOfflineScans (ADR-008 Edge Resilience & Store-and-Forward) ---
  async syncOfflineScans(
    dto: SyncOfflineScansDto,
  ): Promise<SyncOfflineResultDto> {
    this.logger.log(
      `[Offline Sync Batch Received] Station: ${dto.stationId}, Items: ${dto.scans?.length || 0}`,
    );

    const results: AccessScanResponseDto[] = [];
    let duplicateCount = 0;
    let processedCount = 0;

    for (const scanItem of dto.scans || []) {
      // Use existing submitAccessScan for station validation, QR checks and event handling.
      const scanResult = await this.submitAccessScan({
        requestId: scanItem.requestId,
        stationId: scanItem.stationId || dto.stationId,
        qrPayload: scanItem.qrPayload,
        deviceTimestamp: scanItem.deviceTimestamp,
      });

      if (scanResult.isCachedDuplicate) {
        duplicateCount++;
      } else {
        processedCount++;
      }
      results.push(scanResult);
    }

    return {
      stationId: dto.stationId,
      totalReceived: dto.scans?.length || 0,
      processedCount,
      duplicateCount,
      results,
    };
  }
}
