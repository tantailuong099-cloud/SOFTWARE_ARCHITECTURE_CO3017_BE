import {
  BadRequestException,
  Injectable,
  NotFoundException,
  Optional,
} from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { FactoryId } from '../users/model/user.model';
import { LegacyQrCredentials } from './legacy-qr-credentials';
import { SequelizeQrCredentials } from './sequelize-qr-credentials';
import type { ScanCredentialValidator } from './scan-credential.port';

@Injectable()
export class UserQRService implements ScanCredentialValidator {
  constructor(
    private readonly legacy: LegacyQrCredentials,
    @Optional() private readonly database?: SequelizeQrCredentials,
  ) {}

  async getMyCredential(userId: string) {
    if (this.database) return this.database.getMyCredential(userId);
    return this.legacy.findCredential(userId, true) ?? null;
  }

  async generatePresentation(userId: string) {
    if (this.database) return this.database.generatePresentation(userId);
    return this.legacy.generatePresentation(userId);
  }

  async listCredentials() {
    if (this.database) return this.database.listCredentials();
    return this.legacy.listCredentials();
  }

  async issueCredential(userId: string) {
    return this.requireDatabase().issueCredential(userId);
  }

  async revokeCredential(id: string) {
    return this.requireDatabase().revokeCredential(id);
  }

  async validateAndConsume(qrToken: string, transaction?: Transaction) {
    if (this.database)
      return this.database.validateAndConsume(qrToken, transaction);
    return {
      isRecognized: false,
      isValid: false,
      denialReason: 'INVALID_OR_EXPIRED_QR_TOKEN',
    };
  }

  async validateCredential(qrPayload: string, transaction?: Transaction) {
    if (qrPayload.startsWith('TMC:QR:') || qrPayload.startsWith('TMC:DYN:')) {
      return this.database
        ? {
            isRecognized: false,
            isValid: false,
            denialReason: 'UNRECOGNIZED_CREDENTIAL',
          }
        : this.legacy.validateCredential(qrPayload);
    }
    if (!qrPayload.startsWith('TMC:') && !qrPayload.includes('.')) {
      return {
        isRecognized: false,
        isValid: false,
        denialReason: 'UNRECOGNIZED_CREDENTIAL',
      };
    }
    return this.validateAndConsume(qrPayload, transaction);
  }

  async generateDynamicQR(employeeId: string) {
    if (!this.database) return this.legacy.generatePresentation(employeeId);
    const user = await this.database.findUserByEmployeeCode(employeeId);
    if (!user) throw new NotFoundException(`Employee ${employeeId} not found`);
    const presentation = await this.database.generatePresentation(
      String(user.id),
    );
    return {
      employeeId: user.employeeCode || employeeId,
      employeeName: user.fullName,
      factoryId: user.factoryId || FactoryId.BINH_DUONG,
      qrPayload: presentation.qrToken,
      generatedAt: presentation.generatedAt,
      expiresAt: presentation.expiresAt,
      validDurationSeconds: presentation.validForSeconds,
    };
  }

  async getCurrentCredential(employeeId: string) {
    const user = await this.database?.findUserByEmployeeCode(employeeId);
    const credential = user?.id
      ? await this.getMyCredential(user.id)
      : this.database
        ? null
        : this.legacy.findCredential(employeeId);
    return credential ?? { message: 'No QR credential issued' };
  }

  async issueCredentialLegacy(employeeId: string) {
    return this.issueCredential(employeeId);
  }

  private requireDatabase(): SequelizeQrCredentials {
    if (!this.database) {
      throw new BadRequestException(
        'Database QR credentials require ENABLE_DB=true',
      );
    }
    return this.database;
  }
}
