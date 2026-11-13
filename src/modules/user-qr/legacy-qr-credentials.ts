import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { FactoryId, UserModel, UserStatus } from '../users/model/user.model';
import { CredentialStatus } from './model/qr-credential.model';
import { CredentialValidationResult } from './dto/user-qr.dto';

type LegacyCredentialStatus = CredentialStatus | 'SUSPENDED';

export interface LegacyUser {
  employeeId: string;
  fullName: string;
  factoryId: FactoryId;
  status: UserStatus;
}

export interface LegacyCredential {
  qrPayload: string;
  employeeId: string;
  status: LegacyCredentialStatus;
  credentialId: string;
  expiresAt: Date;
}

@Injectable()
export class LegacyQrCredentials {
  private readonly legacyDynamicNonces = new Set<string>();
  private readonly legacyUsers = new Map<string, LegacyUser>();
  private readonly legacyCredentials = new Map<string, LegacyCredential>();
  private readonly legacySecret = 'TMC_DYNAMIC_QR_SECRET_KEY_2026';

  constructor() {
    this.seedLegacyCompatibility();
  }

  private seedLegacyCompatibility() {
    const users: Array<[string, string, FactoryId]> = [
      ['EMP-BD-001', 'Nguyen Van An', FactoryId.BINH_DUONG],
      ['EMP-BD-002', 'Tran Thi Bich', FactoryId.BINH_DUONG],
      ['EMP-BD-003', 'Le Hoang Nam', FactoryId.BINH_DUONG],
      ['EMP-LA-001', 'Pham Minh Duc', FactoryId.LONG_AN],
      ['ADM-001', 'System Administrator', FactoryId.BINH_DUONG],
    ];
    users.forEach(([employeeId, fullName, factoryId]) =>
      this.legacyUsers.set(employeeId, {
        employeeId,
        fullName,
        factoryId,
        status:
          employeeId === 'EMP-BD-003' ? UserStatus.INACTIVE : UserStatus.ACTIVE,
      }),
    );
    const now = new Date();
    const credentials: Array<[string, string, LegacyCredentialStatus, string]> =
      [
        [
          'TMC:QR:EMP-BD-001:V1:SEC_VALID_KEY_001',
          'EMP-BD-001',
          CredentialStatus.ACTIVE,
          'CRED-BD-001',
        ],
        [
          'TMC:QR:ADM-001:V1:SEC_VALID_KEY_ADM01',
          'ADM-001',
          CredentialStatus.ACTIVE,
          'CRED-ADM-001',
        ],
        [
          'TMC:QR:EMP-BD-002:V1:SEC_SUSPENDED_KEY_002',
          'EMP-BD-002',
          'SUSPENDED',
          'CRED-BD-002',
        ],
        [
          'TMC:QR:EMP-BD-003:V1:SEC_EXPIRED_KEY_003',
          'EMP-BD-003',
          CredentialStatus.EXPIRED,
          'CRED-BD-003',
        ],
        [
          'TMC:QR:EMP-LA-001:V1:SEC_VALID_KEY_LA01',
          'EMP-LA-001',
          CredentialStatus.ACTIVE,
          'CRED-LA-001',
        ],
      ];
    credentials.forEach(([qrPayload, employeeId, status, credentialId]) => {
      this.legacyCredentials.set(qrPayload, {
        qrPayload,
        employeeId,
        status,
        credentialId,
        expiresAt:
          credentialId === 'CRED-BD-003'
            ? new Date(now.getTime() - 60_000)
            : new Date(now.getTime() + 86_400_000),
      });
    });
  }

