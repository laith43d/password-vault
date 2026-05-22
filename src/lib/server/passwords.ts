function bytesToBase64(bytes: Uint8Array) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value: string) {
	const binary = atob(value);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function hashBytes(password: string, salt: string) {
	const source = new TextEncoder().encode(`${salt}:${password}`);
	const digest = await crypto.subtle.digest('SHA-256', source);
	return bytesToBase64(new Uint8Array(digest));
}

function constantTimeEqual(left: string, right: string) {
	const leftBytes = base64ToBytes(left);
	const rightBytes = base64ToBytes(right);
	let diff = leftBytes.length ^ rightBytes.length;
	for (let i = 0; i < Math.max(leftBytes.length, rightBytes.length); i += 1) {
		diff |= (leftBytes[i] ?? 0) ^ (rightBytes[i] ?? 0);
	}
	return diff === 0;
}

export async function hashPassword(password: string) {
	const salt = bytesToBase64(crypto.getRandomValues(new Uint8Array(16)));
	const hash = await hashBytes(password, salt);
	return `${salt}:${hash}`;
}

export async function verifyPassword(password: string, stored: string) {
	const [salt, hash] = stored.split(':');
	if (!salt || !hash) return false;
	return constantTimeEqual(hash, await hashBytes(password, salt));
}
