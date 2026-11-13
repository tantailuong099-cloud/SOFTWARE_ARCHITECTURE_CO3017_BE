import { Test } from '@nestjs/testing';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';
import { AuthService } from './auth.service';
import { JwtService } from './jwt.service';
import {
  TOKEN_SESSION_STORE,
  USER_IDENTITY_READER,
} from './auth-persistence.port';
import { UserRole, UserStatus } from '../users/model/user.model';

describe('AuthService persistence substitution', () => {
  const identity = {
    id: '12',
    email: 'test@example.com',
    employeeCode: 'EMP-TEST',
    fullName: 'Test Employee',
    role: UserRole.EMPLOYEE,
    status: UserStatus.ACTIVE,
    passwordHash: '',
  };
  const identities = { findByEmail: jest.fn(), findById: jest.fn() };
  const sessions = {
    replaceForUser: jest.fn(),
    rotateRefresh: jest.fn(),
    revokeForUser: jest.fn(),
  };
  let service: AuthService;
  const originalEnv = process.env;

  beforeAll(async () => {
    process.env = {
      ...originalEnv,
      JWT_SECRET: 'fixture-auth-access',
      JWT_REFRESH_SECRET: 'fixture-auth-refresh',
    };
    identity.passwordHash = await bcrypt.hash('test-password', 4);
    const module = await Test.createTestingModule({
      providers: [
        AuthService,
        JwtService,
        { provide: USER_IDENTITY_READER, useValue: identities },
        { provide: TOKEN_SESSION_STORE, useValue: sessions },
      ],
    }).compile();
    service = module.get(AuthService);
  });

  beforeEach(() => {
    jest.resetAllMocks();
    identities.findByEmail.mockResolvedValue(identity);
    identities.findById.mockResolvedValue(identity);
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('authenticates with the injected reader and persists only token hashes', async () => {
    const result = await service.login({
      email: ' TEST@example.com ',
      password: 'test-password',
    });
    expect(identities.findByEmail).toHaveBeenCalledWith('test@example.com');
    expect(result.user).not.toHaveProperty('passwordHash');
    expect(sessions.replaceForUser).toHaveBeenCalledWith('12', {
      accessHash: createHash('sha256').update(result.accessToken).digest('hex'),
      refreshHash: createHash('sha256')
        .update(result.refreshToken)
        .digest('hex'),
      accessExpiresAt: expect.any(Date),
      refreshExpiresAt: expect.any(Date),
    });
  });

  it('rejects an invalid password without writing a session', async () => {
    await expect(
      service.login({
        email: identity.email,
        password: 'incorrect',
      }),
    ).rejects.toHaveProperty('status', 401);
    expect(sessions.replaceForUser).not.toHaveBeenCalled();
  });

  it('rejects refresh when the injected store refuses to consume the token', async () => {
    const { refreshToken } = await service.login({
      email: identity.email,
      password: 'test-password',
    });
    sessions.rotateRefresh.mockResolvedValue(false);
    await expect(
      service.refreshTokens({ refreshToken }),
    ).rejects.toHaveProperty('status', 401);
    expect(sessions.rotateRefresh).toHaveBeenCalledTimes(1);
  });
});
