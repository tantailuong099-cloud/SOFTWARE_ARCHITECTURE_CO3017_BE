import { Injectable, Logger } from '@nestjs/common';
import {
  ITurnstilePort,
  TurnstileCommandResult,
  TurnstileUnlockRequest,
  TurnstileUnlockResponse,
} from './turnstile.port';

@Injectable()
export class TurnstileSimulatorAdapter implements ITurnstilePort {
  private readonly logger = new Logger(TurnstileSimulatorAdapter.name);

  // Fault simulation flag for testing
  private simulatedFaultMode: TurnstileCommandResult | null = null;
  private simulatedDelayMs = 120; // 120ms typical hardware pulse delay

  setSimulatedFault(fault: TurnstileCommandResult | null) {
    this.simulatedFaultMode = fault;
  }

  setSimulatedDelay(delayMs: number) {
    this.simulatedDelayMs = delayMs;
  }

  async unlockTurnstile(request: TurnstileUnlockRequest): Promise<TurnstileUnlockResponse> {
    const startTime = Date.now();
    this.logger.log(
      `[Turnstile Command] Sending UNLOCK to ${request.controllerReference} (Station: ${request.stationId}, Direction: ${request.direction}, ReqId: ${request.requestId})`,
    );

    const timeoutMs = request.timeoutMs ?? 800;
    const delayMs   = this.simulatedDelayMs;
    await new Promise<void>((resolve) => setTimeout(resolve, Math.min(delayMs, timeoutMs)));
    const elapsed = Date.now() - startTime;

    // A timeout is uncertain: ending the wait does not cancel a physical command.
    if (delayMs >= timeoutMs) {
      this.logger.warn(`[Turnstile Command Timed Out] Event ${request.eventId} after ${elapsed}ms`);
      return {
        result             : TurnstileCommandResult.TIMEOUT_UNKNOWN,
        message            : 'Controller acknowledgement timed out',
        executionTimestamp : new Date(),
        latencyMs          : elapsed,
      };
    }

    if (this.simulatedFaultMode) {
      const faultResult = this.simulatedFaultMode;
      this.logger.warn(`[Turnstile Command Simulated Fault] Result: ${faultResult}`);
      return {
        result: faultResult,
        message: `Simulated controller condition: ${faultResult}`,
        executionTimestamp: new Date(),
        latencyMs: elapsed,
      };
    }

    // Default: Success
    this.logger.log(`[Turnstile Command Succeeded] Turnstile unlocked for Event ${request.eventId} in ${elapsed}ms`);
    return {
      result: TurnstileCommandResult.UNLOCK_CONFIRMED,
      message: 'Mechanical turnstile unlocked successfully',
      executionTimestamp: new Date(),
      latencyMs: elapsed,
    };
  }
}
