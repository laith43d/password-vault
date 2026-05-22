type SealedSecret = {
	ciphertext: string;
	iv: string;
	tag: string;
};

function bytesToBase64(bytes: Uint8Array) {
	let binary = '';
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary);
}

function base64ToBytes(value: string) {
	const binary = atob(value);
	return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function keyBytes(key: string) {
	const source = new TextEncoder().encode(key);
	const digest = await crypto.subtle.digest('SHA-256', source);
	return crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

export async function encryptSecret(secret: string, key: string): Promise<SealedSecret> {
	const iv = crypto.getRandomValues(new Uint8Array(12));
	const encrypted = new Uint8Array(
		await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await keyBytes(key), new TextEncoder().encode(secret))
	);
	const ciphertext = encrypted.slice(0, -16);
	const tag = encrypted.slice(-16);

	return {
		ciphertext: bytesToBase64(ciphertext),
		iv: bytesToBase64(iv),
		tag: bytesToBase64(tag)
	};
}

export async function decryptSecret(sealed: SealedSecret, key: string) {
	const ciphertext = base64ToBytes(sealed.ciphertext);
	const tag = base64ToBytes(sealed.tag);
	const encrypted = new Uint8Array(ciphertext.length + tag.length);
	encrypted.set(ciphertext);
	encrypted.set(tag, ciphertext.length);

	const decrypted = await crypto.subtle.decrypt(
		{ name: 'AES-GCM', iv: base64ToBytes(sealed.iv) },
		await keyBytes(key),
		encrypted
	);
	return new TextDecoder().decode(decrypted);
}
