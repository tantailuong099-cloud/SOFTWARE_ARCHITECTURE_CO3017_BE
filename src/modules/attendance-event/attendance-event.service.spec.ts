import { Test, TestingModule } from '@nestjs/testing';
import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { getModelToken } from '@nestjs/sequelize';
import { AttendanceEventService } from './attendance-event.service';
import { UserQRService } from '../user-qr/user-qr.service';
import { GateStationService } from '../gate-station/gate-station.service';
import { TurnstileSimulatorAdapter } from '../../adapters/turnstile/turnstile-simulator.adapter';
import { TURNSTILE_PORT } from '../../adapters/turnstile/turnstile.port';
import { AccessDecision, AccessEventModel, ControllerOutcome } from './model/access-event.model';
import { FactoryId } from '../users/model/user.model';
import { AccessScanRequestModel, ScanResultType } from './model/access-scan-request.model';
import { GateDirection } from '../gate-station/model/gate-station.model';

// Jest needs the injection token but cannot load the package's ESM entrypoint.
jest.mock('@nestjs/sequelize', () => {
  const { Inject } = jest.requireActual('@nestjs/common');
  return {
    InjectModel : (model : { name : string }) => Inject(`${model.name}Repository`),
    getModelToken : (model : { name : string }) => `${model.name}Repository`,
  };
});

