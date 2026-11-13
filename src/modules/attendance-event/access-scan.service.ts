import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  Inject,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { InjectModel } from '@nestjs/sequelize';
import type { Transaction } from 'sequelize';
import { AccessEventModel, AccessDecision, ControllerOutcome } from './model/access-event.model';
import { AccessScanRequestModel, ScanResultType } from './model/access-scan-request.model';
import { SCAN_CREDENTIAL_VALIDATOR } from '../user-qr/scan-credential.port';
import type { ScanCredentialValidator } from '../user-qr/scan-credential.port';
import { GateStationService } from '../gate-station/gate-station.service';
import type { ITurnstilePort } from '../../adapters/turnstile/turnstile.port';
import { TURNSTILE_PORT, TurnstileCommandResult } from '../../adapters/turnstile/turnstile.port';
import { AccessScanResponseDto, SubmitAccessScanDto } from './dto/access-event.dto';
import { UserStatus } from '../users/model/user.model';
import type { GateStationContext } from '../gate-station/dto/gate-station.dto';

@Injectable()
export class AccessScanService {
  private readonly logger = new Logger(AccessScanService.name);

  constructor(
    @Inject(SCAN_CREDENTIAL_VALIDATOR)
    private readonly credentialValidator : ScanCredentialValidator,
    private readonly gateStationService : GateStationService,
    @Inject(TURNSTILE_PORT)
    private readonly turnstileAdapter : ITurnstilePort,
    @InjectModel(AccessEventModel)
    private readonly accessEventModel : typeof AccessEventModel,
    @InjectModel(AccessScanRequestModel)
    private readonly scanRequestModel : typeof AccessScanRequestModel,
  ) {}

