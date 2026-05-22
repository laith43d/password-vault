import {
	createVaultItem,
	listGroups,
	listUsers,
	listVaultItems,
	setItemGroupAccess,
	setItemUserAccess
} from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	const [items, users, groups] = await Promise.all([
		listVaultItems(locals.user),
		listUsers(),
		listGroups()
	]);

	return { items, users, groups };
};

export const actions = {
	createItem: async ({ locals, request }) => {
		if (!locals.user) throw redirect(303, '/login');
		if (!locals.user.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const title = String(data.get('title') ?? '').trim();
		const username = String(data.get('username') ?? '').trim();
		const password = String(data.get('password') ?? '');
		if (!title || !username || !password) return fail(400, { itemMissing: true });

		await createVaultItem({
			title,
			username,
			password,
			url: String(data.get('url') ?? '').trim(),
			notes: String(data.get('notes') ?? '').trim(),
			createdBy: locals.user.id
		});
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
	}
};
