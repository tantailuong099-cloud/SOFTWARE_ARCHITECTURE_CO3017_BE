import { Injectable, Logger } from '@nestjs/common';
import type { Transaction } from 'sequelize';
import { Op } from 'sequelize';
import { UserModel } from '../users/model/user.model';
import { TokenModel, TokenType } from './model/token.model';
import type {
  AccessSessionReader,
  IssuedSession,
  TokenSessionStore,
  UserIdentity,
  UserIdentityReader,
} from './auth-persistence.port';

@Injectable()
export class SequelizeUserIdentityReader implements UserIdentityReader {
  private readonly logger = new Logger(SequelizeUserIdentityReader.name);

  findByEmail(email: string) {
    return this.read(() => UserModel.findOne({ where: { email } }));
  }

  findById(id: string) {
    return this.read(() => UserModel.findByPk(id));
  }

  private async read(
    lookup: () => Promise<UserModel | null>,
  ): Promise<UserIdentity | null> {
    try {
      const user = await lookup();
      return user ? user.get({ plain: true }) : null;
    } catch {
      this.logger.warn('User identity lookup failed');
      return null;
    }
  }
}

@Injectable()
export class SequelizeTokenSessionStore
  implements TokenSessionStore, AccessSessionReader
{
  async hasActiveAccess(userId: string, tokenHash: string) {
    const token = await TokenModel.findOne({
      where: { userId, tokenHash, type: TokenType.ACCESS, revoked: false },
    });
    return Boolean(token && token.expiresAt.getTime() > Date.now());
  }

  async replaceForUser(userId: string, session: IssuedSession) {
    await TokenModel.sequelize!.transaction(async (transaction) => {
      await UserModel.findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      await TokenModel.update(
        { revoked: true },
        { where: { userId }, transaction },
      );
      await this.storePair(userId, session, transaction);
    });
  }

  async rotateRefresh(
    userId: string,
    refreshHash: string,
    session: IssuedSession,
  ) {
    return TokenModel.sequelize!.transaction(async (transaction) => {
      await UserModel.findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      const [updated] = await TokenModel.update(
        { revoked: true },
        {
          where: {
            userId,
            tokenHash: refreshHash,
            type: TokenType.REFRESH,
            revoked: false,
            expiresAt: { [Op.gt]: new Date() },
          },
          transaction,
        },
      );
      if (updated !== 1) return false;
      await this.storePair(userId, session, transaction);
      return true;
    });
  }

  async revokeForUser(userId: string) {
    await TokenModel.sequelize!.transaction(async (transaction) => {
      await UserModel.findByPk(userId, {
        transaction,
        lock: transaction.LOCK.UPDATE,
      });
      await TokenModel.update(
        { revoked: true },
        { where: { userId }, transaction },
      );
    });
  }

  private async storePair(
    userId: string,
    session: IssuedSession,
    transaction: Transaction,
  ) {
    await TokenModel.bulkCreate(
      [
        {
          userId,
          tokenHash: session.accessHash,
          type: TokenType.ACCESS,
          revoked: false,
          expiresAt: session.accessExpiresAt,
        },
        {
          userId,
          tokenHash: session.refreshHash,
          type: TokenType.REFRESH,
          revoked: false,
          expiresAt: session.refreshExpiresAt,
        },
      ],
      { transaction },
    );
  }
}
