import { FactoryId } from '../../user-qr/model/employee.model';
import { GateDirection, GateStationStatus } from '../model/gate-station.model';

export class RegisterGateStationDto {
  stationId: string;
  factoryId: FactoryId;
  gateIdentifier: string;
  direction: GateDirection;
  controllerEndpoint: string;
  stationApiKey?: string;
}

export class UpdateGateStationDto {
  status?: GateStationStatus;
  controllerEndpoint?: string;
  gateIdentifier?: string;
  direction?: GateDirection;
}

export interface GateStationContext {
  stationId: string;
  factoryId: FactoryId;
  gateIdentifier: string;
  direction: GateDirection;
  status: GateStationStatus;
  controllerEndpoint: string;
}

export interface StationAuthResult {
  isAuthenticated: boolean;
  stationContext?: GateStationContext;
  denialReason?: string;
}
