import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
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

export class CreateGateStationDto {
  @IsString()
  @IsNotEmpty()
  stationCode: string;

  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEnum(FactoryId)
  factoryId: FactoryId;

  @IsEnum(GateDirection)
  direction: GateDirection;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsEnum(GateStationStatus)
  @IsOptional()
  status?: GateStationStatus;
}

export class UpdateGateStationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsEnum(FactoryId)
  @IsOptional()
  factoryId?: FactoryId;

  @IsEnum(GateDirection)
  @IsOptional()
  direction?: GateDirection;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(GateStationStatus)
  @IsOptional()
  status?: GateStationStatus;
}

export class UpdateGateStationStatusDto {
  @IsEnum(GateStationStatus)
  status: GateStationStatus;
}
