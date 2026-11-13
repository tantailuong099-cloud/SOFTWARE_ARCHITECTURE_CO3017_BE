import { validateSigningKeys } from './signing-keys';

const databaseConfig = {
  ENABLE_DB: 'true',
  JWT_SECRET: 'fixture-access',
  JWT_REFRESH_SECRET: 'fixture-refresh',
  QR_JWT_SECRET: 'fixture-presentation',
};

describe('Signing key configuration', () => {
  it('requires distinct access, refresh and presentation keys for database mode', () => {
    expect(() => validateSigningKeys(databaseConfig)).not.toThrow();
    expect(() =>
      validateSigningKeys({
        ...databaseConfig,
        QR_JWT_SECRET: 'fixture-access',
      }),
    ).toThrow('must be distinct');
  });

  it('rejects missing and previously published defaults', () => {
    expect(() =>
      validateSigningKeys({ ...databaseConfig, JWT_SECRET: '' }),
    ).toThrow('JWT_SECRET');
    expect(() =>
      validateSigningKeys({
        ...databaseConfig,
        JWT_REFRESH_SECRET: 'tmc_jwt_refresh_secret_token_key_2026',
      }),
    ).toThrow('JWT_REFRESH_SECRET');
  });

  it('requires a separate legacy signing key in compatibility mode', () => {
    const legacyConfig = { ...databaseConfig, ENABLE_DB: 'false' };
    expect(() => validateSigningKeys(legacyConfig)).toThrow('LEGACY_QR_SECRET');
    expect(() =>
      validateSigningKeys({
        ...legacyConfig,
        LEGACY_QR_SECRET: 'fixture-legacy',
      }),
    ).not.toThrow();
  });
});
