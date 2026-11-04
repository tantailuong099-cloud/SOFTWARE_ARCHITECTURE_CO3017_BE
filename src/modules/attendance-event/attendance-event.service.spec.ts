import { Test, TestingModule } from '@nestjs/testing';
import { AttendanceEventService } from './attendance-event.service';
import { UserQRService } from '../user-qr/user-qr.service';
import { GateStationService } from '../gate-station/gate-station.service';
import { TurnstileSimulatorAdapter } from '../../adapters/turnstile/turnstile-simulator.adapter';
import { TURNSTILE_PORT } from '../../adapters/turnstile/turnstile.port';
import { AccessDecision, ControllerOutcome } from './model/access-event.model';

describe('AttendanceEventService (Mission-Critical Gate Access - UC-03 & ADR-003)', () => {
  let service: AttendanceEventService;
  let userQRService: UserQRService;
  let gateStationService: GateStationService;
  let turnstileAdapter: TurnstileSimulatorAdapter;

  beforeEach(async () => {
    turnstileAdapter = new TurnstileSimulatorAdapter();
    userQRService = new UserQRService();
    gateStationService = new GateStationService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AttendanceEventService,
        { provide: UserQRService, useValue: userQRService },
        { provide: GateStationService, useValue: gateStationService },
        { provide: TURNSTILE_PORT, useValue: turnstileAdapter },
      ],
    }).compile();

    service = module.get<AttendanceEventService>(AttendanceEventService);
  });

  it('1. should APPROVE valid QR credential and confirm turnstile unlock (Binh Duong employee at Binh Duong gate)', async () => {
    const res = await service.submitAccessScan({
      requestId: 'REQ-TEST-001',
      stationId: 'BD-GATE-01',
      qrPayload: 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    });

    expect(res.accessDecision).toBe(AccessDecision.APPROVED);
    expect(res.controllerOutcome).toBe(ControllerOutcome.CONTROLLER_CONFIRMED);
    expect(res.employeeId).toBe('EMP-BD-001');
    expect(res.eventId).toBeDefined();
    expect(res.processingLatencyMs).toBeLessThan(2000); // NFR-PERF-01 <= 2.0s KPI
  });

  it('2. should enforce Idempotency (ADR-003): duplicate Request ID returns established result without second unlock', async () => {
    const firstRes = await service.submitAccessScan({
      requestId: 'REQ-IDEMPOTENT-001',
      stationId: 'BD-GATE-01',
      qrPayload: 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    });

    const secondRes = await service.submitAccessScan({
      requestId: 'REQ-IDEMPOTENT-001',
      stationId: 'BD-GATE-01',
      qrPayload: 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    });

    expect(secondRes.isCachedDuplicate).toBe(true);
    expect(secondRes.eventId).toBe(firstRes.eventId);
    expect(secondRes.accessDecision).toBe(firstRes.accessDecision);
  });

  it('3. should DENY expired QR credential (FR-UM-02 & ADR-002)', async () => {
    const res = await service.submitAccessScan({
      requestId: 'REQ-EXPIRED-001',
      stationId: 'BD-GATE-01',
      qrPayload: 'TMC:QR:EMP-BD-003:V1:SEC_EXPIRED_KEY_003',
    });

    expect(res.accessDecision).toBe(AccessDecision.DENIED);
    expect(res.reasonCode).toBe('CREDENTIAL_EXPIRED');
    expect(res.controllerOutcome).toBe(ControllerOutcome.NOT_APPLICABLE);
  });

  it('4. should DENY suspended QR credential (FR-UM-03)', async () => {
    const res = await service.submitAccessScan({
      requestId: 'REQ-SUSPENDED-001',
      stationId: 'BD-GATE-01',
      qrPayload: 'TMC:QR:EMP-BD-002:V1:SEC_SUSPENDED_KEY_002',
    });

    expect(res.accessDecision).toBe(AccessDecision.DENIED);
    expect(res.reasonCode).toBe('CREDENTIAL_SUSPENDED');
  });

  it('5. should DENY when employee is assigned to a different factory (Long An employee at Binh Duong gate)', async () => {
    const res = await service.submitAccessScan({
      requestId: 'REQ-WRONG-FACTORY-001',
      stationId: 'BD-GATE-01', // Binh Duong gate
      qrPayload: 'TMC:QR:EMP-LA-001:V1:SEC_VALID_KEY_LA01', // Long An employee
    });

    expect(res.accessDecision).toBe(AccessDecision.DENIED);
    expect(res.reasonCode).toBe('UNAUTHORIZED_FACTORY_GATE');
  });

  it('6. should reject unrecognized QR payload without creating raw attendance events (FR-AE-03)', async () => {
    const res = await service.submitAccessScan({
      requestId: 'REQ-UNRECOGNIZED-001',
      stationId: 'BD-GATE-01',
      qrPayload: 'SOME_RANDOM_BARCODE_STRING',
    });

    expect(res.accessDecision).toBe(AccessDecision.DENIED);
    expect(res.reasonCode).toBe('UNRECOGNIZED_CREDENTIAL');
    expect(res.eventId).toBeUndefined(); // No raw event created
  });

  it('7. should reject requests from disabled or unknown gate stations (FR-GS-02)', async () => {
    const res = await service.submitAccessScan({
      requestId: 'REQ-DISABLED-STATION-001',
      stationId: 'BD-MAINT-01', // Disabled station
      qrPayload: 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    });

    expect(res.accessDecision).toBe(AccessDecision.DENIED);
    expect(res.reasonCode).toBe('STATION_DISABLED');
  });

  // --- M2 Enhancement Tests: Dynamic QR & Offline Synchronization ---
  it('8. [M2-Issue 2] should APPROVE valid dynamic rotating QR code (ADR-007)', async () => {
    const dynamicCred = await userQRService.generateDynamicQR('EMP-BD-001');
    const res = await service.submitAccessScan({
      requestId: 'REQ-DYN-001',
      stationId: 'BD-GATE-01',
      qrPayload: dynamicCred.qrPayload,
    });

    expect(res.accessDecision).toBe(AccessDecision.APPROVED);
    expect(res.controllerOutcome).toBe(ControllerOutcome.CONTROLLER_CONFIRMED);
    expect(res.employeeId).toBe('EMP-BD-001');
  });

  it('9. [M2-Issue 2] should REJECT dynamic QR replay attack with the same nonce (ADR-007 Anti-Spoofing)', async () => {
    const dynamicCred = await userQRService.generateDynamicQR('EMP-BD-001');
    // First scan succeeds
    await service.submitAccessScan({
      requestId: 'REQ-DYN-FIRST',
      stationId: 'BD-GATE-01',
      qrPayload: dynamicCred.qrPayload,
    });

    // Second scan with same payload but different requestId simulates replay attack (e.g. shared photo)
    const replayRes = await service.submitAccessScan({
      requestId: 'REQ-DYN-SECOND-REPLAY',
      stationId: 'BD-GATE-01',
      qrPayload: dynamicCred.qrPayload,
    });

    expect(replayRes.accessDecision).toBe(AccessDecision.DENIED);
    expect(replayRes.reasonCode).toBe('DYNAMIC_QR_REPLAY_ATTACK');
  });

  it('10. [M2-Issue 1] should process offline synchronized scan batches idempotently (ADR-008)', async () => {
    const syncResult = await service.syncOfflineScans({
      stationId: 'BD-GATE-01',
      syncTimestamp: new Date().toISOString(),
      scans: [
        {
          requestId: 'REQ-OFFLINE-001',
          stationId: 'BD-GATE-01',
          qrPayload: 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
          deviceTimestamp: new Date().toISOString(),
        },
        {
          requestId: 'REQ-OFFLINE-002',
          stationId: 'BD-GATE-01',
          qrPayload: 'TMC:QR:EMP-BD-003:V1:SEC_EXPIRED_KEY_003',
          deviceTimestamp: new Date().toISOString(),
        },
      ],
    });

    expect(syncResult.totalReceived).toBe(2);
    expect(syncResult.processedCount).toBe(2);
    expect(syncResult.duplicateCount).toBe(0);
    expect(syncResult.results[0].accessDecision).toBe(AccessDecision.APPROVED);
    expect(syncResult.results[1].accessDecision).toBe(AccessDecision.DENIED);

    // Re-syncing the exact same batch must be idempotent (zero new events)
    const reSyncResult = await service.syncOfflineScans({
      stationId: 'BD-GATE-01',
      syncTimestamp: new Date().toISOString(),
      scans: [
        {
          requestId: 'REQ-OFFLINE-001',
          stationId: 'BD-GATE-01',
          qrPayload: 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
          deviceTimestamp: new Date().toISOString(),
        },
      ],
    });

    expect(reSyncResult.duplicateCount).toBe(1);
    expect(reSyncResult.processedCount).toBe(0);
  });
});
