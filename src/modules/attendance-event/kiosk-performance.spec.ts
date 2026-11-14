import { Test } from '@nestjs/testing';
import { AccessScanService } from './access-scan.service';
import { SCAN_CREDENTIAL_VALIDATOR } from '../user-qr/scan-credential.port';
import { GateStationService } from '../gate-station/gate-station.service';
import {
  TURNSTILE_PORT,
  TurnstileCommandResult,
} from '../../adapters/turnstile/turnstile.port';
import { getModelToken } from '@nestjs/sequelize';
import { AccessEventModel } from './model/access-event.model';
import { AccessScanRequestModel } from './model/access-scan-request.model';
import { FactoryId, UserStatus } from '../users/model/user.model';
import { GateDirection, GateStationStatus } from '../gate-station/model/gate-station.model';

// Jest needs the injection token but cannot load the package's ESM entrypoint.
jest.mock('@nestjs/sequelize', () => {
  const { Inject } = jest.requireActual('@nestjs/common');
  return {
    InjectModel: (model: { name: string }) => Inject(`${model.name}Repository`),
    getModelToken: (model: { name: string }) => `${model.name}Repository`,
  };
});

describe('Synthetic AccessScanService timing', () => {
  let scanService: AccessScanService;

  const mockGateStationContext = {
    id: '1',
    stationCode: 'BD-GATE-01',
    name: 'Gate 01 - Main Entrance',
    factoryId: FactoryId.BINH_DUONG,
    direction: GateDirection.ENTRY,
    location: 'Binh Duong Main Gate',
    status: GateStationStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    stationId: 'BD-GATE-01',
    gateIdentifier: 'Gate 01 - Main Entrance',
  };

  const mockValidator = {
    validateCredential: jest.fn().mockResolvedValue({
      isRecognized: true,
      isValid: true,
      employeeId: 'EMP-BD-001',
      employeeName: 'Nguyen Van An',
      factoryId: FactoryId.BINH_DUONG,
      employeeStatus: UserStatus.ACTIVE,
      isDynamic: true,
    }),
  };

  const mockGateStationService = {
    validateActiveStation: jest.fn().mockResolvedValue(mockGateStationContext),
  };

  // Simulate a fixed controller delay without hardware.
  const mockTurnstile = {
    unlockTurnstile: jest.fn().mockImplementation(async () => {
      await new Promise((res) => setTimeout(res, 120));
      return {
        result: TurnstileCommandResult.UNLOCK_CONFIRMED,
        executionTimestamp: new Date(),
        latencyMs: 120,
      };
    }),
  };

  const mockDbTransaction = {
    LOCK: { UPDATE: 'UPDATE' },
    commit: jest.fn(),
    rollback: jest.fn(),
  };

  const mockSequelize = {
    transaction: jest.fn().mockImplementation(async (cb) => cb(mockDbTransaction)),
    query: jest.fn().mockResolvedValue([[{ request_id: 'REQ-PERF' }]]),
  };

  const mockAccessEventModel = {
    sequelize: mockSequelize,
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue([1]),
    findByPk: jest.fn().mockResolvedValue(null),
  };

  const mockScanRequestModel = {
    findByPk: jest.fn().mockResolvedValue(null),
    update: jest.fn().mockResolvedValue([1]),
  };

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        AccessScanService,
        { provide: SCAN_CREDENTIAL_VALIDATOR, useValue: mockValidator },
        { provide: GateStationService, useValue: mockGateStationService },
        { provide: TURNSTILE_PORT, useValue: mockTurnstile },
        { provide: getModelToken(AccessEventModel), useValue: mockAccessEventModel },
        { provide: getModelToken(AccessScanRequestModel), useValue: mockScanRequestModel },
      ],
    }).compile();

    scanService = module.get<AccessScanService>(AccessScanService);
  });

  it(
    'measures 50 sequential service calls with mocked persistence',
    async () => {
    const totalRequests = 50;
    const latencies: number[] = [];

    for (let i = 0; i < totalRequests; i++) {
      const start = performance.now();
      const res = await scanService.submitAccessScan({
        requestId: `REQ-PERF-${Date.now()}-${i}`,
        stationId: 'BD-GATE-01',
        qrPayload: `TMC:DYN:EMP-BD-001:${Date.now()}:nonce${i}:sig`,
      });
      const duration = performance.now() - start;
      latencies.push(duration);
      expect(res.accessDecision).toBe('APPROVED');
    }

    latencies.sort((a, b) => a - b);
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const avg = Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length);
    const percentile = (fraction: number) =>
      latencies[Math.ceil(latencies.length * fraction) - 1];

    console.log({
      benchmark: 'Synthetic AccessScanService timing',
      boundary: 'submitAccessScan entry to returned result',
      sampleCount: latencies.length,
      persistence: 'mocked',
      simulatedControllerDelayMs: 120,
      minMs: min,
      averageMs: avg,
      p50Ms: percentile(0.50),
      p90Ms: percentile(0.90),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
      maxMs: max,
    });
    expect(mockTurnstile.unlockTurnstile).toHaveBeenCalledTimes(totalRequests);
  }, 30000);
});
