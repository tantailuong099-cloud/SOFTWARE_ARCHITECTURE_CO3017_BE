import { AccessDecision, ControllerOutcome } from '../model/access-event.model';
import { GateDirection } from '../../gate-station/model/gate-station.model';
import { FactoryId } from '../../user-qr/model/employee.model';

export class SubmitAccessScanDto {
  requestId: string;
  stationId: string;
  qrPayload: string;
  deviceTimestamp?: string;
  apiKey?: string;
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
  requestId: string;
  stationId: string;
  qrPayload: string;
  deviceTimestamp: string;
  apiKey?: string;
  offlineDecision?: AccessDecision;
}

export class SyncOfflineScansDto {
  stationId: string;
  scans: OfflineScanItemDto[];
  syncTimestamp: string;
}

export class SyncOfflineResultDto {
  stationId: string;
  totalReceived: number;
  processedCount: number;
  duplicateCount: number;
  results: AccessScanResponseDto[];
}
