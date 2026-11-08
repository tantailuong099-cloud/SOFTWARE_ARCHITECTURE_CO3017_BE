import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { FactoryId } from '../model/user.model';

export class UpdateUserDto {
  @IsString()
  @IsOptional()
  fullName?: string;

  @IsEmail()
  @IsOptional()
  email?: string;

  @IsEnum(FactoryId)
  @IsOptional()
  factoryId?: FactoryId | null;

  @IsString()
  @MinLength(6)
  @IsOptional()
  password?: string;
}
