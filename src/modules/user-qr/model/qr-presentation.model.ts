import {
  BelongsTo,
  Column,
  DataType,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  Unique,
} from 'sequelize-typescript';
import { QRCredentialModel } from './qr-credential.model';

@Table({
  tableName: 'qr_presentations',
  timestamps: false,
  underscored: true,
})
export class QRPresentationModel extends Model {
  @PrimaryKey
  @Column({ type: DataType.BIGINT, autoIncrement: true })
  declare id: string;

  @Unique
  @Column({ type: DataType.UUID })
  declare jti: string;

  @ForeignKey(() => QRCredentialModel)
  @Column({ type: DataType.BIGINT, field: 'credential_id' })
  declare credentialId: string;

  @BelongsTo(() => QRCredentialModel)
  declare credential: QRCredentialModel;

  @Column({ type: DataType.DATE, field: 'expires_at' })
  declare expiresAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'consumed_at' })
  declare consumedAt: Date | null;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;
}