describe('AttendanceEventService (Mission-Critical Gate Access - UC-03 & ADR-003)', () => {
  let service : AttendanceEventService;
  let userQRService : UserQRService;
  let gateStationService : GateStationService;
  let turnstileAdapter : TurnstileSimulatorAdapter;
  let eventModel : { create : jest.Mock; update : jest.Mock; findAll : jest.Mock; findByPk : jest.Mock; sequelize : any };
  let requestModel : { findByPk : jest.Mock; update : jest.Mock };
  let savedEvents : Array<Record<string, any>>;
  let savedRequests : Map<string, Record<string, any>>;
  const originalDbSetting = process.env.ENABLE_DB;

  afterAll(() => {
    if (originalDbSetting === undefined) delete process.env.ENABLE_DB;
    else process.env.ENABLE_DB = originalDbSetting;
  });

  beforeEach(async () => {
    process.env.ENABLE_DB = 'false';
    turnstileAdapter = new TurnstileSimulatorAdapter();
    userQRService = new UserQRService();

    gateStationService = {
      validateActiveStation : jest.fn(async (stationId : string) => {
        if (stationId === 'BD-MAINT-01') throw new ForbiddenException('STATION_INACTIVE');
        if (stationId !== 'BD-GATE-01') throw new NotFoundException('STATION_NOT_FOUND');
        return {
          stationCode : stationId,
          factoryId   : FactoryId.BINH_DUONG,
          direction   : GateDirection.ENTRY,
        };
      }),
    } as unknown as GateStationService;

    savedEvents = [];
    savedRequests = new Map();
    let transactionQueue = Promise.resolve();
    const database = {
      query : jest.fn(async (_sql : string, options : any) => {
        const { requestId, stationId, fingerprint } = options.replacements;
        const claims = options.transaction.claims as Map<string, Record<string, any>>;
        if (savedRequests.has(requestId) || claims.has(requestId)) return [[], {}];
        claims.set(requestId, {
          requestId, stationId, requestFingerprint : fingerprint, resultType : null,
          eventId : null, reasonCode : null, serverTimestamp : new Date(),
        });
        return [[{ request_id : requestId }], {}];
      }),
      transaction : jest.fn(async (callback : (transaction : any) => Promise<any>) => {
        // Serialize fake transactions; database-level concurrency is checked separately against PostgreSQL.
        let release : () => void = () => {};
        const current = new Promise<void>((resolve) => { release = resolve; });
        const previous = transactionQueue;
        transactionQueue = current;
        await previous;
        const before = savedEvents.map((event) => ({ ...event }));
        const transaction = { claims : new Map<string, Record<string, any>>(), LOCK : { UPDATE : 'UPDATE' } };
        try {
          const result = await callback(transaction);
          for (const [requestId, claim] of transaction.claims) savedRequests.set(requestId, claim);
          return result;
        } catch (error) {
          savedEvents = before;
          throw error;
        } finally {
          release();
        }
      }),
    };

    eventModel = {
      sequelize : database,
      create : jest.fn(async (values : Record<string, any>) => {
        savedEvents.push({ ...values });
        return values;
      }),
      update : jest.fn(async (values : Record<string, any>, options : { where : { eventId : string } }) => {
        const event = savedEvents.find((item) => item.eventId === options.where.eventId);
        if (event) Object.assign(event, values);
        return [event ? 1 : 0];
      }),
      findByPk : jest.fn(async (eventId : string) => savedEvents.find((event) => event.eventId === eventId) ?? null),
      findAll : jest.fn(async (options? : { where? : Record<string, string>; limit? : number }) => {
        const where = options?.where ?? {};
        const matching = savedEvents.filter((item) => Object.entries(where).every(([key, value]) => item[key] === value));
        matching.sort((a, b) => b.serverTimestamp.getTime() - a.serverTimestamp.getTime());
        return matching.slice(0, options?.limit ?? matching.length);
      }),
    };
    requestModel = {
      findByPk : jest.fn(async (requestId : string, options? : { transaction? : any }) => {
        return options?.transaction?.claims.get(requestId) ?? savedRequests.get(requestId) ?? null;
      }),
      update : jest.fn(async (values : Record<string, any>, options : { where : { requestId : string }; transaction : any }) => {
        const record = options.transaction.claims.get(options.where.requestId);
        if (record) Object.assign(record, values);
        return [record ? 1 : 0];
      }),
    };

    const module : TestingModule = await Test.createTestingModule({
      providers : [
        AttendanceEventService,
        { provide : UserQRService, useValue : userQRService },
        { provide : GateStationService, useValue : gateStationService },
        { provide : TURNSTILE_PORT, useValue : turnstileAdapter },
        { provide : getModelToken(AccessEventModel), useValue : eventModel },
        { provide : getModelToken(AccessScanRequestModel), useValue : requestModel },
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
    expect(res.reasonCode).toBe('STATION_INACTIVE');
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
    const deviceTimestamp = new Date().toISOString();
    const syncResult = await service.syncOfflineScans({
      stationId: 'BD-GATE-01',
      syncTimestamp: new Date().toISOString(),
      scans: [
        {
          requestId: 'REQ-OFFLINE-001',
          stationId: 'BD-GATE-01',
          qrPayload: 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
          deviceTimestamp,
        },
        {
          requestId: 'REQ-OFFLINE-002',
          stationId: 'BD-GATE-01',
          qrPayload: 'TMC:QR:EMP-BD-003:V1:SEC_EXPIRED_KEY_003',
          deviceTimestamp,
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
          deviceTimestamp,
        },
      ],
    });

    expect(reSyncResult.duplicateCount).toBe(1);
    expect(reSyncResult.processedCount).toBe(0);
  });

  it('11. persists approved and denied events through the Sequelize model', async () => {
    await service.submitAccessScan({
      requestId : 'REQ-DB-APPROVED', stationId : 'BD-GATE-01',
      qrPayload : 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    });
    await service.submitAccessScan({
      requestId : 'REQ-DB-DENIED', stationId : 'BD-GATE-01',
      qrPayload : 'TMC:QR:EMP-BD-002:V1:SEC_SUSPENDED_KEY_002',
    });

    expect(eventModel.create).toHaveBeenCalledTimes(2);
    expect(savedEvents).toHaveLength(2);
    expect(savedEvents[0].controllerOutcome).toBe(ControllerOutcome.CONTROLLER_CONFIRMED);
    expect(savedEvents[1].accessDecision).toBe(AccessDecision.DENIED);

    const recent = await service.getRecentEvents('BD-GATE-01');
    const queried = await service.queryEvents({ stationId : 'BD-GATE-01' });
    expect(recent).toHaveLength(2);
    expect(queried.total).toBe(2);
    expect(queried.approved).toBe(1);
    expect(queried.denied).toBe(1);
  });

  it('12. does not unlock when event creation fails', async () => {
    eventModel.create.mockRejectedValueOnce(new Error('DATABASE_WRITE_FAILED'));
    const unlock = jest.spyOn(turnstileAdapter, 'unlockTurnstile');

    await expect(service.submitAccessScan({
      requestId : 'REQ-DB-FAILED', stationId : 'BD-GATE-01',
      qrPayload : 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    })).rejects.toThrow('DATABASE_WRITE_FAILED');

    expect(unlock).not.toHaveBeenCalled();
  });

  it('13. rejects conflicting reuse of a Request ID', async () => {
    const initial = {
      requestId : 'REQ-CONFLICT', stationId : 'BD-GATE-01',
      qrPayload : 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    };
    await service.submitAccessScan(initial);
    const unlock = jest.spyOn(turnstileAdapter, 'unlockTurnstile');
    await expect(service.submitAccessScan({
      ...initial, qrPayload : 'TMC:QR:EMP-BD-002:V1:SEC_SUSPENDED_KEY_002',
    })).rejects.toThrow(ConflictException);
    await expect(service.submitAccessScan({ ...initial, stationId : 'OTHER-STATION' })).rejects.toThrow(ConflictException);
    expect(savedEvents).toHaveLength(1);
    expect(unlock).not.toHaveBeenCalled();
  });

  it('14. stores unrecognized requests without attendance events', async () => {
    const request = { requestId : 'REQ-NO-EVENT', stationId : 'BD-GATE-01', qrPayload : 'NOT_A_COMPANY_QR' };
    const first = await service.submitAccessScan(request);
    const second = await service.submitAccessScan(request);
    expect(first.eventId).toBeUndefined();
    expect(second.isCachedDuplicate).toBe(true);
    expect(second.reasonCode).toBe(first.reasonCode);
    expect(savedEvents).toHaveLength(0);
    expect(savedRequests.get(request.requestId)?.resultType).toBe(ScanResultType.REJECTED_NO_EVENT);
  });

  it('15. rolls back the claim when attendance insertion fails', async () => {
    const request = {
      requestId : 'REQ-ROLLBACK', stationId : 'BD-GATE-01',
      qrPayload : 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    };
    eventModel.create.mockRejectedValueOnce(new Error('DATABASE_WRITE_FAILED'));
    await expect(service.submitAccessScan(request)).rejects.toThrow('DATABASE_WRITE_FAILED');
    expect(savedRequests.has(request.requestId)).toBe(false);
    const retry = await service.submitAccessScan(request);
    expect(retry.accessDecision).toBe(AccessDecision.APPROVED);
  });

  it('16. resolves concurrent retries with one attendance event and one unlock', async () => {
    const request = {
      requestId : 'REQ-CONCURRENT', stationId : 'BD-GATE-01',
      qrPayload : 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    };
    const unlock = jest.spyOn(turnstileAdapter, 'unlockTurnstile');
    const [first, second] = await Promise.all([service.submitAccessScan(request), service.submitAccessScan(request)]);
    expect(first.eventId).toBe(second.eventId);
    expect(first.isCachedDuplicate || second.isCachedDuplicate).toBe(true);
    expect(savedEvents).toHaveLength(1);
    expect(unlock).toHaveBeenCalledTimes(1);
  });

  it('17. recovers request identity from shared persistence after service recreation', async () => {
    const request = {
      requestId : 'REQ-RESTART', stationId : 'BD-GATE-01',
      qrPayload : 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    };
    const first = await service.submitAccessScan(request);
    const recreated = new AttendanceEventService(
      userQRService, gateStationService, turnstileAdapter,
      eventModel as unknown as typeof AccessEventModel,
      requestModel as unknown as typeof AccessScanRequestModel,
    );
    const unlock = jest.spyOn(turnstileAdapter, 'unlockTurnstile');
    const second = await recreated.submitAccessScan(request);
    expect(second.eventId).toBe(first.eventId);
    expect(second.isCachedDuplicate).toBe(true);
    expect(unlock).not.toHaveBeenCalled();
  });

  it('18. rejects legacy backfilled Request IDs without redispatch', async () => {
    savedRequests.set('REQ-STAGE1', {
      requestId : 'REQ-STAGE1', stationId : 'BD-GATE-01',
      requestFingerprint : null, resultType : ScanResultType.LEGACY, eventId : 'EVENT-STAGE1',
    });
    const unlock = jest.spyOn(turnstileAdapter, 'unlockTurnstile');
    await expect(service.submitAccessScan({
      requestId : 'REQ-STAGE1', stationId : 'BD-GATE-01',
      qrPayload : 'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
    })).rejects.toThrow(ConflictException);
    expect(unlock).not.toHaveBeenCalled();
  });

  it('19. uses a caller-owned transaction for dynamic QR consumption', async () => {
    const jwt = require('jsonwebtoken');
    const transaction = { LOCK : { UPDATE : 'UPDATE' } };
    const presentation = {
      consumedAt : null, expiresAt : new Date(Date.now() + 60_000), save : jest.fn(async () => {}),
    };
    const presentationModel = { findOne : jest.fn(async () => presentation) };
    const credentialModel = { findByPk : jest.fn(async () => ({
      id : '10', status : 'ACTIVE', userId : '20',
    })) };
    const userModel = { findByPk : jest.fn(async () => ({
      id : '20', fullName : 'Test Employee', factoryId : FactoryId.BINH_DUONG, status : 'ACTIVE',
    })) };
    Object.assign(userQRService, { presentationModel, credentialModel, userModel });
    const token = jwt.sign({
      type : 'QR_PRESENTATION', jti : 'JTI-TEST', sub : '20', credentialId : '10',
    }, process.env.QR_JWT_SECRET || 'tmc_dynamic_qr_secret_2026', { expiresIn : 60 });

    const result = await userQRService.validateCredential(token, transaction as any);
    expect(result.isValid).toBe(true);
    expect(presentationModel.findOne).toHaveBeenCalledWith(expect.objectContaining({ transaction }));
    expect(presentation.save).toHaveBeenCalledWith({ transaction });

    presentationModel.findOne.mockRejectedValueOnce(new Error('DATABASE_UNAVAILABLE'));
    await expect(userQRService.validateCredential(token, transaction as any)).rejects.toThrow('DATABASE_UNAVAILABLE');
  });
});
