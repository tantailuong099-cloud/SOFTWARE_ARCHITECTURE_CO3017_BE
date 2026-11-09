import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
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

export class OfflineScanItemDto {
  @IsString()
  @IsNotEmpty()
  requestId: string;

  @IsString()
  @IsNotEmpty()
  stationId: string;

  @IsString()
  @IsNotEmpty()
  qrPayload: string;

  @IsDateString()
  deviceTimestamp: string;

  @IsOptional()
  @IsEnum(AccessDecision)
  offlineDecision?: AccessDecision;
}

export class SyncOfflineScansDto {
  @IsString()
  @IsNotEmpty()
  stationId: string;

  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => OfflineScanItemDto)
  scans: OfflineScanItemDto[];

  @IsDateString()
  syncTimestamp: string;
}

export class SyncOfflineResultDto {
  stationId: string;
  totalReceived: number;
  processedCount: number;
  duplicateCount: number;
  results: AccessScanResponseDto[];
}
