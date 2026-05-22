import { revealSecret } from '$lib/server/db';
import { error, json } from '@sveltejs/kit';

export const GET = async ({ locals, params }) => {
	if (!locals.user) throw error(401);
	const password = await revealSecret(locals.user, params.id);
	if (!password) throw error(404);
	return json({ password });
};
