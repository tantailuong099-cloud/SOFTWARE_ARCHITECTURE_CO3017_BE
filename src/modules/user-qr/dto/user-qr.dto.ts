import { FactoryId, UserRole, UserStatus } from '../../users/model/user.model';
import { CredentialStatus } from '../model/qr-credential.model';

export class SyncEmployeeDto {
  id: string;
  fullName: string;
  factoryId: FactoryId;
  status: UserStatus;
  department?: string;
  role?: UserRole;
}

export class IssueQRCredentialDto {
  employeeId: string;
  validDays?: number; // default: 1 day per FR-UM-02
}

export class UpdateCredentialStatusDto {
  credentialId: string;
  status: CredentialStatus;
  reason?: string;
  updatedBy: string; // Actor ID for audit trail (FR-RA-03)
}

export interface CredentialValidationResult {
  isRecognized: boolean;
  isValid: boolean;
  denialReason?: string;
  employeeId?: string;
  employeeName?: string;
  factoryId?: FactoryId;
  employeeStatus?: UserStatus;
  credentialId?: string;
  credentialStatus?: CredentialStatus;
  version?: number;
  isDynamic?: boolean;
}

export class DynamicQRResponseDto {
  employeeId: string;
  employeeName: string;
  factoryId: FactoryId;
  qrPayload: string;
  generatedAt: string;
  expiresAt: string;
  validDurationSeconds: number;
}
