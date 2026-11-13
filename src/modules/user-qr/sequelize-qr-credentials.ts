import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/sequelize';
import * as crypto from 'crypto';
import * as jwt from 'jsonwebtoken';
import type { Transaction } from 'sequelize';
import { UserModel, UserStatus } from '../users/model/user.model';
import {
  CredentialStatus,
  QRCredentialModel,
} from './model/qr-credential.model';
import { QRPresentationModel } from './model/qr-presentation.model';
import { CredentialValidationResult } from './dto/user-qr.dto';

@Injectable()
export class SequelizeQrCredentials {
  constructor(
    @InjectModel(UserModel)
    private readonly userModel: typeof UserModel,
    @InjectModel(QRCredentialModel)
    private readonly credentialModel: typeof QRCredentialModel,
    @InjectModel(QRPresentationModel)
    private readonly presentationModel: typeof QRPresentationModel,
  ) {}

  findUserByEmployeeCode(employeeCode: string) {
    return this.userModel.findOne({ where: { employeeCode } });
  }

  async getMyCredential(userId: string) {
    const credential = await this.credentialModel.findOne({
      where: { userId, status: CredentialStatus.ACTIVE },
      include: [this.userModel],
    });
    return credential ? this.publicCredential(credential) : null;
  }

  async generatePresentation(userId: string) {
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
    const credentials = await this.credentialModel.findAll({
      include: [this.userModel],
      order: [['id', 'ASC']],
    });
    return credentials.map((credential) => this.publicCredential(credential));
  }

  async issueCredential(userId: string) {
    const user = await this.userModel.findByPk(userId);
    if (!user) throw new NotFoundException(`User ${userId} not found`);
    return this.userModel.sequelize!.transaction(async (transaction) => {
      await this.credentialModel.update(
        { status: CredentialStatus.REVOKED, revokedAt: new Date() },
        {
          where: { userId: String(userId), status: CredentialStatus.ACTIVE },
          transaction,
        },
      );
      const credential = await this.credentialModel.create(
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
    const credential = await this.credentialModel.findByPk(id);
    if (!credential)
      throw new NotFoundException(`QR credential ${id} not found`);
    credential.status = CredentialStatus.REVOKED;
    credential.revokedAt = new Date();
    await credential.save();
    return this.publicCredential(credential);
  }

  async validateAndConsume(
    qrToken: string,
    transaction?: Transaction,
  ): Promise<CredentialValidationResult> {
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(
        qrToken,
        process.env.QR_JWT_SECRET || 'tmc_dynamic_qr_secret_2026',
      ) as jwt.JwtPayload;
    } catch (error) {
      if (!(error instanceof jwt.JsonWebTokenError)) throw error;
      return {
        isRecognized: false,
        isValid: false,
        denialReason: 'INVALID_OR_EXPIRED_QR_TOKEN',
      };
    }

    if (
      payload.type !== 'QR_PRESENTATION' ||
      !payload.jti ||
      !payload.sub ||
      !payload.credentialId
    ) {
      return {
        isRecognized: false,
        isValid: false,
        denialReason: 'INVALID_QR_TOKEN',
      };
    }
    const credentialId = String(payload.credentialId);
    const presentationUserId = String(payload.sub);
    const consume = async (
      activeTransaction: Transaction,
    ): Promise<CredentialValidationResult> => {
      const presentation = await this.presentationModel.findOne({
        where: { jti: String(payload.jti), credentialId },
        transaction: activeTransaction,
        lock: activeTransaction.LOCK.UPDATE,
      });
      if (
        !presentation ||
        presentation.consumedAt ||
        presentation.expiresAt.getTime() <= Date.now()
      ) {
        return {
          isRecognized: true,
          isValid: false,
          denialReason: 'QR_PRESENTATION_EXPIRED_OR_CONSUMED',
        };
      }

      const credential = await this.credentialModel.findByPk(credentialId, {
        transaction: activeTransaction,
      });
      const user = await this.userModel.findByPk(presentationUserId, {
        transaction: activeTransaction,
      });
      if (
        !credential ||
        String(credential.id) !== credentialId ||
        credential.status !== CredentialStatus.ACTIVE ||
        credential.userId !== presentationUserId
      ) {
        return {
          isRecognized: true,
          isValid: false,
          denialReason: 'QR_CREDENTIAL_REVOKED',
        };
      }
      if (!user || user.status !== UserStatus.ACTIVE) {
        return {
          isRecognized: true,
          isValid: false,
          denialReason: 'INACTIVE_EMPLOYEE',
        };
      }

      presentation.consumedAt = new Date();
      await presentation.save({ transaction: activeTransaction });
      return {
        isRecognized: true,
        isValid: true,
        employeeId: String(user.id),
        employeeName: user.fullName,
        factoryId: user.factoryId ?? undefined,
        employeeStatus: user.status,
        credentialId: String(credential.id),
        credentialStatus: CredentialStatus.ACTIVE,
        isDynamic: true,
      };
    };

    return transaction
      ? consume(transaction)
      : this.userModel.sequelize!.transaction(consume);
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