  validateCredential(payload: string): CredentialValidationResult {
    if (!payload.startsWith('TMC:DYN:')) {
      const credential = this.legacyCredentials.get(payload);
      if (!credential)
        return {
          isRecognized: false,
          isValid: false,
          denialReason: 'UNRECOGNIZED_CREDENTIAL',
        };
      const employee = this.legacyUsers.get(credential.employeeId);
      if (!employee)
        return {
          isRecognized: false,
          isValid: false,
          denialReason: 'EMPLOYEE_RECORD_MISSING',
        };
      let denialReason: string | undefined;
      if (credential.expiresAt.getTime() <= Date.now())
        denialReason = 'CREDENTIAL_EXPIRED';
      else if (credential.status === 'SUSPENDED')
        denialReason = 'CREDENTIAL_SUSPENDED';
      else if (credential.status === CredentialStatus.REVOKED)
        denialReason = 'CREDENTIAL_REVOKED';
      else if (credential.status !== CredentialStatus.ACTIVE)
        denialReason = 'INVALID_CREDENTIAL';
      return {
        isRecognized: true,
        isValid: !denialReason && employee.status === UserStatus.ACTIVE,
        denialReason,
        employeeId: employee.employeeId,
        employeeName: employee.fullName,
        factoryId: employee.factoryId,
        employeeStatus: employee.status,
        credentialId: credential.credentialId,
        credentialStatus:
          credential.status === CredentialStatus.ACTIVE ||
          credential.status === CredentialStatus.REVOKED ||
          credential.status === CredentialStatus.EXPIRED
            ? credential.status
            : undefined,
      };
    }
    const [, , employeeId, timestamp, nonce, signature] = payload.split(':');
    const employee = this.legacyUsers.get(employeeId);
    if (!employee)
      return {
        isRecognized: true,
        isValid: false,
        denialReason: 'EMPLOYEE_RECORD_MISSING',
      };
    const expected = crypto
      .createHmac('sha256', this.legacySecret)
      .update(`${employeeId}:${timestamp}:${nonce}`)
      .digest('hex')
      .slice(0, 16);
    if (signature !== expected)
      return {
        isRecognized: true,
        isValid: false,
        denialReason: 'DYNAMIC_QR_SIGNATURE_INVALID',
      };
    if (Math.abs(Date.now() - Number(timestamp)) > 60_000)
      return {
        isRecognized: true,
        isValid: false,
        denialReason: 'DYNAMIC_QR_EXPIRED',
      };
    if (this.legacyDynamicNonces.has(nonce))
      return {
        isRecognized: true,
        isValid: false,
        denialReason: 'DYNAMIC_QR_REPLAY_ATTACK',
      };
    this.legacyDynamicNonces.add(nonce);
    return {
      isRecognized: true,
      isValid: true,
      employeeId,
      employeeName: employee.fullName,
      factoryId: employee.factoryId,
      employeeStatus: employee.status,
      credentialId: `DYN-${employeeId}`,
      isDynamic: true,
    };
  }

  generatePresentation(employeeId: string, customUser?: UserModel | null) {
    let employee =
      this.legacyUsers.get(employeeId) ||
      [...this.legacyUsers.values()].find(
        (user) => user.employeeId === employeeId,
      );

    if (!employee && customUser) {
      employee = {
        employeeId: customUser.employeeCode || employeeId,
        fullName: customUser.fullName,
        factoryId: (customUser.factoryId as FactoryId) || FactoryId.BINH_DUONG,
        status: customUser.status,
      };
      this.legacyUsers.set(employeeId, employee);
    }

    if (!employee)
      throw new NotFoundException(`Employee ${employeeId} not found`);
    if (employee.status !== UserStatus.ACTIVE)
      throw new BadRequestException('Inactive users cannot issue dynamic QR');
    const now = Date.now();
    const nonce = crypto.randomBytes(4).toString('hex');
    const signature = crypto
      .createHmac('sha256', this.legacySecret)
      .update(`${employeeId}:${now}:${nonce}`)
      .digest('hex')
      .slice(0, 16);
    const expiresAt = new Date(now + 60_000);
    return {
      employeeId,
      employeeName: employee.fullName,
      factoryId: employee.factoryId,
      qrPayload: `TMC:DYN:${employeeId}:${now}:${nonce}:${signature}`,
      generatedAt: new Date(now).toISOString(),
      expiresAt: expiresAt.toISOString(),
      validDurationSeconds: 60,
    };
  }

  listCredentials() {
    return [...this.legacyCredentials.values()];
  }

  findCredential(employeeId: string, activeOnly = false) {
    return this.listCredentials().find(
      (item) =>
        item.employeeId === employeeId &&
        (!activeOnly || item.status === CredentialStatus.ACTIVE),
    );
  }
}
