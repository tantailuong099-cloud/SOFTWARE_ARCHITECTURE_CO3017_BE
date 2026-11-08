import {
  Table,
  Column,
  Model,
  DataType,
  PrimaryKey,
  Unique,
} from 'sequelize-typescript';

export enum UserRole {
  EMPLOYEE = 'EMPLOYEE',
  SUPERVISOR = 'SUPERVISOR',
  HR_STAFF = 'HR_STAFF',
  SECURITY_GUARD = 'SECURITY_GUARD',
  ADMIN = 'ADMIN',
}

export enum FactoryId {
  BINH_DUONG = 'BINH_DUONG',
  LONG_AN = 'LONG_AN',
}

export enum UserStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
}

export interface UserAttributes {
  id?: string;
  employeeCode: string;
  fullName: string;
  email: string;
  passwordHash: string;
  role: UserRole;
  status: UserStatus;
  factoryId?: FactoryId | null;
  createdAt?: Date;
  updatedAt?: Date;
}

@Table({
  tableName: 'users',
  timestamps: true,
  underscored: true,
})
export class UserModel extends Model<UserAttributes> implements UserAttributes {
  @PrimaryKey
  @Column({
    type: DataType.BIGINT,
    allowNull: false,
    autoIncrement: true,
  })
  declare id: string;

  @Unique
  @Column({
    type: DataType.STRING(50),
    allowNull: false,
    field: 'employee_code',
  })
  declare employeeCode: string;

  @Column({
    type: DataType.STRING(150),
    allowNull: false,
    field: 'full_name',
  })
  declare fullName: string;

  @Unique
  @Column({
    type: DataType.STRING(255),
    allowNull: false,
  })
  declare email: string;

  @Column({
    type: DataType.STRING(255),
    allowNull: false,
    field: 'password_hash',
  })
  declare passwordHash: string;

  @Column({
    type: DataType.ENUM(...Object.values(UserRole)),
    allowNull: false,
    defaultValue: UserRole.EMPLOYEE,
  })
  declare role: UserRole;

  @Column({
    type: DataType.ENUM(...Object.values(UserStatus)),
    allowNull: false,
    defaultValue: UserStatus.ACTIVE,
  })
  declare status: UserStatus;

  @Column({
    type: DataType.ENUM(...Object.values(FactoryId)),
    allowNull: true,
    field: 'factory_id',
  })
  declare factoryId?: FactoryId | null;

  @Column({
    type: DataType.STRING(255),
    allowNull: true,
    field: 'refresh_token_hash',
  })
  declare refreshTokenHash?: string | null;

  declare createdAt: Date;

  declare updatedAt: Date;
}
