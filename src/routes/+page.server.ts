import {
	createHierarchyNode,
	createVaultItem,
	deleteHierarchyNode,
	deleteVaultItem,
	listHierarchyNodes,
	listGroups,
	listUsers,
	listVaultItems,
	setNodeGroupAccess,
	setNodeUserAccess,
	setItemGroupAccess,
	setItemUserAccess,
	updateHierarchyNode,
	updateVaultItem
} from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	const [items, users, groups, nodes] = await Promise.all([
		listVaultItems(locals.user),
		listUsers(),
		listGroups(),
		listHierarchyNodes(locals.user)
	]);

	return { items, users, groups, nodes };
};

export const actions = {
	createItem: async ({ locals, request }) => {
		if (!locals.user) throw redirect(303, '/login');
		if (!locals.user.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const username = String(data.get('username') ?? '').trim();
		const password = String(data.get('password') ?? '');
		const nodeId = String(data.get('nodeId') ?? '');
		if (!title || !username || !password || !nodeId) return fail(400, { itemMissing: true });

		await createVaultItem({
			title,
			username,
			password,
			url: String(data.get('url') ?? '').trim(),
			notes: String(data.get('notes') ?? '').trim(),
			createdBy: locals.user.id,
			nodeId
		});
	},
	updateItem: async ({ locals, request }) => {
		if (!locals.user) throw redirect(303, '/login');
		if (!locals.user.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const title = String(data.get('title') ?? '').trim();
		const username = String(data.get('username') ?? '').trim();
		const password = String(data.get('password') ?? '');
		const nodeId = String(data.get('nodeId') ?? '');
		if (!id || !title || !username || !nodeId) return fail(400, { itemUpdateMissing: true });

		await updateVaultItem({
			id,
			title,
			username,
			password: password || undefined,
			url: String(data.get('url') ?? '').trim(),
			notes: String(data.get('notes') ?? '').trim(),
			nodeId
		});
	},
	deleteItem: async ({ locals, request }) => {
		if (!locals.user) throw redirect(303, '/login');
		if (!locals.user.isSuperuser) return fail(403, { denied: true });
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { itemDeleteMissing: true });
		await deleteVaultItem(id);
	},
	setAccess: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const itemId = String(data.get('itemId'));
		const targetId = String(data.get('targetId'));
		const enabled = data.get('enabled') === 'on';
		if (data.get('targetType') === 'group') {
			await setItemGroupAccess(itemId, targetId, enabled);
		} else {
			await setItemUserAccess(itemId, targetId, enabled);
		}
	},
	createNode: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const name = String(data.get('name') ?? '').trim();
		const parentId = String(data.get('parentId') ?? '') || null;
		if (!name) return fail(400, { nodeMissing: true });
		await createHierarchyNode(name, parentId);
	},
	updateNode: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const name = String(data.get('name') ?? '').trim();
		const parentId = String(data.get('parentId') ?? '') || null;
		if (!id || !name) return fail(400, { nodeUpdateMissing: true });
		try {
			await updateHierarchyNode({ id, name, parentId });
		} catch {
			return fail(400, { nodeCycle: true });
		}
	},
	deleteNode: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { nodeDeleteMissing: true });
		try {
			await deleteHierarchyNode(id);
		} catch {
			return fail(400, { nodeNotEmpty: true });
		}
	},
	setNodeAccess: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const nodeId = String(data.get('nodeId'));
		const targetId = String(data.get('targetId'));
		const enabled = data.get('enabled') === 'on';
		if (data.get('targetType') === 'group') {
			await setNodeGroupAccess(nodeId, targetId, enabled);
		} else {
			await setNodeUserAccess(nodeId, targetId, enabled);
		}
	}
};
