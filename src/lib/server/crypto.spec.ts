import { describe, expect, it } from 'vitest';
import { decryptSecret, encryptSecret } from './crypto';

describe('secret encryption', () => {
	it('encrypts without storing plaintext and decrypts with the same key', async () => {
		const key = '0123456789abcdef0123456789abcdef';
		const sealed = await encryptSecret('correct horse battery staple', key);

		expect(sealed.ciphertext).not.toContain('correct horse');
		expect(sealed.iv).toHaveLength(16);
		expect(sealed.tag).toHaveLength(24);
		await expect(decryptSecret(sealed, key)).resolves.toBe('correct horse battery staple');
	});
});
