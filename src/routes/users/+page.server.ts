import { createUser, listGroups, listUsers, setGroupMember } from '$lib/server/db';
import { fail, redirect } from '@sveltejs/kit';

export const load = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login');
	if (!locals.user.isSuperuser) throw redirect(303, '/');

	const [users, groups] = await Promise.all([listUsers(), listGroups()]);
	return { users, groups };
};

export const actions = {
	createUser: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const name = String(data.get('name') ?? '').trim();
		const password = String(data.get('password') ?? '');
		if (!email || !name || password.length < 8) return fail(400, { userMissing: true });
		await createUser(email, name, password);
	},
	setMember: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		await setGroupMember(
			String(data.get('userId')),
			String(data.get('groupId')),
			data.get('enabled') === 'on'
		);
	}
};
