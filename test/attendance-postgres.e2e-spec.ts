import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { getConnectionToken } from '@nestjs/sequelize';
import { Sequelize } from 'sequelize-typescript';
import { generateKeyPairSync, randomInt, randomUUID, sign } from 'crypto';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import {
  TURNSTILE_PORT,
  TurnstileCommandResult,
} from '../src/adapters/turnstile/turnstile.port';
import {
  AccessDecision,
  AccessEventModel,
  ControllerOutcome,
} from '../src/modules/attendance-event/model/access-event.model';
import { AccessScanRequestModel } from '../src/modules/attendance-event/model/access-scan-request.model';
import { QRCredentialModel } from '../src/modules/user-qr/model/qr-credential.model';
import { QRPresentationModel } from '../src/modules/user-qr/model/qr-presentation.model';
import {
  canonicalOfflineBatch,
  canonicalOfflineEvent,
  sha256Hex,
} from '../src/modules/attendance-event/offline-evidence';
import type {
  OfflineAccessEventDto,
  SyncOfflineScansDto,
} from '../src/modules/attendance-event/dto/access-event.dto';

const stationId = 'BD-GATE-01';
const employeeCode = 'EMP-BD-003';
const unlockTurnstile = jest.fn();

describe('Attendance and sessions on migrated PostgreSQL', () => {
  let app: INestApplication;
  let database: Sequelize;
  let employeeToken: string;
  let employeeId: string;
  let adminToken: string;
  let credentialId: string;

  async function openApp() {
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(TURNSTILE_PORT)
      .useValue({ unlockTurnstile })
      .compile();
    const application = module.createNestApplication({ logger: false });
    application.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await application.init();
    return application;
  }

  const http = () => request(app.getHttpServer());

  async function login(email: string) {
    const { body } = await http()
      .post('/api/auth/login')
      .send({
        email,
        password: 'password123',
      })
      .expect(200);
    return body;
  }

  async function presentation() {
    const { body } = await http()
      .post('/api/user-qr/me/presentations')
      .set('Authorization', `Bearer ${employeeToken}`)
      .expect(201);
    return body as { qrToken: string; jti: string };
  }

  beforeAll(async () => {
    const url = process.env.DATABASE_URL
      ? new URL(process.env.DATABASE_URL)
      : undefined;
    if (
      !url ||
      !['localhost', '127.0.0.1'].includes(url.hostname) ||
      !url.pathname.endsWith('_test') ||
      process.env.ENABLE_DB !== 'true' ||
      !process.env.DATABASE_URL ||
      process.env.DATABASE_URL_POOLED ||
      process.env.CO3017_DISPOSABLE_DB !== 'true'
    ) {
      throw new Error(
        'Set CO3017_DISPOSABLE_DB=true and point DATABASE_URL at a migrated local database ending in _test',
      );
    }

    app = await openApp();
    database = app.get(getConnectionToken());
    adminToken = (await login('admin@tmc.com')).accessToken;
    const employee = await login('employee03@tmc.com');
    employeeToken = employee.accessToken;
    employeeId = employee.user.id;
    const issued = await http()
      .post(`/api/user-qr/credentials/${employeeId}/issue`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    credentialId = issued.body.id;
  });

  afterAll(async () => {
    await app?.close();
  });

  beforeEach(() => {
    unlockTurnstile.mockReset();
    unlockTurnstile.mockResolvedValue({
      result: TurnstileCommandResult.UNLOCK_CONFIRMED,
      executionTimestamp: new Date(),
      latencyMs: 0,
    });
  });

  it('commits before dispatch, consumes once and restores a concurrent retry after app restart', async () => {
    const { qrToken, jti } = await presentation();
    const dto = { requestId: randomUUID(), stationId, qrPayload: qrToken };
    let committedOutcome: string | undefined;
    unlockTurnstile.mockImplementationOnce(async ({ eventId }) => {
      committedOutcome = (await AccessEventModel.findByPk(eventId))
        ?.controllerOutcome;
      return {
        result: TurnstileCommandResult.TIMEOUT_UNKNOWN,
        executionTimestamp: new Date(),
        latencyMs: 800,
      };
    });
    const first = await Promise.all([
      http().post('/api/access/scan').send(dto).expect(201),
      http().post('/api/access/scan').send(dto).expect(201),
    ]);
    expect(first[0].body.eventId).toBe(first[1].body.eventId);
    expect(
      await AccessEventModel.count({ where: { requestId: dto.requestId } }),
    ).toBe(1);
    expect(unlockTurnstile).toHaveBeenCalledTimes(1);
    expect(committedOutcome).toBe(ControllerOutcome.CONTROLLER_UNKNOWN);
    expect(
      (await QRPresentationModel.findOne({ where: { jti } }))?.consumedAt,
    ).toBeInstanceOf(Date);

    await app.close();
    app = await openApp();
    database = app.get(getConnectionToken());
    await http()
      .post('/api/access/scan')
      .send(dto)
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          isCachedDuplicate: true,
          accessDecision: AccessDecision.APPROVED,
          controllerOutcome: ControllerOutcome.CONTROLLER_UNKNOWN,
        });
      });
    await http()
      .post('/api/access/scan')
      .send({ ...dto, qrPayload: 'conflict' })
      .expect(409);
    await http()
      .post('/api/access/scan')
      .send({ ...dto, requestId: randomUUID() })
      .expect(201)
      .expect(({ body }) => {
        expect(body).toMatchObject({
          reasonCode: 'QR_PRESENTATION_EXPIRED_OR_CONSUMED',
        });
      });
    expect(unlockTurnstile).toHaveBeenCalledTimes(1);
  });

  it('rolls back QR consumption and the request claim when PostgreSQL rejects the event insert', async () => {
    const { qrToken, jti } = await presentation();
    const dto = { requestId: randomUUID(), stationId, qrPayload: qrToken };
    // Inject a real database constraint failure for this single request.
    await database.query(
      `ALTER TABLE access_events ADD CONSTRAINT e2e_reject_request CHECK (request_id <> '${dto.requestId}')`,
    );
    try {
      await http().post('/api/access/scan').send(dto).expect(500);
      expect(await AccessScanRequestModel.findByPk(dto.requestId)).toBeNull();
      expect(
        (await QRPresentationModel.findOne({ where: { jti } }))?.consumedAt,
      ).toBeNull();
      expect(unlockTurnstile).not.toHaveBeenCalled();
    } finally {
      await database.query(
        'ALTER TABLE access_events DROP CONSTRAINT e2e_reject_request',
      );
    }
    await http().post('/api/access/scan').send(dto).expect(201);
    expect(unlockTurnstile).toHaveBeenCalledTimes(1);
  });

  it('authorizes self-service QR and events, and restricts HR export', async () => {
    const bearer = `Bearer ${employeeToken}`;
    const { qrToken } = await presentation();
    await http()
      .post('/api/access/scan')
      .send({
        requestId: randomUUID(),
        stationId,
        qrPayload: qrToken,
      })
      .expect(201);
    await http()
      .get(`/api/user-qr/employees/${employeeCode}/dynamic-qr`)
      .set('Authorization', bearer)
      .expect(200);
    await http()
      .get('/api/user-qr/employees/EMP-LA-001/dynamic-qr')
      .set('Authorization', bearer)
      .expect(403);
    await http()
      .get('/api/access/events')
      .query({ employeeId: 'EMP-LA-001' })
      .set('Authorization', bearer)
      .expect(403);
    await http()
      .get('/api/access/events')
      .query({ employeeId: employeeCode })
      .set('Authorization', bearer)
      .expect(200)
      .expect(({ body }) => {
        expect(body.events.length).toBeGreaterThan(0);
        expect(
          body.events.every((event) =>
            [employeeId, employeeCode].includes(event.employeeId),
          ),
        ).toBe(true);
      });
    await http()
      .post('/api/access/export-hr')
      .set('Authorization', bearer)
      .send({ reportingPeriod: '2026-11' })
      .expect(403);
    const hr = await login('hr.staff@tmc.com');
    await http()
      .post('/api/access/export-hr')
      .set('Authorization', `Bearer ${hr.accessToken}`)
      .send({ reportingPeriod: '2026-11' })
      .expect(201)
      .expect(({ body }) => expect(body.reportingPeriod).toBe('2026-11'));
  });

  it('rejects forged, expired and revoked database credentials without dispatch', async () => {
    const { qrToken } = await presentation();
    const [header, payload] = qrToken.split('.');
    const submit = (qrPayload: string) =>
      http()
        .post('/api/access/scan')
        .send({
          requestId: randomUUID(),
          stationId,
          qrPayload,
        })
        .expect(201);
    expect((await submit(`${header}.${payload}.invalid`)).body.reasonCode).toBe(
      'INVALID_OR_EXPIRED_QR_TOKEN',
    );

    const credential = await QRCredentialModel.findByPk(credentialId);
    if (!credential) throw new Error('Missing test credential');
    await credential.update({ expiresAt: new Date(Date.now() - 1000) });
    try {
      expect((await submit(qrToken)).body.reasonCode).toBe(
        'CREDENTIAL_EXPIRED',
      );
    } finally {
      await credential.update({ expiresAt: null });
    }

    await http()
      .patch(`/api/user-qr/credentials/${credentialId}/revoke`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    try {
      expect((await submit(qrToken)).body.reasonCode).toBe(
        'QR_CREDENTIAL_REVOKED',
      );
    } finally {
      const issued = await http()
        .post(`/api/user-qr/credentials/${employeeId}/issue`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(201);
      credentialId = issued.body.id;
    }
    expect(unlockTurnstile).not.toHaveBeenCalled();
  });

  it('accepts a signed batch once and replays its acknowledgement without dispatch', async () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const signEvidence = (canonical: string) =>
      sign(null, Buffer.from(canonical), privateKey).toString('base64');
    const snapshotId = randomUUID();
    const event: OfflineAccessEventDto = {
      eventId: randomUUID(),
      requestId: randomUUID(),
      stationId,
      employeeId: employeeCode,
      deviceTimestamp: new Date().toISOString(),
      accessDecision: AccessDecision.APPROVED,
      controllerOutcome: ControllerOutcome.CONTROLLER_UNKNOWN,
      policyVersion: 'v1.0',
      policySnapshotId: snapshotId,
      journalSequence: randomInt(1, 2_000_000_000),
      evidenceSignature: '',
    };
    event.evidenceSignature = signEvidence(canonicalOfflineEvent(event));
    const batch: SyncOfflineScansDto = {
      schemaVersion: 1,
      batchId: randomUUID(),
      stationId,
      eventCount: 1,
      events: [event],
      payloadDigest: '',
      batchSignature: '',
    };
    const canonical = canonicalOfflineBatch(batch);
    batch.payloadDigest = `sha256:${sha256Hex(canonical)}`;
    batch.batchSignature = signEvidence(canonical);
    const originalTrust = process.env.OFFLINE_SYNC_TRUST_JSON;
    process.env.OFFLINE_SYNC_TRUST_JSON = JSON.stringify({
      [stationId]: {
        publicKeyPem: publicKey.export({ type: 'spki', format: 'pem' }),
        policies: {
          [snapshotId]: {
            validFrom: new Date(Date.now() - 60000).toISOString(),
            validUntil: new Date(Date.now() + 60000).toISOString(),
            policyVersion: 'v1.0',
            factoryId: 'BINH_DUONG',
            direction: 'ENTRY',
            allowedEmployeeIds: [employeeCode],
          },
        },
      },
    });
    try {
      const first = await http()
        .post('/api/access/sync-offline-scans')
        .send(batch)
        .expect(201);
      const retry = await http()
        .post('/api/access/sync-offline-scans')
        .send(batch)
        .expect(201);
      expect(first.body.acceptedCount).toBe(1);
      expect(retry.body).toEqual(first.body);
      expect(
        await AccessEventModel.count({ where: { eventId: event.eventId } }),
      ).toBe(1);
      expect(unlockTurnstile).not.toHaveBeenCalled();
    } finally {
      if (originalTrust === undefined)
        delete process.env.OFFLINE_SYNC_TRUST_JSON;
      else process.env.OFFLINE_SYNC_TRUST_JSON = originalTrust;
    }
  });

  it('consumes a refresh token once under concurrent rotation and revokes on logout', async () => {
    const { refreshToken } = await login('employee04@tmc.com');
    const responses = await Promise.all([
      http().post('/api/auth/refresh').send({ refreshToken }),
      http().post('/api/auth/refresh').send({ refreshToken }),
    ]);
    expect(responses.map(({ status }) => status).sort()).toEqual([200, 401]);
    const { accessToken } = responses.find(
      ({ status }) => status === 200,
    )!.body;
    const bearer = `Bearer ${accessToken}`;
    await http().get('/api/auth/me').set('Authorization', bearer).expect(200);
    await http()
      .post('/api/auth/logout')
      .set('Authorization', bearer)
      .expect(200);
    await http().get('/api/auth/me').set('Authorization', bearer).expect(401);
  });
});
