import { getUserBySession } from '$lib/server/db';
import type { Handle } from '@sveltejs/kit';

export const handle: Handle = async ({ event, resolve }) => {
	const sessionId = event.cookies.get('vault_session');
	event.locals.sessionId = sessionId;
	event.locals.user = await getUserBySession(sessionId);
	return resolve(event);
};
