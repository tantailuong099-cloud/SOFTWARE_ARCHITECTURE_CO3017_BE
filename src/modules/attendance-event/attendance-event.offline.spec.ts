import * as crypto from 'crypto';
import { BadRequestException, ConflictException, ForbiddenException, ServiceUnavailableException } from '@nestjs/common';
import { AttendanceEventService } from './attendance-event.service';
import { AccessDecision, ControllerOutcome } from './model/access-event.model';
import { canonicalOfflineBatch, canonicalOfflineEvent, sha256Hex } from './offline-evidence';
import type { OfflineAccessEventDto, SyncOfflineScansDto } from './dto/access-event.dto';
import { FactoryId } from '../users/model/user.model';
import { GateDirection } from '../gate-station/model/gate-station.model';

jest.mock('@nestjs/sequelize', () => {
  const { Inject } = jest.requireActual('@nestjs/common');
  return { InjectModel : (model : { name : string }) => Inject(`${model.name}Repository`) };
});

describe('Offline historical batch import', () => {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const publicKeyPem = publicKey.export({ type : 'spki', format : 'pem' }).toString();
  const originalTrust = process.env.OFFLINE_SYNC_TRUST_JSON;
  let service : AttendanceEventService;
  let unlock : jest.Mock;
  let validateQR : jest.Mock;
  let records : Map<string, any>;
  let claims : Map<string, any>;
  let batches : Map<string, any>;
  let db : any;
  let eventModel : any;
  let requestModel : any;
  let batchModel : any;

  const sign = (content : string) => crypto.sign(null, Buffer.from(content), privateKey).toString('base64');
  const event = (changes : Partial<OfflineAccessEventDto> = {}) : OfflineAccessEventDto => {
    const candidate : OfflineAccessEventDto = {
      eventId : crypto.randomUUID(), requestId : crypto.randomUUID(), stationId : 'BD-GATE-01',
      employeeId : 'EMP-BD-001', deviceTimestamp : new Date().toISOString(),
      accessDecision : AccessDecision.APPROVED, controllerOutcome : ControllerOutcome.CONTROLLER_CONFIRMED,
      policyVersion : 'v1.0', policySnapshotId : 'TEST-SNAPSHOT', journalSequence : 100,
      evidenceSignature : '', ...changes,
    };
    candidate.evidenceSignature = sign(canonicalOfflineEvent(candidate));
    return candidate;
  };
  const batch = (events : OfflineAccessEventDto[], batchId = crypto.randomUUID()) : SyncOfflineScansDto => {
    const candidate : SyncOfflineScansDto = {
      schemaVersion : 1, batchId, stationId : 'BD-GATE-01', eventCount : events.length,
      events, payloadDigest : '', batchSignature : '',
    };
    const canonical = canonicalOfflineBatch(candidate);
    candidate.payloadDigest = `sha256:${sha256Hex(canonical)}`;
    candidate.batchSignature = sign(canonical);
    return candidate;
  };

  beforeEach(() => {
    process.env.OFFLINE_SYNC_TRUST_JSON = JSON.stringify({
      'BD-GATE-01' : {
        publicKeyPem,
        policies : {
          'TEST-SNAPSHOT' : {
            validFrom : new Date(Date.now() - 86400000).toISOString(),
            validUntil : new Date(Date.now() + 86400000).toISOString(),
            factoryId : 'BINH_DUONG', direction : 'ENTRY', policyVersion : 'v1.0',
            allowedEmployeeIds : ['EMP-BD-001'],
          },
        },
      },
    });
    records = new Map();
    claims = new Map();
    batches = new Map();
    unlock = jest.fn();
    validateQR = jest.fn();
    let previous = Promise.resolve();
    db = {
      transaction : jest.fn(async (callback : (tx : any) => Promise<unknown>) => {
        let release : () => void = () => {};
        const active = new Promise<void>((resolve) => { release = resolve; });
        const waiting = previous;
        previous = active;
        await waiting;
        const snapshot = [new Map(records), new Map(claims), new Map(batches)];
        try { return await callback({}); }
        catch (error) {
          [records, claims, batches] = snapshot as [Map<string, any>, Map<string, any>, Map<string, any>];
          throw error;
        } finally { release(); }
      }),
      query : jest.fn(async (sql : string, options : any) => {
        const args = options.replacements;
        if (sql.includes('INSERT INTO offline_sync_batches')) {
          if (batches.has(args.batchId)) return [[], {}];
          batches.set(args.batchId, { batchId : args.batchId, stationId : args.stationId,
            payloadDigest : args.digest, eventCount : args.eventCount, resultsJson : [] });
          return [[{ batch_id : args.batchId }], {}];
        }
        if (sql.includes('INSERT INTO access_scan_requests')) {
          if (claims.has(args.requestId)) return [[], {}];
          claims.set(args.requestId, { requestId : args.requestId, resultType : null, eventId : null });
          return [[{ request_id : args.requestId }], {}];
        }
        if (sql.includes('INSERT INTO access_events')) {
          const collision = records.has(args.eventId) || [...records.values()].some((entry) =>
            entry.stationId === args.stationId && entry.offlineJournalSequence === String(args.sequence));
          if (collision) return [[], {}];
          records.set(args.eventId, {
            eventId : args.eventId, requestId : args.requestId, eventSource : 'OFFLINE_EDGE',
            offlineEventDigest : args.eventDigest, offlineJournalSequence : String(args.sequence),
            stationId : args.stationId, accessDecision : args.decision, controllerOutcome : args.outcome,
            dispatchClaimedAt : null, deviceTimestamp : args.deviceTimestamp,
          });
          return [[{ event_id : args.eventId }], {}];
        }
        if (sql.includes('DELETE FROM access_scan_requests')) {
          if (claims.get(args.requestId)?.resultType === null) claims.delete(args.requestId);
          return [[], {}];
        }
        throw new Error(`Unexpected SQL: ${sql}`);
      }),
    };
    eventModel = {
      sequelize : db,
      findByPk : jest.fn(async (id : string) => records.get(id) ?? null),
    };
    requestModel = {
      findByPk : jest.fn(async (id : string) => claims.get(id) ?? null),
      update : jest.fn(async (values : any, options : any) => {
        const claim = claims.get(options.where.requestId);
        if (claim) Object.assign(claim, values);
        return [claim ? 1 : 0];
      }),
    };
    batchModel = {
      findByPk : jest.fn(async (id : string) => batches.get(id) ?? null),
      update : jest.fn(async (values : any, options : any) => {
        const stored = batches.get(options.where.batchId);
        if (stored) Object.assign(stored, values);
        return [stored ? 1 : 0];
      }),
    };
    const station : any = { stationCode : 'BD-GATE-01', factoryId : FactoryId.BINH_DUONG, direction : GateDirection.ENTRY };
    service = new AttendanceEventService(
      { validateActiveStation : jest.fn(async () => station) } as any,
      eventModel, requestModel, batchModel,
    );
  });

  afterAll(() => {
    if (originalTrust === undefined) delete process.env.OFFLINE_SYNC_TRUST_JSON;
    else process.env.OFFLINE_SYNC_TRUST_JSON = originalTrust;
  });

  it('imports signed historical evidence with no QR consumption or controller calls', async () => {
    const offlineEvent = event();
    const response = await service.syncOfflineScans(batch([offlineEvent]));
    expect(response.acceptedCount).toBe(1);
    expect(response.status).toBe('COMPLETE');
    expect(records.get(offlineEvent.eventId)?.dispatchClaimedAt).toBeNull();
    expect(claims.get(offlineEvent.requestId)?.eventId).toBe(offlineEvent.eventId);
    expect(unlock).not.toHaveBeenCalled();
    expect(validateQR).not.toHaveBeenCalled();
  });

  it('returns stable acknowledgements for an identical batch retry', async () => {
    const original = batch([event()]);
    const first = await service.syncOfflineScans(original);
    const second = await service.syncOfflineScans(original);
    expect(second).toEqual(first);
    expect(records.size).toBe(1);
    expect(unlock).not.toHaveBeenCalled();
  });

  it('rejects a reused batch ID with different signed content', async () => {
    const first = batch([event()]);
    await service.syncOfflineScans(first);
    await expect(service.syncOfflineScans(batch([event({ journalSequence : 101 })], first.batchId)))
      .rejects.toThrow(ConflictException);
    expect(records.size).toBe(1);
  });

  it('deduplicates the same event across distinct batches', async () => {
    const original = event();
    await service.syncOfflineScans(batch([original]));
    const retry = await service.syncOfflineScans(batch([original]));
    expect(retry.duplicateCount).toBe(1);
    expect(retry.acceptedCount).toBe(0);
    expect(records.size).toBe(1);
  });

  it('returns partial acknowledgements for mixed accepted, duplicate and request conflicts', async () => {
    const initial = event();
    const previous = event({ journalSequence : 101 });
    await service.syncOfflineScans(batch([initial, previous]));
    const newEvent = event({ journalSequence : 102 });
    const reused = event({ requestId : previous.requestId, journalSequence : 103 });
    const result = await service.syncOfflineScans(batch([initial, newEvent, reused]));
    expect(result.acceptedCount).toBe(1);
    expect(result.duplicateCount).toBe(1);
    expect(result.conflictCount).toBe(1);
    expect(result.status).toBe('PARTIAL');
    expect(records.size).toBe(3);
  });

  it('rejects a colliding journal sequence and does not reserve the new Request ID', async () => {
    const initial = event();
    await service.syncOfflineScans(batch([initial]));
    const competing = event();
    const response = await service.syncOfflineScans(batch([competing]));
    expect(response.conflictCount).toBe(1);
    expect(claims.has(competing.requestId)).toBe(false);
  });

  it('rejects invalid event signatures without persisting attendance evidence', async () => {
    const modified = event();
    modified.evidenceSignature = Buffer.from('invalid').toString('base64');
    const response = await service.syncOfflineScans(batch([modified]));
    expect(response.rejectedCount).toBe(1);
    expect(records.size).toBe(0);
  });

  it('rejects invalid batch signatures before using the database', async () => {
    const signed = batch([event()]);
    signed.batchSignature = Buffer.from('invalid').toString('base64');
    await expect(service.syncOfflineScans(signed)).rejects.toThrow(ForbiddenException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('rejects imports if no trusted station key and policy are configured', async () => {
    delete process.env.OFFLINE_SYNC_TRUST_JSON;
    await expect(service.syncOfflineScans(batch([event()]))).rejects.toThrow(ServiceUnavailableException);
    expect(db.transaction).not.toHaveBeenCalled();
  });

  it('does not import events outside the approved offline policy', async () => {
    const oldEvent = event({ employeeId : 'UNLISTED' });
    const response = await service.syncOfflineScans(batch([oldEvent]));
    expect(response.rejectedCount).toBe(1);
    expect(records.size).toBe(0);
  });

  it('rejects a malformed batch count and reused event IDs inside one batch', async () => {
    const original = event();
    await expect(service.syncOfflineScans(batch([original, original]))).rejects.toThrow(BadRequestException);
    const invalid = batch([original]);
    invalid.eventCount = 2;
    await expect(service.syncOfflineScans(invalid)).rejects.toThrow(BadRequestException);
  });

  it('rolls back the batch and claims after a database failure', async () => {
    const signed = batch([event()]);
    batchModel.update.mockRejectedValueOnce(new Error('DATABASE_WRITE_FAILED'));
    await expect(service.syncOfflineScans(signed)).rejects.toThrow('DATABASE_WRITE_FAILED');
    expect(records.size).toBe(0);
    expect(claims.size).toBe(0);
    expect(batches.size).toBe(0);
  });

  it('imports an edge denial without claiming a server-side dispatch', async () => {
    const denied = event({
      accessDecision : AccessDecision.DENIED,
      denialReason : 'CREDENTIAL_SUSPENDED',
      controllerOutcome : ControllerOutcome.NOT_APPLICABLE,
    });
    const response = await service.syncOfflineScans(batch([denied]));
    expect(response.acceptedCount).toBe(1);
    expect(records.get(denied.eventId)?.controllerOutcome).toBe(ControllerOutcome.NOT_APPLICABLE);
    expect(unlock).not.toHaveBeenCalled();
  });

  it('flags an Event ID reused with different signed evidence', async () => {
    const original = event();
    await service.syncOfflineScans(batch([original]));
    const modified = event({ eventId : original.eventId, journalSequence : 101 });
    const response = await service.syncOfflineScans(batch([modified]));
    expect(response.results[0]).toMatchObject({
      status : 'CONFLICT', reasonCode : 'EVENT_ID_CONTENT_MISMATCH',
    });
    expect(claims.has(modified.requestId)).toBe(false);
  });

  it('retains a signed unknown controller outcome without issuing a command', async () => {
    const uncertain = event({ controllerOutcome : ControllerOutcome.CONTROLLER_UNKNOWN });
    const response = await service.syncOfflineScans(batch([uncertain]));
    expect(response.acceptedCount).toBe(1);
    expect(records.get(uncertain.eventId)?.controllerOutcome).toBe(ControllerOutcome.CONTROLLER_UNKNOWN);
    expect(unlock).not.toHaveBeenCalled();
  });

  it('serializes concurrent submissions of an identical batch', async () => {
    const signed = batch([event()]);
    const responses = await Promise.all([
      service.syncOfflineScans(signed), service.syncOfflineScans(signed),
    ]);
    expect(responses[0]).toEqual(responses[1]);
    expect(records.size).toBe(1);
    expect(unlock).not.toHaveBeenCalled();
  });
});
