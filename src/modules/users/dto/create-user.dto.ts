import { IsEmail, IsEnum, IsNotEmpty, IsOptional, IsString, Matches, MinLength } from 'class-validator';
import { FactoryId, UserRole, UserStatus } from '../model/user.model';

export class CreateUserDto {
  @IsString()
  @Matches(/^[A-Za-z0-9_-]+$/)
  employeeCode: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsEnum(UserRole)
  @IsOptional()
  role?: UserRole;

  @IsEnum(UserStatus)
  @IsOptional()
  status?: UserStatus;

  @IsEnum(FactoryId)
  @IsOptional()
  factoryId?: FactoryId;
}
