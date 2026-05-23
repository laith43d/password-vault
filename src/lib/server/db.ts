import { createClient } from '@libsql/client';
import {
	canAccessHierarchyNode,
	canAccessVaultItem,
	wouldCreateHierarchyCycle,
	type HierarchyNodeAccess,
	type VaultActor
} from './access';
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
			`CREATE TABLE IF NOT EXISTS hierarchy_nodes (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				parent_id TEXT REFERENCES hierarchy_nodes(id) ON DELETE RESTRICT,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL
			)`,
			`CREATE TABLE IF NOT EXISTS node_user_access (
				node_id TEXT NOT NULL REFERENCES hierarchy_nodes(id) ON DELETE CASCADE,
				user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				PRIMARY KEY (node_id, user_id)
			)`,
			`CREATE TABLE IF NOT EXISTS node_group_access (
				node_id TEXT NOT NULL REFERENCES hierarchy_nodes(id) ON DELETE CASCADE,
				group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
				PRIMARY KEY (node_id, group_id)
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

	try {
		await client.execute('ALTER TABLE vault_items ADD COLUMN node_id TEXT REFERENCES hierarchy_nodes(id)');
	} catch (error) {
		if (!String(error).includes('duplicate column')) throw error;
	}

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

	const root = await client.execute('SELECT id FROM hierarchy_nodes ORDER BY created_at LIMIT 1');
	let rootId = asString(root.rows[0]?.id);
	if (!rootId) {
		rootId = crypto.randomUUID();
		await client.execute({
			sql: `INSERT INTO hierarchy_nodes (id, name, parent_id, created_at, updated_at)
				VALUES (?, 'Vault', NULL, ?, ?)`,
			args: [rootId, new Date().toISOString(), new Date().toISOString()]
		});
	}
	await client.execute({ sql: 'UPDATE vault_items SET node_id = ? WHERE node_id IS NULL', args: [rootId] });
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

export async function updateUser(input: {
	id: string;
	email: string;
	name: string;
	password?: string;
	isSuperuser: boolean;
}) {
	await ensureDb();
	if (input.password) {
		await client.execute({
			sql: 'UPDATE users SET email = ?, name = ?, password_hash = ?, is_superuser = ? WHERE id = ?',
			args: [
				input.email,
				input.name,
				await hashPassword(input.password),
				input.isSuperuser ? 1 : 0,
				input.id
			]
		});
		return;
	}

	await client.execute({
		sql: 'UPDATE users SET email = ?, name = ?, is_superuser = ? WHERE id = ?',
		args: [input.email, input.name, input.isSuperuser ? 1 : 0, input.id]
	});
}

export async function deleteUser(userId: string) {
	await ensureDb();
	await client.batch(
		[
			{ sql: 'DELETE FROM sessions WHERE user_id = ?', args: [userId] },
			{ sql: 'DELETE FROM group_members WHERE user_id = ?', args: [userId] },
			{ sql: 'DELETE FROM item_user_access WHERE user_id = ?', args: [userId] },
			{ sql: 'DELETE FROM users WHERE id = ?', args: [userId] }
		],
		'write'
	);
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

export async function updateGroup(groupId: string, name: string) {
	await ensureDb();
	await client.execute({ sql: 'UPDATE groups SET name = ? WHERE id = ?', args: [name, groupId] });
}

export async function deleteGroup(groupId: string) {
	await ensureDb();
	await client.batch(
		[
			{ sql: 'DELETE FROM group_members WHERE group_id = ?', args: [groupId] },
			{ sql: 'DELETE FROM item_group_access WHERE group_id = ?', args: [groupId] },
			{ sql: 'DELETE FROM groups WHERE id = ?', args: [groupId] }
		],
		'write'
	);
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

async function grantsForNode(nodeId: string) {
	const [users, groups] = await Promise.all([
		client.execute({ sql: 'SELECT user_id FROM node_user_access WHERE node_id = ?', args: [nodeId] }),
		client.execute({ sql: 'SELECT group_id FROM node_group_access WHERE node_id = ?', args: [nodeId] })
	]);
	return {
		userIds: users.rows.map((row) => asString(row.user_id)),
		groupIds: groups.rows.map((row) => asString(row.group_id))
	};
}

async function allHierarchyAccessNodes(): Promise<HierarchyNodeAccess[]> {
	const result = await client.execute('SELECT id, parent_id FROM hierarchy_nodes ORDER BY name');
	return Promise.all(
		result.rows.map(async (row) => ({
			id: asString(row.id),
			parentId: row.parent_id ? asString(row.parent_id) : null,
			access: await grantsForNode(asString(row.id))
		}))
	);
}

export async function listHierarchyNodes(actor: VaultActor) {
	await ensureDb();
	const result = await client.execute('SELECT id, name, parent_id FROM hierarchy_nodes ORDER BY name');
	const accessNodes = await allHierarchyAccessNodes();
	const visibleItemNodes = new Set((await listVaultItems(actor)).map((item) => item.nodeId));
	const visibleAncestors = new Set<string>();
	const byId = new Map(accessNodes.map((node) => [node.id, node]));
	for (const nodeId of visibleItemNodes) {
		let current = nodeId ? byId.get(nodeId) : undefined;
		while (current && !visibleAncestors.has(current.id)) {
			visibleAncestors.add(current.id);
			current = current.parentId ? byId.get(current.parentId) : undefined;
		}
	}

	return Promise.all(
		result.rows
			.map((row) => ({
				id: asString(row.id),
				name: asString(row.name),
				parentId: row.parent_id ? asString(row.parent_id) : null
			}))
			.filter(
				(node) =>
					actor.isSuperuser ||
					visibleAncestors.has(node.id) ||
					canAccessHierarchyNode(actor, accessNodes, node.id)
			)
			.map(async (node) => ({ ...node, access: await grantsForNode(node.id) }))
	);
}

export async function createHierarchyNode(name: string, parentId: string | null) {
	await ensureDb();
	await client.execute({
		sql: `INSERT INTO hierarchy_nodes (id, name, parent_id, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?)`,
		args: [crypto.randomUUID(), name, parentId || null, new Date().toISOString(), new Date().toISOString()]
	});
}

export async function updateHierarchyNode(input: { id: string; name: string; parentId: string | null }) {
	await ensureDb();
	const nodes = await allHierarchyAccessNodes();
	if (wouldCreateHierarchyCycle(nodes, input.id, input.parentId)) {
		throw new Error('Hierarchy node cannot be moved under itself or its descendants.');
	}
	await client.execute({
		sql: 'UPDATE hierarchy_nodes SET name = ?, parent_id = ?, updated_at = ? WHERE id = ?',
		args: [input.name, input.parentId || null, new Date().toISOString(), input.id]
	});
}

export async function deleteHierarchyNode(nodeId: string) {
	await ensureDb();
	const [children, items] = await Promise.all([
		client.execute({ sql: 'SELECT id FROM hierarchy_nodes WHERE parent_id = ? LIMIT 1', args: [nodeId] }),
		client.execute({ sql: 'SELECT id FROM vault_items WHERE node_id = ? LIMIT 1', args: [nodeId] })
	]);
	if (children.rows[0] || items.rows[0]) {
		throw new Error('Hierarchy node must be empty before deletion.');
	}
	await client.batch(
		[
			{ sql: 'DELETE FROM node_user_access WHERE node_id = ?', args: [nodeId] },
			{ sql: 'DELETE FROM node_group_access WHERE node_id = ?', args: [nodeId] },
			{ sql: 'DELETE FROM hierarchy_nodes WHERE id = ?', args: [nodeId] }
		],
		'write'
	);
}

export async function setNodeUserAccess(nodeId: string, userId: string, enabled: boolean) {
	await ensureDb();
	await client.execute({
		sql: enabled
			? 'INSERT OR IGNORE INTO node_user_access (node_id, user_id) VALUES (?, ?)'
			: 'DELETE FROM node_user_access WHERE node_id = ? AND user_id = ?',
		args: [nodeId, userId]
	});
}

export async function setNodeGroupAccess(nodeId: string, groupId: string, enabled: boolean) {
	await ensureDb();
	await client.execute({
		sql: enabled
			? 'INSERT OR IGNORE INTO node_group_access (node_id, group_id) VALUES (?, ?)'
			: 'DELETE FROM node_group_access WHERE node_id = ? AND group_id = ?',
		args: [nodeId, groupId]
	});
}

export async function createVaultItem(input: {
	title: string;
	username: string;
	password: string;
	url: string;
	notes: string;
	createdBy: string;
	nodeId: string;
}) {
	await ensureDb();
	const sealed = await encryptSecret(input.password, encryptionKey);
	await client.execute({
		sql: `INSERT INTO vault_items
			(id, title, username, url, notes, secret_ciphertext, secret_iv, secret_tag, created_by, updated_at, node_id)
			VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
			new Date().toISOString(),
			input.nodeId
		]
	});
}

