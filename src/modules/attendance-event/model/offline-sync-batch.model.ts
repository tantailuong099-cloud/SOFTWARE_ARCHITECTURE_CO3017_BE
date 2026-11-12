import { Column, DataType, Model, PrimaryKey, Table } from 'sequelize-typescript';
import type { SyncOfflineEventResultDto } from '../dto/access-event.dto';

@Table({ tableName : 'offline_sync_batches', timestamps : true, underscored : true })
export class OfflineSyncBatchModel extends Model {
  @PrimaryKey
  @Column({ type : DataType.STRING, allowNull : false })
  declare batchId : string;

  @Column({ type : DataType.STRING, allowNull : false })
  declare stationId : string;

  @Column({ type : DataType.STRING(64), allowNull : false })
  declare payloadDigest : string;

  @Column({ type : DataType.INTEGER, allowNull : false })
  declare eventCount : number;

  @Column({ type : DataType.JSONB, allowNull : false })
  declare resultsJson : SyncOfflineEventResultDto[];

  declare createdAt : Date;
  declare updatedAt : Date;
}