  async submitAccessScan(dto : SubmitAccessScanDto) : Promise<AccessScanResponseDto> {
    const startTime       = Date.now();
    const correlationId   = `CORR-${Date.now()}-${crypto.randomBytes(4).toString('hex')}`;
    const requestData     = JSON.stringify([dto.stationId, dto.qrPayload, dto.deviceTimestamp ?? null]);
    const fingerprint     = crypto.createHash('sha256').update(requestData).digest('hex');
    const database        = this.accessEventModel.sequelize;
    if (!database) throw new Error('Attendance database is not configured');

    // Look up committed requests before revalidating a station whose configuration may have changed.
    const previous = await this.scanRequestModel.findByPk(dto.requestId);
    if (previous) return this.restoreRequest(dto, fingerprint, previous, startTime);

    let station : GateStationContext;
    try {
      station = await this.gateStationService.validateActiveStation(dto.stationId);
    } catch (error) {
      let reasonCode : string;
      if (error instanceof NotFoundException) reasonCode = 'STATION_NOT_FOUND';
      else if (error instanceof ForbiddenException) reasonCode = 'STATION_INACTIVE';
      else if (error instanceof BadRequestException) reasonCode = 'INVALID_STATION_CONFIGURATION';
      else throw error;

      return {
        requestId         : dto.requestId,
        accessDecision    : AccessDecision.DENIED,
        reasonCode,
        controllerOutcome : ControllerOutcome.NOT_APPLICABLE,
        serverTimestamp   : new Date(),
        processingLatencyMs : Date.now() - startTime,
      };
    }

    // The request claim, one-time QR consumption and access decision commit together.
    const result = await database.transaction(async (transaction) => {
      const [inserted] = await database.query(`
        INSERT INTO access_scan_requests
          (request_id, station_id, request_fingerprint, server_timestamp, created_at, updated_at)
        VALUES (:requestId, :stationId, :fingerprint, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT (request_id) DO NOTHING RETURNING request_id
      `, { replacements : { requestId : dto.requestId, stationId : dto.stationId, fingerprint }, transaction });

      if ((inserted as Array<{ request_id : string }>).length === 0) {
        const existing = await this.scanRequestModel.findByPk(dto.requestId, { transaction });
        if (!existing) throw new Error('Committed request claim could not be loaded');
        const response = await this.restoreRequest(dto, fingerprint, existing, startTime, transaction);
        return { response, station : null };
      }

      const credential = await this.credentialValidator.validateCredential(dto.qrPayload, transaction);
      if (!credential.isRecognized) {
        const reasonCode = credential.denialReason ?? 'UNRECOGNIZED_CREDENTIAL';
        const serverTimestamp = new Date();
        await this.scanRequestModel.update({ resultType : ScanResultType.REJECTED_NO_EVENT, reasonCode, serverTimestamp }, {
          where : { requestId : dto.requestId }, transaction,
        });
        return {
          response : {
            requestId : dto.requestId, accessDecision : AccessDecision.DENIED, reasonCode,
            controllerOutcome : ControllerOutcome.NOT_APPLICABLE, serverTimestamp,
            processingLatencyMs : Date.now() - startTime,
          } as AccessScanResponseDto,
          station : null,
        };
      }

      const denialReason = !credential.isValid ? credential.denialReason ?? 'INVALID_CREDENTIAL'
        : credential.employeeStatus !== UserStatus.ACTIVE ? 'INACTIVE_EMPLOYEE'
        : credential.factoryId !== station.factoryId ? 'UNAUTHORIZED_FACTORY_GATE'
        : null;

      if (denialReason) {
        const response = await this.persistAndReturnDenial(
          dto, station, credential.employeeId, credential.employeeName,
          denialReason, correlationId, startTime, transaction,
        );
        return { response, station : null };
      }

      const eventId         = crypto.randomUUID();
      const serverTimestamp = new Date();
      await this.accessEventModel.create({
        eventId,
        requestId         : dto.requestId,
        employeeId        : credential.employeeId!,
        employeeName      : credential.employeeName!,
        stationId         : station.stationCode,
        factoryId         : station.factoryId,
        direction         : station.direction,
        accessDecision    : AccessDecision.APPROVED,
        denialReason      : null,
        controllerOutcome : ControllerOutcome.CONTROLLER_PENDING,
        serverTimestamp,
        deviceTimestamp   : dto.deviceTimestamp ? new Date(dto.deviceTimestamp) : null,
        correlationId,
        policyVersion     : 'v1.0',
      }, { transaction });
      await this.scanRequestModel.update({
        resultType : ScanResultType.EVENT_RECORDED, eventId, serverTimestamp,
      }, { where : { requestId : dto.requestId }, transaction });

      const response : AccessScanResponseDto = {
        requestId : dto.requestId, accessDecision : AccessDecision.APPROVED, eventId,
        controllerOutcome : ControllerOutcome.CONTROLLER_PENDING, serverTimestamp,
        employeeId : credential.employeeId, employeeName : credential.employeeName,
        factoryId : station.factoryId, direction : station.direction,
        processingLatencyMs : Date.now() - startTime,
      };
      return { response, station };
    });

    if (!result.station || !result.response.eventId) return result.response;

    // Claim the single permitted controller attempt before any external side effect.
    const eventId = result.response.eventId;
    const [claimed] = await this.accessEventModel.update({
      dispatchClaimedAt : new Date(),
      controllerOutcome : ControllerOutcome.CONTROLLER_UNKNOWN,
    }, {
      where : {
        eventId,
        accessDecision    : AccessDecision.APPROVED,
        controllerOutcome : ControllerOutcome.CONTROLLER_PENDING,
        dispatchClaimedAt : null,
      },
    });

    if (claimed !== 1) {
      const current = await this.accessEventModel.findByPk(eventId);
      if (!current) throw new Error('Attendance event missing after dispatch claim');
      result.response.controllerOutcome = current.controllerOutcome;
      result.response.processingLatencyMs = Date.now() - startTime;
      return result.response;
    }

    let finalControllerOutcome = ControllerOutcome.CONTROLLER_UNKNOWN;
    try {
      const turnstileRes = await this.turnstileAdapter.unlockTurnstile({
        requestId : dto.requestId, eventId,
        controllerReference : result.station.stationCode,
        stationId : result.station.stationCode, direction : result.station.direction,
        timeoutMs : 800,
      });
      if (turnstileRes.result === TurnstileCommandResult.UNLOCK_CONFIRMED) {
        finalControllerOutcome = ControllerOutcome.CONTROLLER_CONFIRMED;
      } else if (turnstileRes.result === TurnstileCommandResult.MECHANICAL_FAULT) {
        finalControllerOutcome = ControllerOutcome.CONTROLLER_FAILED;
      }
    } catch (error) {
      this.logger.error(`Turnstile outcome uncertain: ${error instanceof Error ? error.message : String(error)}`);
    }

    if (finalControllerOutcome !== ControllerOutcome.CONTROLLER_UNKNOWN) {
      const [updated] = await this.accessEventModel.update({
        controllerOutcome : finalControllerOutcome,
      }, {
        where : { eventId, controllerOutcome : ControllerOutcome.CONTROLLER_UNKNOWN },
      });
      if (updated !== 1) throw new Error('Failed to persist definitive controller outcome');
    }

    result.response.controllerOutcome = finalControllerOutcome;
    result.response.processingLatencyMs = Date.now() - startTime;
    return result.response;
  }

