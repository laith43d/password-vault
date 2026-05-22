import { createClient } from '@libsql/client';
import { canAccessVaultItem, type VaultActor } from './access';
import { decryptSecret, encryptSecret } from './crypto';
import { databaseAuthToken, databaseUrl, encryptionKey, superuserEmail, superuserPassword } from './env';
import { hashPassword, verifyPassword } from './passwords';

const client = createClient({
	url: databaseUrl,
	authToken: databaseAuthToken
});

let ready: Promise<void> | undefined;

type Row = Record<string, unknown>;

function asString(value: unknown) {
	return typeof value === 'string' ? value : String(value ?? '');
}

function asBool(value: unknown) {
	return value === 1 || value === true;
}

export type User = {
	id: string;
	email: string;
	name: string;
	isSuperuser: boolean;
	groupIds: string[];
};

export async function initDb() {
	await client.batch(
		[
			`CREATE TABLE IF NOT EXISTS users (
				id TEXT PRIMARY KEY,
				email TEXT NOT NULL UNIQUE,
				name TEXT NOT NULL,
				password_hash TEXT NOT NULL,
				is_superuser INTEGER NOT NULL DEFAULT 0,
				created_at TEXT NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				expires_at INTEGER NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS groups (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL UNIQUE
			)`,
			`CREATE TABLE IF NOT EXISTS group_members (
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
				PRIMARY KEY (user_id, group_id)
			)`,
			`CREATE TABLE IF NOT EXISTS vault_items (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				username TEXT NOT NULL,
				url TEXT NOT NULL DEFAULT '',
				notes TEXT NOT NULL DEFAULT '',
				secret_ciphertext TEXT NOT NULL,
				secret_iv TEXT NOT NULL,
				secret_tag TEXT NOT NULL,
				created_by TEXT NOT NULL REFERENCES users(id),
				updated_at TEXT NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS item_user_access (
				item_id TEXT NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				PRIMARY KEY (item_id, user_id)
			)`,
			`CREATE TABLE IF NOT EXISTS item_group_access (
				item_id TEXT NOT NULL REFERENCES vault_items(id) ON DELETE CASCADE,
				group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
				PRIMARY KEY (item_id, group_id)
			)`
		],
		'write'
	);

	await client.execute({
		sql: `INSERT OR IGNORE INTO users (id, email, name, password_hash, is_superuser, created_at)
			VALUES (?, ?, ?, ?, 1, ?)`,
		args: [
			crypto.randomUUID(),
			superuserEmail,
			'Superuser',
			await hashPassword(superuserPassword),
			new Date().toISOString()
		]
	});
}

export function ensureDb() {
	ready ??= initDb();
	return ready;
}

async function groupIdsForUser(userId: string) {
	const rows = await client.execute({
		sql: 'SELECT group_id FROM group_members WHERE user_id = ?',
		args: [userId]
	});
	return rows.rows.map((row) => asString(row.group_id));
}

async function userFromRow(row: Row): Promise<User> {
	const id = asString(row.id);
	return {
		id,
		email: asString(row.email),
		name: asString(row.name),
		isSuperuser: asBool(row.is_superuser),
		groupIds: await groupIdsForUser(id)
	};
}

export async function getUserBySession(sessionId: string | undefined) {
	await ensureDb();
	if (!sessionId) return null;
	const result = await client.execute({
		sql: `SELECT users.* FROM sessions
			JOIN users ON users.id = sessions.user_id
			WHERE sessions.id = ? AND sessions.expires_at > ?`,
		args: [sessionId, Date.now()]
	});
	if (!result.rows[0]) return null;
	return userFromRow(result.rows[0]);
}

export async function login(email: string, password: string) {
	await ensureDb();
	const result = await client.execute({ sql: 'SELECT * FROM users WHERE email = ?', args: [email] });
	const row = result.rows[0];
	if (!row || !(await verifyPassword(password, asString(row.password_hash)))) return null;
	const sessionId = crypto.randomUUID();
	await client.execute({
		sql: 'INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)',
		args: [sessionId, asString(row.id), Date.now() + 1000 * 60 * 60 * 24 * 14]
	});
	return sessionId;
}

export async function logout(sessionId: string | undefined) {
	await ensureDb();
	if (sessionId) await client.execute({ sql: 'DELETE FROM sessions WHERE id = ?', args: [sessionId] });
}

export async function listUsers() {
	await ensureDb();
	const result = await client.execute('SELECT id, email, name, is_superuser FROM users ORDER BY name');
	return Promise.all(result.rows.map(userFromRow));
}

