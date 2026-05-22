import { logout } from '$lib/server/db';
import { redirect } from '@sveltejs/kit';

export const POST = async ({ locals, cookies }) => {
	await logout(locals.sessionId);
	cookies.delete('vault_session', { path: '/' });
	throw redirect(303, '/login');
};