  private async restoreRequest(
    dto : SubmitAccessScanDto, fingerprint : string, claim : AccessScanRequestModel,
    startTime : number, transaction? : Transaction,
  ) : Promise<AccessScanResponseDto> {
    if (claim.resultType === ScanResultType.LEGACY ||
        claim.stationId !== dto.stationId || claim.requestFingerprint !== fingerprint) {
      throw new ConflictException('REQUEST_ID_CONFLICT');
    }

    if (claim.resultType === ScanResultType.REJECTED_NO_EVENT) {
      return {
        requestId : dto.requestId, accessDecision : AccessDecision.DENIED,
        reasonCode : claim.reasonCode ?? 'UNRECOGNIZED_CREDENTIAL',
        controllerOutcome : ControllerOutcome.NOT_APPLICABLE,
        serverTimestamp : claim.serverTimestamp,
        processingLatencyMs : Date.now() - startTime, isCachedDuplicate : true,
      };
    }

    if (claim.resultType !== ScanResultType.EVENT_RECORDED || !claim.eventId) {
      throw new Error('Incomplete committed request claim');
    }

    const event = await this.accessEventModel.findByPk(claim.eventId, { transaction });
    if (!event) throw new Error('Attendance event referenced by a request is missing');

    return {
      requestId         : dto.requestId,
      accessDecision    : event.accessDecision,
      eventId           : event.eventId,
      reasonCode        : event.denialReason ?? undefined,
      controllerOutcome : event.controllerOutcome,
      serverTimestamp   : event.serverTimestamp,
      employeeId        : event.employeeId ?? undefined,
      employeeName      : event.employeeName ?? undefined,
      factoryId         : event.factoryId,
      direction         : event.direction,
      processingLatencyMs : Date.now() - startTime,
      isCachedDuplicate : true,
    };
  }

  private async persistAndReturnDenial(
    dto : SubmitAccessScanDto, station : GateStationContext,
    employeeId : string | undefined, employeeName : string | undefined,
    denialReason : string, correlationId : string, startTime : number,
    transaction : Transaction,
  ) : Promise<AccessScanResponseDto> {
    const eventId         = crypto.randomUUID();
    const serverTimestamp = new Date();
    await this.accessEventModel.create({
      eventId,
      requestId         : dto.requestId,
      employeeId        : employeeId ?? null,
      employeeName      : employeeName ?? null,
      stationId         : station.stationCode,
      factoryId         : station.factoryId,
      direction         : station.direction,
      accessDecision    : AccessDecision.DENIED,
      denialReason,
      controllerOutcome : ControllerOutcome.NOT_APPLICABLE,
      serverTimestamp,
      deviceTimestamp   : dto.deviceTimestamp ? new Date(dto.deviceTimestamp) : null,
      correlationId,
      policyVersion     : 'v1.0',
    }, { transaction });
    await this.scanRequestModel.update({
      resultType : ScanResultType.EVENT_RECORDED, eventId, serverTimestamp,
    }, { where : { requestId : dto.requestId }, transaction });

    return {
      requestId : dto.requestId, accessDecision : AccessDecision.DENIED, eventId, reasonCode : denialReason,
      controllerOutcome : ControllerOutcome.NOT_APPLICABLE, serverTimestamp,
      employeeId, employeeName, factoryId : station.factoryId, direction : station.direction,
      processingLatencyMs : Date.now() - startTime,
    };
  }

}
