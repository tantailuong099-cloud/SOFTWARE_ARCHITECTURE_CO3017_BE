import { Table, Column, Model, DataType, PrimaryKey } from 'sequelize-typescript';

export enum TokenType {
  ACCESS = 'ACCESS',
  REFRESH = 'REFRESH',
}

export interface TokenAttributes {
  id?: string;
  userId: string;
  tokenHash: string;
  type: TokenType;
  revoked: boolean;
  createdAt?: Date;
  expiresAt: Date;
}

@Table({
  tableName: 'tokens',
  timestamps: false,
  underscored: true,
})
export class TokenModel
  extends Model<TokenAttributes>
  implements TokenAttributes
{
  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    autoIncrement: true,
  })
  declare id: string;

  @Column({ type: DataType.BIGINT, allowNull: false, field: 'user_id' })
  declare userId: string;

  @Column({ type: DataType.STRING(64), allowNull: false, unique: true, field: 'token_hash' })
  declare tokenHash: string;

  @Column({ type: DataType.ENUM(...Object.values(TokenType)), allowNull: false })
  declare type: TokenType;

  @Column({ type: DataType.BOOLEAN, allowNull: false, defaultValue: false })
  declare revoked: boolean;

  @Column({ type: DataType.DATE, allowNull: false, field: 'created_at' })
  declare createdAt: Date;

  @Column({ type: DataType.DATE, allowNull: false, field: 'expires_at' })
  declare expiresAt: Date;
}
