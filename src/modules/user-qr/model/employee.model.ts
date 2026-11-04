import { Table, Column, Model, DataType, PrimaryKey, HasMany } from 'sequelize-typescript';
import { QRCredentialModel } from './qr-credential.model';

export enum EmployeeStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export enum FactoryId {
  BINH_DUONG = 'BINH_DUONG',
  LONG_AN = 'LONG_AN',
}

export enum EmployeeRole {
  EMPLOYEE = 'EMPLOYEE',
  SUPERVISOR = 'SUPERVISOR',
  HR_STAFF = 'HR_STAFF',
  SECURITY_GUARD = 'SECURITY_GUARD',
  ADMIN = 'ADMIN',
}

@Table({
  tableName: 'employees',
  timestamps: true,
})
export class EmployeeModel extends Model {
  @PrimaryKey
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare id: string; // e.g. EMP-BD-001

  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare fullName: string;

  @Column({
    type: DataType.ENUM(...Object.values(FactoryId)),
    allowNull: false,
  })
  declare factoryId: FactoryId;

  @Column({
    type: DataType.ENUM(...Object.values(EmployeeStatus)),
    allowNull: false,
    defaultValue: EmployeeStatus.ACTIVE,
  })
  declare status: EmployeeStatus;

  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare department: string;

  @Column({
    type: DataType.ENUM(...Object.values(EmployeeRole)),
    allowNull: false,
    defaultValue: EmployeeRole.EMPLOYEE,
  })
  declare role: EmployeeRole;

  @HasMany(() => QRCredentialModel)
  declare credentials: QRCredentialModel[];
}
