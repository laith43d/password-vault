export type VaultActor = {
	id: string;
	isSuperuser: boolean;
	groupIds: string[];
};

export type VaultGrants = {
	userIds: string[];
	groupIds: string[];
};

export function canAccessVaultItem(actor: VaultActor, grants: VaultGrants) {
	if (actor.isSuperuser) return true;
	if (grants.userIds.includes(actor.id)) return true;
	return actor.groupIds.some((groupId) => grants.groupIds.includes(groupId));
}
