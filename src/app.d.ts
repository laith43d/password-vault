// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		interface Locals {
			user: import('$lib/server/db').User | null;
			sessionId?: string;
		}
		interface PageData {
			user: import('$lib/server/db').User | null;
		}
	}
}

export {};
