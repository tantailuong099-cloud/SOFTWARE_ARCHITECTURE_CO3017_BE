import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  IsInt,
  IsBase64,
  Matches,
  Min,
  Max,
  ArrayMaxSize,
  ArrayMinSize,
  Equals,
  ValidateNested,
} from 'class-validator';
import { AccessDecision, ControllerOutcome } from '../model/access-event.model';
import { GateDirection } from '../../gate-station/model/gate-station.model';
import { FactoryId } from '../../users/model/user.model';

export class SubmitAccessScanDto {
  @IsString()
  @IsNotEmpty()
  requestId: string;

  @IsString()
  @IsNotEmpty()
  stationId: string;

  @IsString()
  @IsNotEmpty()
  qrPayload: string;

  @IsOptional()
  @IsDateString()
  deviceTimestamp?: string;
}

export class AccessScanResponseDto {
  requestId: string;
  accessDecision: AccessDecision;
  eventId?: string;
  reasonCode?: string;
  controllerOutcome: ControllerOutcome;
  serverTimestamp: Date;
  employeeId?: string;
  employeeName?: string;
  factoryId?: FactoryId;
  direction?: GateDirection;
  processingLatencyMs: number;
  isCachedDuplicate?: boolean;
}

export class QueryRawEventsDto {
  stationId?: string;
  factoryId?: FactoryId;
  employeeId?: string;
  accessDecision?: AccessDecision;
  startDate?: string;
  endDate?: string;
  limit?: number;
}

export class ExportHRBatchDto {
  reportingPeriod: string; // e.g. "2026-10"
}

export class OfflineAccessEventDto {
  @IsUUID()
  eventId : string;

  @IsUUID()
  requestId : string;

  @IsString()
  @IsNotEmpty()
  stationId : string;

  @IsString()
  @IsNotEmpty()
  employeeId : string;

  @IsDateString()
  deviceTimestamp : string;

  @IsEnum(AccessDecision)
  accessDecision : AccessDecision;

  @IsOptional()
  @IsString()
  denialReason? : string | null;

  @IsEnum(ControllerOutcome)
  controllerOutcome : ControllerOutcome;

  @IsString()
  @IsNotEmpty()
  policyVersion : string;

  @IsString()
  @IsNotEmpty()
  policySnapshotId : string;

  @IsInt()
  @Min(1)
  @Max(2147483647)
  journalSequence : number;

  @IsBase64()
  evidenceSignature : string;
}

export class SyncOfflineScansDto {
  @Equals(1)
  schemaVersion : number;

  @IsUUID()
  batchId : string;

  @IsString()
  @IsNotEmpty()
  stationId : string;

  @IsInt()
  @Min(1)
  @Max(25)
  eventCount : number;

  @Matches(/^sha256:[a-f0-9]{64}$/)
  payloadDigest : string;

  @IsBase64()
  batchSignature : string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(25)
  @ValidateNested({ each : true })
  @Type(() => OfflineAccessEventDto)
  events : OfflineAccessEventDto[];
}

export type OfflineSyncEventStatus = 'ACCEPTED' | 'DUPLICATE' | 'CONFLICT' | 'REJECTED';

export class SyncOfflineEventResultDto {
  eventId : string;
  status : OfflineSyncEventStatus;
  reasonCode? : string;
}

export class SyncOfflineResultDto {
  batchId : string;
  stationId : string;
  status : 'COMPLETE' | 'PARTIAL';
  totalReceived : number;
  acceptedCount : number;
  duplicateCount : number;
  conflictCount : number;
  rejectedCount : number;
  results : SyncOfflineEventResultDto[];
}
