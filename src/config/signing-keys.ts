type SigningKeyName =
  'JWT_SECRET' | 'JWT_REFRESH_SECRET' | 'QR_JWT_SECRET' | 'LEGACY_QR_SECRET';

const previousDefaults = new Set([
  'tmc_jwt_access_secret_token_key_2026',
  'tmc_jwt_refresh_secret_token_key_2026',
  'tmc_dynamic_qr_secret_2026',
  'TMC_DYNAMIC_QR_SECRET_KEY_2026',
]);

export function requireSigningKey(
  name: SigningKeyName,
  config = process.env,
): string {
  const value = config[name];
  if (!value?.trim() || previousDefaults.has(value.trim())) {
    throw new Error(`Configure a unique signing key for ${name}`);
  }
  return value;
}

export function validateSigningKeys(config: NodeJS.ProcessEnv): void {
  const keys = [
    requireSigningKey('JWT_SECRET', config),
    requireSigningKey('JWT_REFRESH_SECRET', config),
    requireSigningKey(
      config.ENABLE_DB === 'true' ? 'QR_JWT_SECRET' : 'LEGACY_QR_SECRET',
      config,
    ),
  ];
  if (new Set(keys).size !== keys.length) {
    throw new Error('Authentication and QR signing keys must be distinct');
  }
}