export async function updateVaultItem(input: {
	id: string;
	title: string;
	username: string;
	password?: string;
	url: string;
	notes: string;
	nodeId: string;
}) {
	await ensureDb();
	if (input.password) {
		const sealed = await encryptSecret(input.password, encryptionKey);
		await client.execute({
			sql: `UPDATE vault_items
				SET title = ?, username = ?, url = ?, notes = ?,
					secret_ciphertext = ?, secret_iv = ?, secret_tag = ?, updated_at = ?, node_id = ?
				WHERE id = ?`,
			args: [
				input.title,
				input.username,
				input.url,
				input.notes,
				sealed.ciphertext,
				sealed.iv,
				sealed.tag,
				new Date().toISOString(),
				input.nodeId,
				input.id
			]
		});
		return;
	}

	await client.execute({
		sql: 'UPDATE vault_items SET title = ?, username = ?, url = ?, notes = ?, updated_at = ?, node_id = ? WHERE id = ?',
		args: [
			input.title,
			input.username,
			input.url,
			input.notes,
			new Date().toISOString(),
			input.nodeId,
			input.id
		]
	});
}

export async function deleteVaultItem(itemId: string) {
	await ensureDb();
	await client.batch(
		[
			{ sql: 'DELETE FROM item_user_access WHERE item_id = ?', args: [itemId] },
			{ sql: 'DELETE FROM item_group_access WHERE item_id = ?', args: [itemId] },
			{ sql: 'DELETE FROM vault_items WHERE id = ?', args: [itemId] }
		],
		'write'
	);
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
	const accessNodes = await allHierarchyAccessNodes();
	const result = await client.execute('SELECT * FROM vault_items ORDER BY updated_at DESC');
	const items = await Promise.all(
		result.rows.map(async (row) => {
			const id = asString(row.id);
			const grants = await grantsForItem(id);
			const nodeId = asString(row.node_id);
			return {
				id,
				title: asString(row.title),
				username: asString(row.username),
				url: asString(row.url),
				notes: asString(row.notes),
				nodeId,
				updatedAt: asString(row.updated_at),
				access: grants,
				canAccess:
					canAccessVaultItem(actor, grants) ||
					canAccessHierarchyNode(actor, accessNodes, nodeId)
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
	const accessNodes = await allHierarchyAccessNodes();
	if (
		!canAccessVaultItem(actor, grants) &&
		!canAccessHierarchyNode(actor, accessNodes, asString(row.node_id))
	) {
		return null;
	}
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
