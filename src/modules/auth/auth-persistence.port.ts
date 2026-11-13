import type { UserRole, UserStatus } from '../users/model/user.model';

export const USER_IDENTITY_READER = Symbol('USER_IDENTITY_READER');
export const TOKEN_SESSION_STORE = Symbol('TOKEN_SESSION_STORE');
export const ACCESS_SESSION_READER = Symbol('ACCESS_SESSION_READER');

export interface UserIdentity {
  id?: string;
  email: string;
  employeeCode: string;
  fullName: string;
  passwordHash: string;
  status: UserStatus;
  role: UserRole;
  createdAt?: Date;
}

export interface UserIdentityReader {
  findByEmail(email: string): Promise<UserIdentity | null>;
  findById(id: string): Promise<UserIdentity | null>;
}

export interface IssuedSession {
  accessHash: string;
  refreshHash: string;
  accessExpiresAt: Date;
  refreshExpiresAt: Date;
}

export interface AccessSessionReader {
  hasActiveAccess(userId: string, tokenHash: string): Promise<boolean>;
}

export interface TokenSessionStore {
  replaceForUser(userId: string, session: IssuedSession): Promise<void>;
  rotateRefresh(
    userId: string,
    refreshHash: string,
    session: IssuedSession,
  ): Promise<boolean>;
  revokeForUser(userId: string): Promise<void>;
}
