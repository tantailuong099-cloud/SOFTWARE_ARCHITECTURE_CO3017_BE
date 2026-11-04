import { Injectable, Logger, NotFoundException, BadRequestException, UnauthorizedException } from '@nestjs/common';
import { FactoryId } from '../user-qr/model/employee.model';
import { GateDirection, GateStationStatus } from './model/gate-station.model';
import {
  GateStationContext,
  RegisterGateStationDto,
  StationAuthResult,
  UpdateGateStationDto,
} from './dto/gate-station.dto';

@Injectable()
export class GateStationService {
  private readonly logger = new Logger(GateStationService.name);

  private readonly stationsStore = new Map<string, any>();

  constructor() {
    this.seedInitialStations();
  }

  private seedInitialStations() {
    const stations = [
      {
        stationId: 'BD-GATE-01',
        factoryId: FactoryId.BINH_DUONG,
        gateIdentifier: 'Gate 01 - Main Entrance',
        direction: GateDirection.ENTRY,
        status: GateStationStatus.ACTIVE,
        stationApiKey: 'STATION_KEY_BD01',
        controllerEndpoint: 'http://turnstile-controller-bd01.internal/api/unlock',
        lastHeartbeat: new Date(),
      },
      {
        stationId: 'BD-GATE-02',
        factoryId: FactoryId.BINH_DUONG,
        gateIdentifier: 'Gate 01 - Main Exit',
        direction: GateDirection.EXIT,
        status: GateStationStatus.ACTIVE,
        stationApiKey: 'STATION_KEY_BD02',
        controllerEndpoint: 'http://turnstile-controller-bd02.internal/api/unlock',
        lastHeartbeat: new Date(),
      },
      {
        stationId: 'LA-GATE-01',
        factoryId: FactoryId.LONG_AN,
        gateIdentifier: 'Gate Long An - Turnstile A',
        direction: GateDirection.ENTRY,
        status: GateStationStatus.ACTIVE,
        stationApiKey: 'STATION_KEY_LA01',
        controllerEndpoint: 'http://turnstile-controller-la01.internal/api/unlock',
        lastHeartbeat: new Date(),
      },
      {
        stationId: 'LA-GATE-02',
        factoryId: FactoryId.LONG_AN,
        gateIdentifier: 'Gate Long An - Turnstile B',
        direction: GateDirection.EXIT,
        status: GateStationStatus.ACTIVE,
        stationApiKey: 'STATION_KEY_LA02',
        controllerEndpoint: 'http://turnstile-controller-la02.internal/api/unlock',
        lastHeartbeat: new Date(),
      },
      {
        stationId: 'BD-MAINT-01',
        factoryId: FactoryId.BINH_DUONG,
        gateIdentifier: 'Maintenance Lane (Disabled Test)',
        direction: GateDirection.ENTRY,
        status: GateStationStatus.DISABLED, // Disabled test station
        stationApiKey: 'STATION_KEY_BD_MAINT',
        controllerEndpoint: 'http://turnstile-controller-maint.internal/api/unlock',
        lastHeartbeat: new Date(),
      },
    ];

    for (const st of stations) {
      this.stationsStore.set(st.stationId, st);
    }
  }

  // --- Contract: AuthenticateStation (Table 32 & FR-GS-02) ---
  async authenticateStation(stationId: string, apiKey?: string): Promise<StationAuthResult> {
    const station = this.stationsStore.get(stationId);
    if (!station) {
      this.logger.warn(`Station authentication failed: unknown stationId ${stationId}`);
      return {
        isAuthenticated: false,
        denialReason: 'STATION_NOT_REGISTERED',
      };
    }

    if (station.status !== GateStationStatus.ACTIVE) {
      this.logger.warn(`Station ${stationId} is currently ${station.status}`);
      return {
        isAuthenticated: false,
        denialReason: 'STATION_DISABLED',
      };
    }

    // Optional API key validation when supplied
    if (apiKey && apiKey !== station.stationApiKey) {
      this.logger.warn(`Station ${stationId} provided invalid apiKey`);
      return {
        isAuthenticated: false,
        denialReason: 'STATION_AUTH_FAILED',
      };
    }

    station.lastHeartbeat = new Date();
    this.stationsStore.set(stationId, station);

    return {
      isAuthenticated: true,
      stationContext: {
        stationId: station.stationId,
        factoryId: station.factoryId,
        gateIdentifier: station.gateIdentifier,
        direction: station.direction,
        status: station.status,
        controllerEndpoint: station.controllerEndpoint,
      },
    };
  }

  // --- Contract: GetStationContext (Table 32) ---
  async getStationContext(stationId: string): Promise<GateStationContext> {
    const station = this.stationsStore.get(stationId);
    if (!station) {
      throw new NotFoundException(`Gate station ${stationId} not found`);
    }

    return {
      stationId: station.stationId,
      factoryId: station.factoryId,
      gateIdentifier: station.gateIdentifier,
      direction: station.direction,
      status: station.status,
      controllerEndpoint: station.controllerEndpoint,
    };
  }

  // --- UC-05: Register / Configure Gate Station (FR-GS-01) ---
  async registerStation(dto: RegisterGateStationDto) {
    if (this.stationsStore.has(dto.stationId)) {
      throw new BadRequestException(`Station ID ${dto.stationId} is already in use`);
    }

    const newStation = {
      ...dto,
      stationApiKey: dto.stationApiKey || `KEY_${dto.stationId}`,
      status: GateStationStatus.ACTIVE,
      lastHeartbeat: new Date(),
      createdAt: new Date(),
    };

    this.stationsStore.set(dto.stationId, newStation);
    this.logger.log(`Registered new Gate Station: ${dto.stationId} at ${dto.factoryId}`);
    return newStation;
  }

  async updateStation(stationId: string, dto: UpdateGateStationDto) {
    const station = this.stationsStore.get(stationId);
    if (!station) {
      throw new NotFoundException(`Station ${stationId} not found`);
    }

    const updated = {
      ...station,
      ...dto,
      updatedAt: new Date(),
    };

    this.stationsStore.set(stationId, updated);
    this.logger.log(`Updated Gate Station ${stationId}`);
    return updated;
  }

  async listStations() {
    return Array.from(this.stationsStore.values());
  }
}
