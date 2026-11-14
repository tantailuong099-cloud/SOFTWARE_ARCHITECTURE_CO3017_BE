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

describe('NFR-PERF-01: Kiosk Response-Time Performance Benchmark', () => {
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

  // Mock hardware turnstile with realistic 120ms mechanical latency
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
    'measures 50 sequential scan requests and verifies Kiosk SLA <= 2000ms',
    async () => {
    const totalRequests = 50;
    const latencies: number[] = [];

    for (let i = 0; i < totalRequests; i++) {
      const start = Date.now();
      const res = await scanService.submitAccessScan({
        requestId: `REQ-PERF-${Date.now()}-${i}`,
        stationId: 'BD-GATE-01',
        qrPayload: `TMC:DYN:EMP-BD-001:${Date.now()}:nonce${i}:sig`,
      });
      const duration = Date.now() - start;
      latencies.push(duration);
      expect(res.accessDecision).toBe('APPROVED');
    }

    latencies.sort((a, b) => a - b);
    const min = latencies[0];
    const max = latencies[latencies.length - 1];
    const avg = Math.round(latencies.reduce((sum, v) => sum + v, 0) / latencies.length);
    const p50 = latencies[Math.floor(latencies.length * 0.5)];
    const p90 = latencies[Math.floor(latencies.length * 0.9)];
    const p95 = latencies[Math.floor(latencies.length * 0.95)];
    const p99 = latencies[Math.floor(latencies.length * 0.99)];

    console.log('\n===== KIOSK SLA BENCHMARK RESULTS (NFR-PERF-01) =====');
    console.log(`Total Samples:       ${totalRequests}`);
    console.log(`Min Latency:         ${min} ms`);
    console.log(`Average Latency:     ${avg} ms`);
    console.log(`Median (P50):        ${p50} ms`);
    console.log(`P90 Latency:         ${p90} ms`);
    console.log(`P95 Latency:         ${p95} ms (Threshold: <= 2000ms)`);
    console.log(`P99 Latency:         ${p99} ms`);
    console.log(`Max Latency:         ${max} ms`);
    console.log('====================================================\n');

    expect(p95).toBeLessThanOrEqual(2000);
    expect(max).toBeLessThanOrEqual(2000);
  }, 30000);
});
