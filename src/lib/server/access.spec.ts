import { describe, expect, it } from 'vitest';
import { canAccessVaultItem } from './access';

describe('vault access', () => {
	const grants = {
		userIds: ['user_direct'],
		groupIds: ['backend']
	};

	it('allows superusers, direct grants, and matching group grants', () => {
		expect(canAccessVaultItem({ id: 'root', isSuperuser: true, groupIds: [] }, grants)).toBe(true);
		expect(canAccessVaultItem({ id: 'user_direct', isSuperuser: false, groupIds: [] }, grants)).toBe(
			true
		);
		expect(
			canAccessVaultItem({ id: 'group_member', isSuperuser: false, groupIds: ['backend'] }, grants)
		).toBe(true);
	});

	it('denies users without a direct or group grant', () => {
		expect(canAccessVaultItem({ id: 'guest', isSuperuser: false, groupIds: ['mobile'] }, grants)).toBe(
			false
		);
	});
});
