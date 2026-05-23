import { describe, expect, it } from 'vitest';
import { canAccessHierarchyNode, canAccessVaultItem, wouldCreateHierarchyCycle } from './access';

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

describe('hierarchy access', () => {
	const nodes = [
		{ id: 'org', parentId: null, access: { userIds: ['ops_lead'], groupIds: [] } },
		{ id: 'prod', parentId: 'org', access: { userIds: [], groupIds: ['platform'] } },
		{ id: 'db', parentId: 'prod', access: { userIds: [], groupIds: [] } }
	];

	it('allows access from direct node grants and inherited ancestor grants', () => {
		expect(
			canAccessHierarchyNode(
				{ id: 'ops_lead', isSuperuser: false, groupIds: [] },
				nodes,
				'db'
			)
		).toBe(true);
		expect(
			canAccessHierarchyNode(
				{ id: 'engineer', isSuperuser: false, groupIds: ['platform'] },
				nodes,
				'db'
			)
		).toBe(true);
	});

	it('denies users without node or ancestor grants', () => {
		expect(
			canAccessHierarchyNode(
				{ id: 'guest', isSuperuser: false, groupIds: ['support'] },
				nodes,
				'db'
			)
		).toBe(false);
	});

	it('detects hierarchy moves that would create cycles', () => {
		expect(wouldCreateHierarchyCycle(nodes, 'org', 'db')).toBe(true);
		expect(wouldCreateHierarchyCycle(nodes, 'db', 'org')).toBe(false);
		expect(wouldCreateHierarchyCycle(nodes, 'db', 'db')).toBe(true);
	});
});
