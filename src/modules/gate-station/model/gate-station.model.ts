import { Table, Column, Model, DataType, PrimaryKey } from 'sequelize-typescript';
import { FactoryId } from '../../users/model/user.model';

export enum GateDirection {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
}

export enum GateStationStatus {
  ACTIVE = 'ACTIVE',
  DISABLED = 'DISABLED',
}

@Table({
  tableName: 'gate_stations',
  timestamps: true,
})
export class GateStationModel extends Model {
  @PrimaryKey
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare stationId: string; // e.g. BD-GATE-01

  @Column({
    type: DataType.ENUM(...Object.values(FactoryId)),
    allowNull: false,
  })
  declare factoryId: FactoryId;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare gateIdentifier: string; // e.g. GATE_01_MAIN

  @Column({
    type: DataType.ENUM(...Object.values(GateDirection)),
    allowNull: false,
  })
  declare direction: GateDirection;

  @Column({
    type: DataType.ENUM(...Object.values(GateStationStatus)),
    allowNull: false,
    defaultValue: GateStationStatus.ACTIVE,
  })
  declare status: GateStationStatus;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare stationApiKey: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare controllerEndpoint: string;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare lastHeartbeat: Date;
}
