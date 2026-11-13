import { GateDirection } from '../../modules/gate-station/model/gate-station.model';
import { TurnstileSimulatorAdapter } from './turnstile-simulator.adapter';
import {
  ITurnstilePort,
  TurnstileCommandResult,
  TurnstileUnlockRequest,
} from './turnstile.port';

class DeterministicTurnstile implements ITurnstilePort {
  constructor(
    private readonly delay: number,
    private readonly mechanicalFault: boolean,
  ) {}

  async unlockTurnstile(request: TurnstileUnlockRequest) {
    const latencyMs = Math.min(this.delay, request.timeoutMs ?? 800);
    const result =
      this.delay >= (request.timeoutMs ?? 800)
        ? TurnstileCommandResult.TIMEOUT_UNKNOWN
        : this.mechanicalFault
          ? TurnstileCommandResult.MECHANICAL_FAULT
          : TurnstileCommandResult.UNLOCK_CONFIRMED;
    return { result, latencyMs, executionTimestamp: new Date() };
  }
}

function turnstileContract(
  name: string,
  create: (delay: number, fault: boolean) => ITurnstilePort,
) {
  describe(name, () => {
    it.each([
      [1, false, TurnstileCommandResult.UNLOCK_CONFIRMED],
      [1, true, TurnstileCommandResult.MECHANICAL_FAULT],
      [15, true, TurnstileCommandResult.TIMEOUT_UNKNOWN],
    ] as const)(
      'reports delay=%ims fault=%s as %s',
      async (delay, fault, result) => {
        const adapter = create(delay, fault);
        const response = await adapter.unlockTurnstile({
          requestId: 'contract-request',
          eventId: 'contract-event',
          stationId: 'BD-GATE-01',
          controllerReference: 'BD-GATE-01',
          direction: GateDirection.ENTRY,
          timeoutMs: 10,
        });
        expect(response).toMatchObject({
          result,
          executionTimestamp: expect.any(Date),
          latencyMs: expect.any(Number),
        });
        expect(response.latencyMs).toBeGreaterThanOrEqual(0);
      },
    );
  });
}

turnstileContract('Turnstile simulator contract', (delay, fault) => {
  const adapter = new TurnstileSimulatorAdapter();
  adapter.setSimulatedDelay(delay);
  if (fault) adapter.setSimulatedFault(TurnstileCommandResult.MECHANICAL_FAULT);
  return adapter;
});
turnstileContract(
  'Deterministic turnstile contract',
  (delay, fault) => new DeterministicTurnstile(delay, fault),
);
