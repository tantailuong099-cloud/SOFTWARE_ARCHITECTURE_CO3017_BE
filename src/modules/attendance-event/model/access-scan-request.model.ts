import { Column, DataType, Model, PrimaryKey, Table, Unique } from 'sequelize-typescript';

export enum ScanResultType {
  EVENT_RECORDED = 'EVENT_RECORDED',
  REJECTED_NO_EVENT = 'REJECTED_NO_EVENT',
  LEGACY = 'LEGACY',
}

@Table({ tableName : 'access_scan_requests', timestamps : true, underscored : true })
export class AccessScanRequestModel extends Model {
  @PrimaryKey
  @Column({ type : DataType.STRING, allowNull : false })
  declare requestId : string;

  @Column({ type : DataType.STRING, allowNull : false })
  declare stationId : string;

  @Column({ type : DataType.STRING(64), allowNull : true })
  declare requestFingerprint : string | null;

  @Column({ type : DataType.STRING(20), allowNull : true })
  declare resultType : ScanResultType | null;

  @Unique
  @Column({ type : DataType.STRING, allowNull : true })
  declare eventId : string | null;

  @Column({ type : DataType.STRING, allowNull : true })
  declare reasonCode : string | null;

  @Column({ type : DataType.DATE, allowNull : false })
  declare serverTimestamp : Date;

  declare createdAt : Date;
  declare updatedAt : Date;
}