export async function createUser(email: string, name: string, password: string, isSuperuser = false) {
	await ensureDb();
	await client.execute({
		sql: `INSERT INTO users (id, email, name, password_hash, is_superuser, created_at)
			VALUES (?, ?, ?, ?, ?, ?)`,
		args: [
			crypto.randomUUID(),
			email,
			name,
			await hashPassword(password),
			isSuperuser ? 1 : 0,
			new Date().toISOString()
		]
	});
}

export async function listGroups() {
	await ensureDb();
	const result = await client.execute('SELECT id, name FROM groups ORDER BY name');
	return result.rows.map((row) => ({ id: asString(row.id), name: asString(row.name) }));
}

export async function createGroup(name: string) {
	await ensureDb();
	await client.execute({ sql: 'INSERT INTO groups (id, name) VALUES (?, ?)', args: [crypto.randomUUID(), name] });
}

export async function setGroupMember(userId: string, groupId: string, enabled: boolean) {
	await ensureDb();
	if (enabled) {
		await client.execute({
			sql: 'INSERT OR IGNORE INTO group_members (user_id, group_id) VALUES (?, ?)',
			args: [userId, groupId]
		});
	} else {
		await client.execute({
			sql: 'DELETE FROM group_members WHERE user_id = ? AND group_id = ?',
			args: [userId, groupId]
		});
	}
}

export async function createVaultItem(input: {
	title: string;
	username: string;
	password: string;
	url: string;
	notes: string;
	createdBy: string;
}) {
	await ensureDb();
	const sealed = await encryptSecret(input.password, encryptionKey);
	await client.execute({
		sql: `INSERT INTO vault_items
			(id, title, username, url, notes, secret_ciphertext, secret_iv, secret_tag, created_by, updated_at)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
		args: [
			crypto.randomUUID(),
			input.title,
			input.username,
			input.url,
			input.notes,
			sealed.ciphertext,
			sealed.iv,
			sealed.tag,
			input.createdBy,
			new Date().toISOString()
		]
	});
}

async function grantsForItem(itemId: string) {
	const [users, groups] = await Promise.all([
		client.execute({ sql: 'SELECT user_id FROM item_user_access WHERE item_id = ?', args: [itemId] }),
		client.execute({ sql: 'SELECT group_id FROM item_group_access WHERE item_id = ?', args: [itemId] })
	]);
	return {
		userIds: users.rows.map((row) => asString(row.user_id)),
		groupIds: groups.rows.map((row) => asString(row.group_id))
	};
}

export async function listVaultItems(actor: VaultActor) {
	await ensureDb();
	const result = await client.execute('SELECT * FROM vault_items ORDER BY updated_at DESC');
	const items = await Promise.all(
		result.rows.map(async (row) => {
			const id = asString(row.id);
			const grants = await grantsForItem(id);
			return {
				id,
				title: asString(row.title),
				username: asString(row.username),
				url: asString(row.url),
				notes: asString(row.notes),
				updatedAt: asString(row.updated_at),
				access: grants,
				canAccess: canAccessVaultItem(actor, grants)
			};
		})
	);
	return items.filter((item) => item.canAccess);
}

export async function revealSecret(actor: VaultActor, itemId: string) {
	await ensureDb();
	const result = await client.execute({ sql: 'SELECT * FROM vault_items WHERE id = ?', args: [itemId] });
	const row = result.rows[0];
	if (!row) return null;
	const grants = await grantsForItem(itemId);
	if (!canAccessVaultItem(actor, grants)) return null;
	return await decryptSecret(
		{
			ciphertext: asString(row.secret_ciphertext),
			iv: asString(row.secret_iv),
			tag: asString(row.secret_tag)
		},
		encryptionKey
	);
}

export async function setItemUserAccess(itemId: string, userId: string, enabled: boolean) {
	await ensureDb();
	await client.execute({
		sql: enabled
			? 'INSERT OR IGNORE INTO item_user_access (item_id, user_id) VALUES (?, ?)'
			: 'DELETE FROM item_user_access WHERE item_id = ? AND user_id = ?',
		args: [itemId, userId]
	});
}

export async function setItemGroupAccess(itemId: string, groupId: string, enabled: boolean) {
	await ensureDb();
	await client.execute({
		sql: enabled
			? 'INSERT OR IGNORE INTO item_group_access (item_id, group_id) VALUES (?, ?)'
			: 'DELETE FROM item_group_access WHERE item_id = ? AND group_id = ?',
		args: [itemId, groupId]
	});
}
