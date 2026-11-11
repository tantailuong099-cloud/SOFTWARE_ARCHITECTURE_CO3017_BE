import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { Transaction } from 'sequelize';
import { FactoryId, UserModel, UserStatus } from '../users/model/user.model';
import {
  CredentialStatus,
  QRCredentialModel,
} from './model/qr-credential.model';
import { QRPresentationModel } from './model/qr-presentation.model';
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
export class UserQRService {
  private readonly legacyDynamicNonces = new Set<string>();
  private readonly legacyUsers = new Map<string, LegacyUser>();
  private readonly legacyCredentials = new Map<string, LegacyCredential>();
  private readonly legacySecret = 'TMC_DYNAMIC_QR_SECRET_KEY_2026';

  private readonly userModel?: typeof UserModel;
  private readonly credentialModel?: typeof QRCredentialModel;
  private readonly presentationModel?: typeof QRPresentationModel;

  constructor() {
    this.userModel = process.env.ENABLE_DB === 'true' ? UserModel : undefined;
    this.credentialModel =
      process.env.ENABLE_DB === 'true' ? QRCredentialModel : undefined;
    this.presentationModel =
      process.env.ENABLE_DB === 'true' ? QRPresentationModel : undefined;
    this.seedLegacyCompatibility();
  }

