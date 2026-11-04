import { Table, Column, Model, DataType, PrimaryKey, Unique } from 'sequelize-typescript';
import { GateDirection } from '../../gate-station/model/gate-station.model';
import { FactoryId } from '../../user-qr/model/employee.model';

export enum AccessDecision {
  APPROVED = 'APPROVED',
  DENIED = 'DENIED',
}

export enum ControllerOutcome {
  CONTROLLER_CONFIRMED = 'CONTROLLER_CONFIRMED',
  CONTROLLER_FAILED = 'CONTROLLER_FAILED',
  CONTROLLER_UNKNOWN = 'CONTROLLER_UNKNOWN',
  CONTROLLER_PENDING = 'CONTROLLER_PENDING',
  NOT_APPLICABLE = 'NOT_APPLICABLE',
}

@Table({
  tableName: 'access_events',
  timestamps: true,
})
export class AccessEventModel extends Model {
  @PrimaryKey
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare eventId: string; // UUID

  @Unique
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare requestId: string; // Idempotency key from scan

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare employeeId: string;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare employeeName: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare stationId: string;

  @Column({
    type: DataType.ENUM(...Object.values(FactoryId)),
    allowNull: false,
  })
  declare factoryId: FactoryId;

  @Column({
    type: DataType.ENUM(...Object.values(GateDirection)),
    allowNull: false,
  })
  declare direction: GateDirection;

  @Column({
    type: DataType.ENUM(...Object.values(AccessDecision)),
    allowNull: false,
  })
  declare accessDecision: AccessDecision;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare denialReason: string;

  @Column({
    type: DataType.ENUM(...Object.values(ControllerOutcome)),
    allowNull: false,
    defaultValue: ControllerOutcome.CONTROLLER_PENDING,
  })
  declare controllerOutcome: ControllerOutcome;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare serverTimestamp: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare deviceTimestamp: Date;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare correlationId: string;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    defaultValue: 'v1.0',
  })
  declare policyVersion: string;
}
