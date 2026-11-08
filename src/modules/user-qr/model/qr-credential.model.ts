import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  Unique,
} from 'sequelize-typescript';
import { UserModel } from '../../users/model/user.model';

export enum CredentialStatus {
  ACTIVE = 'ACTIVE',
  REVOKED = 'REVOKED',
  EXPIRED = 'EXPIRED',
}

@Table({
  tableName: 'qr_credentials',
  timestamps: true,
  underscored: true,
})
export class QRCredentialModel extends Model {
  @PrimaryKey
  @Column({ type: DataType.BIGINT, autoIncrement: true })
  declare id: string;

  @Unique
  @Column({ type: DataType.UUID, field: 'credential_uuid' })
  declare credentialUuid: string;

  @ForeignKey(() => UserModel)
  @Column({ type: DataType.BIGINT, field: 'user_id' })
  declare userId: string;

  @BelongsTo(() => UserModel)
  declare user: UserModel;

  @Column({
    type: DataType.STRING(20),
    allowNull: false,
    defaultValue: CredentialStatus.ACTIVE,
    validate: {
      isIn: [Object.values(CredentialStatus)],
    },
  })
  declare status: CredentialStatus;

  @Column({ type: DataType.DATE, field: 'issued_at' })
  declare issuedAt: Date;

  @Column({ type: DataType.DATE, allowNull: true, field: 'expires_at' })
  declare expiresAt: Date | null;

  @Column({ type: DataType.DATE, allowNull: true, field: 'revoked_at' })
  declare revokedAt: Date | null;

  @Column({ type: DataType.DATE, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, field: 'updated_at' })
  declare updatedAt: Date;
}
