import { IsEnum } from 'class-validator';
import { UserStatus } from '../model/user.model';

export class UpdateUserStatusDto {
  @IsEnum(UserStatus)
  status: UserStatus;
}
