export type VaultActor = {
	id: string;
	isSuperuser: boolean;
	groupIds: string[];
};

export type VaultGrants = {
	userIds: string[];
	groupIds: string[];
};

export type HierarchyNodeAccess = {
	id: string;
	parentId: string | null;
	access: VaultGrants;
};

export function canAccessVaultItem(actor: VaultActor, grants: VaultGrants) {
	if (actor.isSuperuser) return true;
	if (grants.userIds.includes(actor.id)) return true;
	return actor.groupIds.some((groupId) => grants.groupIds.includes(groupId));
}

export function canAccessHierarchyNode(
	actor: VaultActor,
	nodes: HierarchyNodeAccess[],
	nodeId: string | null
) {
	if (actor.isSuperuser) return true;
	if (!nodeId) return false;

	const byId = new Map(nodes.map((node) => [node.id, node]));
	const visited = new Set<string>();
	let current = byId.get(nodeId);

	while (current && !visited.has(current.id)) {
		visited.add(current.id);
		if (canAccessVaultItem(actor, current.access)) return true;
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}

	return false;
}

export function wouldCreateHierarchyCycle(
	nodes: Pick<HierarchyNodeAccess, 'id' | 'parentId'>[],
	nodeId: string,
	nextParentId: string | null
) {
	if (!nextParentId) return false;
	if (nodeId === nextParentId) return true;

	const byId = new Map(nodes.map((node) => [node.id, node]));
	const visited = new Set<string>();
	let current = byId.get(nextParentId);

	while (current && !visited.has(current.id)) {
		if (current.id === nodeId) return true;
		visited.add(current.id);
		current = current.parentId ? byId.get(current.parentId) : undefined;
	}

	return false;
}
