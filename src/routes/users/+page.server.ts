import { createUser, deleteUser, listGroups, listUsers, setGroupMember, updateUser } from '$lib/server/db';
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
	updateUser: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const data = await request.formData();
		const id = String(data.get('id') ?? '');
		const email = String(data.get('email') ?? '').trim().toLowerCase();
		const name = String(data.get('name') ?? '').trim();
		const password = String(data.get('password') ?? '');
		const isSuperuser = data.get('isSuperuser') === 'on';
		if (!id || !email || !name || (password && password.length < 8)) {
			return fail(400, { userUpdateMissing: true });
		}
		if (id === locals.user.id && !isSuperuser) return fail(400, { cannotDemoteSelf: true });
		await updateUser({ id, email, name, password: password || undefined, isSuperuser });
	},
	deleteUser: async ({ locals, request }) => {
		if (!locals.user?.isSuperuser) return fail(403, { denied: true });
		const id = String((await request.formData()).get('id') ?? '');
		if (!id) return fail(400, { userDeleteMissing: true });
		if (id === locals.user.id) return fail(400, { cannotDeleteSelf: true });
		await deleteUser(id);
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