  private seedLegacyCompatibility() {
    const users: Array<[string, string, FactoryId]> = [
      ['EMP-BD-001', 'Nguyen Van An', FactoryId.BINH_DUONG],
      ['EMP-BD-002', 'Tran Thi Bich', FactoryId.BINH_DUONG],
      ['EMP-BD-003', 'Le Hoang Nam', FactoryId.BINH_DUONG],
      ['EMP-LA-001', 'Pham Minh Duc', FactoryId.LONG_AN],
      ['EMP-LA-001', 'Pham Minh Duc', FactoryId.LONG_AN],
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

  async getMyCredential(userId: string) {
    if (!this.credentialModel) {
      const credential = [...this.legacyCredentials.values()].find(
        (item) =>
          item.employeeId === userId && item.status === CredentialStatus.ACTIVE,
      );
      return credential ?? null;
    }
    const credential = await this.credentialModel.findOne({
      where: { userId, status: CredentialStatus.ACTIVE },
      include: [UserModel],
    });
    return credential ? this.publicCredential(credential) : null;
  }

  async generatePresentation(userId: string) {
    if (!this.userModel || !this.credentialModel || !this.presentationModel) {
      return this.generateLegacyPresentation(userId);
    }
    const user = await this.userModel.findByPk(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    if (user.status !== UserStatus.ACTIVE) {
      throw new BadRequestException(
        'Inactive users cannot generate a QR presentation',
      );
    }
    const credential = await this.credentialModel.findOne({
      where: { userId, status: CredentialStatus.ACTIVE },
    });
    if (!credential)
      throw new BadRequestException('User has no active QR credential');
    if (credential.expiresAt && credential.expiresAt.getTime() <= Date.now()) {
      throw new BadRequestException('QR credential has expired');
    }

    const ttl = Number(process.env.QR_PRESENTATION_TTL_SECONDS || 30);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const jti = crypto.randomUUID();
    await this.presentationModel.create({
      jti,
      credentialId: String(credential.id),
      expiresAt,
      consumedAt: null,
      createdAt: now,
    });
    const qrToken = jwt.sign(
      {
        sub: String(user.id),
        credentialId: String(credential.id),
        credentialUuid: credential.credentialUuid,
        jti,
        type: 'QR_PRESENTATION',
      },
      process.env.QR_JWT_SECRET || 'tmc_dynamic_qr_secret_2026',
      { expiresIn: ttl },
    );
    return {
      qrToken,
      jti,
      generatedAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
      validForSeconds: ttl,
    };
  }

  async listCredentials() {
    if (!this.credentialModel) {
      return [...this.legacyCredentials.values()];
    }
    const credentials = await this.credentialModel.findAll({
      include: [UserModel],
      order: [['id', 'ASC']],
    });
    return credentials.map((credential) => this.publicCredential(credential));
  }

  async issueCredential(userId: string) {
    if (!this.userModel || !this.credentialModel) {
      throw new BadRequestException(
        'Database QR credentials require ENABLE_DB=true',
      );
    }
    const user = await this.userModel.findByPk(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return UserModel.sequelize!.transaction(async (transaction) => {
      await this.credentialModel!.update(
        { status: CredentialStatus.REVOKED, revokedAt: new Date() },
        {
          where: { userId: String(userId), status: CredentialStatus.ACTIVE },
          transaction,
        },
      );
      const credential = await this.credentialModel!.create(
        {
          credentialUuid: crypto.randomUUID(),
          userId,
          status: CredentialStatus.ACTIVE,
          issuedAt: new Date(),
          expiresAt: null,
          revokedAt: null,
        },
        { transaction },
      );
      return this.publicCredential(credential);
    });
  }

  async revokeCredential(id: string) {
    if (!this.credentialModel)
      throw new BadRequestException(
        'Database QR credentials require ENABLE_DB=true',
      );
    const credential = await this.credentialModel.findByPk(id);
    if (!credential)
      throw new NotFoundException(`QR credential ${id} not found`);
    credential.status = CredentialStatus.REVOKED;
    credential.revokedAt = new Date();
    await credential.save();
    return this.publicCredential(credential);
  }

  async validateAndConsume(qrToken : string, transaction? : Transaction) : Promise<CredentialValidationResult> {
    let payload : jwt.JwtPayload;
    try {
      payload = jwt.verify(qrToken, process.env.QR_JWT_SECRET || 'tmc_dynamic_qr_secret_2026') as jwt.JwtPayload;
    } catch (error) {
      if (!(error instanceof jwt.JsonWebTokenError)) throw error;
      return { isRecognized : false, isValid : false, denialReason : 'INVALID_OR_EXPIRED_QR_TOKEN' };
    }

    if (payload.type !== 'QR_PRESENTATION' || !payload.jti || !payload.sub || !payload.credentialId) {
      return { isRecognized : false, isValid : false, denialReason : 'INVALID_QR_TOKEN' };
    }
    if (!this.presentationModel || !this.credentialModel || !this.userModel) {
      return this.validateLegacyCredential(qrToken);
    }

    const credentialId       = String(payload.credentialId);
    const presentationUserId = String(payload.sub);
    const consume = async (activeTransaction : Transaction) : Promise<CredentialValidationResult> => {
      const presentation = await this.presentationModel!.findOne({
        where : { jti : String(payload.jti), credentialId },
        transaction : activeTransaction,
        lock : activeTransaction.LOCK.UPDATE,
      });
      if (!presentation || presentation.consumedAt || presentation.expiresAt.getTime() <= Date.now()) {
        return { isRecognized : true, isValid : false, denialReason : 'QR_PRESENTATION_EXPIRED_OR_CONSUMED' };
      }

      const credential = await this.credentialModel!.findByPk(credentialId, { transaction : activeTransaction });
      const user = await this.userModel!.findByPk(presentationUserId, { transaction : activeTransaction });
      if (!credential || String(credential.id) !== credentialId ||
          credential.status !== CredentialStatus.ACTIVE || credential.userId !== presentationUserId) {
        return { isRecognized : true, isValid : false, denialReason : 'QR_CREDENTIAL_REVOKED' };
      }
      if (!user || user.status !== UserStatus.ACTIVE) {
        return { isRecognized : true, isValid : false, denialReason : 'INACTIVE_EMPLOYEE' };
      }

      presentation.consumedAt = new Date();
      await presentation.save({ transaction : activeTransaction });
      return {
        isRecognized     : true,
        isValid          : true,
        employeeId       : String(user.id),
        employeeName     : user.fullName,
        factoryId        : user.factoryId ?? undefined,
        employeeStatus   : user.status,
        credentialId     : String(credential.id),
        credentialStatus : CredentialStatus.ACTIVE,
        isDynamic        : true,
      };
    };

    return transaction ? consume(transaction) : UserModel.sequelize!.transaction(consume);
  }

  async validateCredential(qrPayload : string, transaction? : Transaction) : Promise<CredentialValidationResult> {
    if (qrPayload.startsWith('TMC:QR:') || qrPayload.startsWith('TMC:DYN:')) {
      return this.validateLegacyCredential(qrPayload);
    }
    if (!qrPayload.startsWith('TMC:') && !qrPayload.includes('.')) {
      return { isRecognized : false, isValid : false, denialReason : 'UNRECOGNIZED_CREDENTIAL' };
    }
    return this.validateAndConsume(qrPayload, transaction);
  }

  private validateLegacyCredential(
    payload: string,
  ): CredentialValidationResult {
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

  private generateLegacyPresentation(employeeId: string) {
    const employee =
      this.legacyUsers.get(employeeId) ||
      [...this.legacyUsers.values()].find(
        (user) => user.employeeId === employeeId,
      );
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

  async generateDynamicQR(employeeId: string) {
    const numericUser = await this.findUserIdByEmployeeCode(employeeId);
    return numericUser
      ? this.generatePresentation(numericUser)
      : this.generateLegacyPresentation(employeeId);
  }

  private async findUserIdByEmployeeCode(employeeCode: string) {
    if (!this.userModel) return null;
    const user = await this.userModel.findOne({ where: { employeeCode } });
    return user?.id ?? null;
  }

  async getCurrentCredential(employeeId: string) {
    const numericUser = await this.findUserIdByEmployeeCode(employeeId);
    const credential = numericUser
      ? await this.getMyCredential(numericUser)
      : [...this.legacyCredentials.values()].find(
          (item) => item.employeeId === employeeId,
        );
    return credential ?? { message: 'No QR credential issued' };
  }

  async issueCredentialLegacy(employeeId: string) {
    return this.issueCredential(employeeId);
  }

  private publicCredential(credential: QRCredentialModel) {
    return {
      id: credential.id,
      credentialUuid: credential.credentialUuid,
      userId: credential.userId,
      status: credential.status,
      issuedAt: credential.issuedAt,
      expiresAt: credential.expiresAt,
      revokedAt: credential.revokedAt,
    };
  }
}
