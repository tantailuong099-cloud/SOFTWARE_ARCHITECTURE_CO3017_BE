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

    // Simulate network & mechanical communication delay
    await new Promise((resolve) => setTimeout(resolve, this.simulatedDelayMs));
    const elapsed = Date.now() - startTime;

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
