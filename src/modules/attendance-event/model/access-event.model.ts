import { Table, Column, Model, DataType, PrimaryKey, Unique } from 'sequelize-typescript';
import { GateDirection } from '../../gate-station/model/gate-station.model';
import { FactoryId } from '../../users/model/user.model';

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
  underscored: true,
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
  declare employeeId: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare employeeName: string | null;

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare stationId: string;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  declare factoryId: FactoryId;

  @Column({
    type: DataType.STRING(10),
    allowNull: false,
  })
  declare direction: GateDirection;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
  })
  declare accessDecision: AccessDecision;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare denialReason: string | null;

  @Column({
    type: DataType.STRING(30),
    allowNull: false,
    defaultValue: ControllerOutcome.CONTROLLER_PENDING,
  })
  declare controllerOutcome: ControllerOutcome;

  // The claim is durable before a command may cross the controller boundary.
  @Column({ type : DataType.DATE, allowNull : true })
  declare dispatchClaimedAt : Date | null;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare serverTimestamp: Date;

  @Column({
    type: DataType.DATE,
    allowNull: true,
  })
  declare deviceTimestamp: Date | null;

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

  @Column({ type : DataType.STRING(20), allowNull : false, defaultValue : 'ONLINE' })
  declare eventSource : 'ONLINE' | 'OFFLINE_EDGE';

  @Column({ type : DataType.STRING(64), allowNull : true })
  declare offlineEventDigest : string | null;

  @Column({ type : DataType.STRING, allowNull : true })
  declare offlineBatchId : string | null;

  @Column({ type : DataType.STRING, allowNull : true })
  declare offlinePolicySnapshotId : string | null;

  @Column({ type : DataType.BIGINT, allowNull : true })
  declare offlineJournalSequence : string | null;

  @Column({ type : DataType.TEXT, allowNull : true })
  declare offlineEvidenceSignature : string | null;

  declare createdAt: Date;
  declare updatedAt: Date;
}
