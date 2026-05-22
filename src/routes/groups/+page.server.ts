import { createGroup, listGroups } from '$lib/server/db';
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
	}
};
