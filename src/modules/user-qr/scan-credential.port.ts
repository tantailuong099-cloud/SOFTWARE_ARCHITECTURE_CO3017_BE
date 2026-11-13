import type { Transaction } from 'sequelize';
import type { CredentialValidationResult } from './dto/user-qr.dto';

export const SCAN_CREDENTIAL_VALIDATOR = Symbol('SCAN_CREDENTIAL_VALIDATOR');

export interface ScanCredentialValidator {
  validateCredential(
    payload: string,
    transaction?: Transaction,
  ): Promise<CredentialValidationResult>;
}
