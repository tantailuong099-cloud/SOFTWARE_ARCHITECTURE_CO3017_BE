import { GateDirection } from '../../modules/gate-station/model/gate-station.model';

export enum TurnstileCommandResult {
  UNLOCK_CONFIRMED = 'UNLOCK_CONFIRMED',
  MECHANICAL_FAULT = 'MECHANICAL_FAULT',
  TIMEOUT_UNKNOWN = 'TIMEOUT_UNKNOWN',
}

export interface TurnstileUnlockRequest {
  requestId: string;
  eventId: string;
  controllerReference: string;
  stationId: string;
  direction: GateDirection;
  timeoutMs?: number;
}

export interface TurnstileUnlockResponse {
  result: TurnstileCommandResult;
  message?: string;
  executionTimestamp: Date;
  latencyMs: number;
}

export const TURNSTILE_PORT = 'TURNSTILE_PORT';

export interface ITurnstilePort {
  unlockTurnstile(request: TurnstileUnlockRequest): Promise<TurnstileUnlockResponse>;
}
