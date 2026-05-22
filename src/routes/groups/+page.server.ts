import { createGroup, deleteGroup, listGroups, updateGroup } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (!locals.user.isSuperuser) throw redirect(303, '/');

	return {
		groups: await listGroups()
	};
};

export const actions = {
	createGroup: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const name = String((await request.formData()).get('name') ?? '').trim();
		if (!name) return fail(400, { groupMissing: true });
		await createGroup(name);
	},
	updateGroup: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const name = String(data.get('name') ?? '').trim();
		if (!id || !name) return fail(400, { groupUpdateMissing: true });
		await updateGroup(id, name);
	},
	deleteGroup: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { groupDeleteMissing: true });
		await deleteGroup(id);
	}
};
