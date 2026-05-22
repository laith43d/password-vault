import { env } from '$env/dynamic/private';

export const databaseUrl = env.TURSO_DATABASE_URL || env.DATABASE_URL || 'file:local.db';
export const databaseAuthToken = env.TURSO_AUTH_TOKEN;
export const encryptionKey =
	env.APP_ENCRYPTION_KEY || 'dev-only-password-vault-key-32!!';
export const superuserEmail = env.SUPERUSER_EMAIL || 'admin@vault.local';
export const superuserPassword = env.SUPERUSER_PASSWORD || 'ChangeMe123!';
