import { Table, Column, Model, DataType, PrimaryKey, ForeignKey, BelongsTo } from 'sequelize-typescript';
import { EmployeeModel } from './employee.model';

export enum CredentialStatus {
  ACTIVE = 'ACTIVE',
  SUSPENDED = 'SUSPENDED',
  REVOKED = 'REVOKED',
}

@Table({
  tableName: 'qr_credentials',
  timestamps: true,
})
export class QRCredentialModel extends Model {
  @PrimaryKey
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare credentialId: string;

  @ForeignKey(() => EmployeeModel)
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare employeeId: string;

  @BelongsTo(() => EmployeeModel)
  declare employee: EmployeeModel;

  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  declare qrPayload: string;

  @Column({
    type: DataType.ENUM(...Object.values(CredentialStatus)),
    allowNull: false,
    defaultValue: CredentialStatus.ACTIVE,
  })
  declare status: CredentialStatus;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 1,
  })
  declare version: number;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare issuedAt: Date;

  @Column({
    type: DataType.DATE,
    allowNull: false,
  })
  declare expiresAt: Date;
}
