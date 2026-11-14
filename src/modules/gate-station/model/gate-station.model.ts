import {
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';
import { FactoryId } from '../../users/model/user.model';

export enum GateDirection {
  ENTRY = 'ENTRY',
  EXIT = 'EXIT',
}

export enum GateStationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  DISABLED = 'DISABLED', // Hỗ trợ tương thích cả 2 chuẩn định danh trạng thái giữa FE và BE
}

@Table({
  tableName: 'gate_stations',
  timestamps: true,
  underscored: true,
})
export class GateStationModel extends Model {
  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    autoIncrement: true,
    allowNull: false,
  })
  declare id: string;

  @Unique
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    field: 'station_code',
  })
  declare stationCode: string;

  @Column({
    type: DataType.STRING(150),
    allowNull: false,
  })
  declare name: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    field: 'factory_id',
  })
  declare factoryId: FactoryId;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
  })
  declare direction: GateDirection;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare location: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: GateStationStatus.ACTIVE,
  })
  declare status: GateStationStatus;

  declare createdAt: Date;
  declare updatedAt: Date;
}
