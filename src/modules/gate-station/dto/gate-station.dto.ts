import { FactoryId } from '../../users/model/user.model';
import { GateDirection, GateStationStatus } from '../model/gate-station.model';

export interface GateStationResponseDto {
  id: string;
  stationCode: string;
  name: string;
  factoryId: FactoryId;
  direction: GateDirection;
  location: string;
  status: GateStationStatus;
  createdAt: Date;
  updatedAt: Date;
  stationId: string;
  gateIdentifier: string;
}

export type GateStationContext = GateStationResponseDto;
