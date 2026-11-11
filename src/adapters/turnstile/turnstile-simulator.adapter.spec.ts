import { GateDirection } from '../../modules/gate-station/model/gate-station.model';
import { TurnstileCommandResult } from './turnstile.port';
import { TurnstileSimulatorAdapter } from './turnstile-simulator.adapter';

const request = {
  requestId : 'REQ-SIM-001', eventId : 'EVENT-SIM-001',
  controllerReference : 'BD-GATE-01', stationId : 'BD-GATE-01',
  direction : GateDirection.ENTRY, timeoutMs : 100,
};

describe('TurnstileSimulatorAdapter', () => {
  let adapter : TurnstileSimulatorAdapter;

  beforeEach(() => {
    adapter = new TurnstileSimulatorAdapter();
  });

  it('confirms a response within the timeout', async () => {
    adapter.setSimulatedDelay(10);
    const result = await adapter.unlockTurnstile(request);
    expect(result.result).toBe(TurnstileCommandResult.UNLOCK_CONFIRMED);
  });

  it('reports a definite mechanical fault within the timeout', async () => {
    adapter.setSimulatedDelay(10);
    adapter.setSimulatedFault(TurnstileCommandResult.MECHANICAL_FAULT);
    const result = await adapter.unlockTurnstile(request);
    expect(result.result).toBe(TurnstileCommandResult.MECHANICAL_FAULT);
  });

  it('returns an uncertain outcome at the timeout instead of waiting for the full delay', async () => {
    adapter.setSimulatedDelay(250);
    const start = Date.now();
    const result = await adapter.unlockTurnstile({ ...request, timeoutMs : 30 });
    expect(result.result).toBe(TurnstileCommandResult.TIMEOUT_UNKNOWN);
    expect(Date.now() - start).toBeLessThan(200);
  });

  it('treats a response exactly at the timeout boundary as unknown', async () => {
    adapter.setSimulatedDelay(20);
    const result = await adapter.unlockTurnstile({ ...request, timeoutMs : 20 });
    expect(result.result).toBe(TurnstileCommandResult.TIMEOUT_UNKNOWN);
  });

  it('preserves an explicit simulated unknown outcome', async () => {
    adapter.setSimulatedDelay(10);
    adapter.setSimulatedFault(TurnstileCommandResult.TIMEOUT_UNKNOWN);
    const result = await adapter.unlockTurnstile(request);
    expect(result.result).toBe(TurnstileCommandResult.TIMEOUT_UNKNOWN);
  });
});
