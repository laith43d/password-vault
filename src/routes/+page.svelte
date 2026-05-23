<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import CheckIcon from '@lucide/svelte/icons/check';
	import CopyIcon from '@lucide/svelte/icons/copy';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';

	let { data, form } = $props();
	let query = $state('');
	let revealed = $state<Record<string, string>>({});
	let copied = $state<Record<string, boolean>>({});
	let editing = $state<Record<string, boolean>>({});
	let selectedNodeId = $state('');
	let editingNodeId = $state('');
	let nodes = $derived(data.nodes ?? []);

	$effect(() => {
		if (!selectedNodeId && nodes[0]) selectedNodeId = nodes[0].id;
	});

	let nodesById = $derived(new Map(nodes.map((node) => [node.id, node])));
	let nodeDepths = $derived.by(() => {
		const depths: Record<string, number> = {};
		const depthFor = (nodeId: string): number => {
			if (depths[nodeId] !== undefined) return depths[nodeId];
			const node = nodesById.get(nodeId);
			if (!node?.parentId) return (depths[nodeId] = 0);
			return (depths[nodeId] = depthFor(node.parentId) + 1);
		};
		for (const node of nodes) depthFor(node.id);
		return depths;
	});
	let nodeOptions = $derived(
		[...nodes].sort((left, right) => {
			const depthDiff = (nodeDepths[left.id] ?? 0) - (nodeDepths[right.id] ?? 0);
			if (left.parentId === right.parentId && depthDiff === 0) return left.name.localeCompare(right.name);
			return depthDiff || left.name.localeCompare(right.name);
		})
	);
	let selectedNodeIds = $derived.by(() => {
		if (!selectedNodeId) return new Set<string>();
		const ids = new Set([selectedNodeId]);
		let changed = true;
		while (changed) {
			changed = false;
			for (const node of nodes) {
				if (node.parentId && ids.has(node.parentId) && !ids.has(node.id)) {
					ids.add(node.id);
					changed = true;
				}
			}
		}
		return ids;
	});
	let filteredItems = $derived(
		data.items.filter((item) => {
			const matchesQuery = `${item.title} ${item.username} ${item.url}`.toLowerCase().includes(query.toLowerCase());
			const matchesNode = !selectedNodeId || selectedNodeIds.has(item.nodeId);
			return matchesQuery && matchesNode;
		})
	);

	async function toggleReveal(id: string) {
		if (revealed[id]) {
			delete revealed[id];
			return;
		}
		const response = await fetch(`/reveal/${id}`);
		if (!response.ok) return;
		const body = await response.json();
		revealed[id] = body.password;
	}

	function copyWithSelection(value: string) {
		const textarea = document.createElement('textarea');
		textarea.value = value;
		textarea.setAttribute('readonly', '');
		textarea.style.position = 'fixed';
		textarea.style.top = '-1000px';
		textarea.style.left = '-1000px';
		document.body.appendChild(textarea);
		textarea.focus();
		textarea.select();
		textarea.setSelectionRange(0, textarea.value.length);

		let copiedToClipboard = false;
		try {
			copiedToClipboard = document.execCommand('copy');
		} finally {
			document.body.removeChild(textarea);
		}
		return copiedToClipboard;
	}

	function markCopied(key: string) {
		copied[key] = true;
		setTimeout(() => {
			copied[key] = false;
		}, 1200);
	}

	function copyValue(key: string, value: string) {
		const copiedBySelection = copyWithSelection(value);
		if (copiedBySelection) markCopied(key);

		navigator.clipboard
			?.writeText(value)
			.then(() => {
				markCopied(key);
			})
			.catch(() => {
				if (!copiedBySelection) copied[key] = false;
			});

		if (!navigator.clipboard && !copiedBySelection) {
			copied[key] = false;
		}
	}

	function normalizedUrl(url: string) {
		if (!url) return '';
		return /^https?:\/\//i.test(url) ? url : `https://${url}`;
	}

	function toggleEdit(id: string) {
		editing[id] = !editing[id];
	}

	function nodeLabel(node: { id: string; name: string }) {
		return `${'-- '.repeat(nodeDepths[node.id] ?? 0)}${node.name}`;
	}
</script>

<svelte:head><title>Vault</title></svelte:head>

<main class="min-h-screen bg-[oklch(0.985_0.014_88)] text-foreground">
	<header class="border-b border-foreground bg-background">
		<div class="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p class="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Password vault</p>
				<h1 class="text-2xl font-black">Team access console</h1>
			</div>
			<div class="flex items-center gap-3">
				{#if data.user?.isSuperuser}
					<Button href="/users" variant="ghost" size="sm">Users</Button>
					<Button href="/groups" variant="ghost" size="sm">Groups</Button>
				{/if}
				<Badge variant="secondary">{data.user?.name}</Badge>
				<form method="POST" action="/logout">
					<Button variant="outline" size="sm" type="submit">Log out</Button>
				</form>
			</div>
		</div>
	</header>

	<div class="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[360px_1fr]">
		<aside class="space-y-5">
			{#if data.user?.isSuperuser}
				<section class="border border-foreground bg-background p-4 shadow-[5px_5px_0_var(--foreground)]">
					<h2 class="mb-4 text-lg font-black">Add password</h2>
					<form method="POST" action="?/createItem" class="space-y-3">
						<div class="space-y-1.5">
							<Label for="title">Title</Label>
							<Input id="title" name="title" required />
						</div>
						<div class="space-y-1.5">
							<Label for="username">Username</Label>
							<Input id="username" name="username" required />
						</div>
						<div class="space-y-1.5">
							<Label for="password">Password</Label>
							<Input id="password" name="password" type="password" required />
						</div>
						<div class="space-y-1.5">
							<Label for="nodeId">Hierarchy</Label>
							<select id="nodeId" name="nodeId" required class="h-9 w-full border border-input bg-transparent px-3 text-sm">
								{#each nodeOptions as node}
									<option value={node.id}>{nodeLabel(node)}</option>
								{/each}
							</select>
						</div>
						<div class="space-y-1.5">
							<Label for="url">URL</Label>
							<Input id="url" name="url" />
						</div>
						<div class="space-y-1.5">
							<Label for="notes">Notes</Label>
							<Textarea id="notes" name="notes" rows={3} />
						</div>
						{#if form?.itemMissing}
							<p class="text-sm text-destructive">Title, username, and password are required.</p>
						{/if}
						<Button type="submit" class="w-full">Save secret</Button>
					</form>
				</section>

				<section class="border border-foreground bg-background p-4">
					<h2 class="mb-2 text-lg font-black">Hierarchy</h2>
					<form method="POST" action="?/createNode" class="mb-4 grid gap-2">
						<Input name="name" placeholder="New node name" aria-label="New node name" required />
						<select name="parentId" class="h-9 w-full border border-input bg-transparent px-3 text-sm" aria-label="Parent node">
							<option value="">Top level</option>
							{#each nodeOptions as node}
								<option value={node.id}>{nodeLabel(node)}</option>
							{/each}
						</select>
						<Button type="submit" size="sm">Create node</Button>
					</form>
					{#if form?.nodeCycle}
						<p class="mb-2 text-sm text-destructive">Node cannot be moved under itself or its children.</p>
					{/if}
					{#if form?.nodeNotEmpty}
						<p class="mb-2 text-sm text-destructive">Delete blocked: node has children or passwords.</p>
					{/if}
					<div class="space-y-3">
						{#each nodeOptions as node}
							<div class="border border-border p-2" style={`margin-left: ${(nodeDepths[node.id] ?? 0) * 12}px`}>
								<div class="flex items-center justify-between gap-2">
									<button class="text-left text-sm font-bold underline-offset-2 hover:underline" type="button" onclick={() => selectedNodeId = node.id}>
										{node.name}
									</button>
									<Button type="button" variant="ghost" size="sm" onclick={() => editingNodeId = editingNodeId === node.id ? '' : node.id}>
										{editingNodeId === node.id ? 'Close' : 'Edit'}
									</Button>
								</div>
								{#if editingNodeId === node.id}
									<form method="POST" action="?/updateNode" class="mt-2 grid gap-2">
										<input type="hidden" name="id" value={node.id} />
										<Input name="name" value={node.name} aria-label="Node name" required />
										<select name="parentId" class="h-9 w-full border border-input bg-transparent px-3 text-sm" aria-label="Parent node">
											<option value="">Top level</option>
											{#each nodeOptions.filter((candidate) => candidate.id !== node.id) as candidate}
												<option value={candidate.id} selected={candidate.id === node.parentId}>{nodeLabel(candidate)}</option>
											{/each}
										</select>
										<Button type="submit" size="sm">Save node</Button>
									</form>
									<form method="POST" action="?/deleteNode" class="mt-2">
										<input type="hidden" name="id" value={node.id} />
										<Button type="submit" variant="destructive" size="sm">Delete empty node</Button>
									</form>
									<div class="mt-3 grid gap-3 border-t border-border pt-3">
										<div>
											<p class="mb-2 text-sm font-bold">Inherited user access</p>
											{#each data.users as user}
												<form method="POST" action="?/setNodeAccess" class="flex items-center gap-2">
													<input type="hidden" name="nodeId" value={node.id} />
													<input type="hidden" name="targetType" value="user" />
													<input type="hidden" name="targetId" value={user.id} />
													<input class="size-4 accent-foreground" type="checkbox" name="enabled" checked={node.access.userIds.includes(user.id)} onchange={(event) => event.currentTarget.form?.requestSubmit()} />
													<span class="text-sm">{user.name}</span>
												</form>
											{/each}
										</div>
										<div>
											<p class="mb-2 text-sm font-bold">Inherited group access</p>
											{#each data.groups as group}
												<form method="POST" action="?/setNodeAccess" class="flex items-center gap-2">
													<input type="hidden" name="nodeId" value={node.id} />
													<input type="hidden" name="targetType" value="group" />
													<input type="hidden" name="targetId" value={group.id} />
													<input class="size-4 accent-foreground" type="checkbox" name="enabled" checked={node.access.groupIds.includes(group.id)} onchange={(event) => event.currentTarget.form?.requestSubmit()} />
													<span class="text-sm">{group.name}</span>
												</form>
											{/each}
										</div>
									</div>
								{/if}
							</div>
						{/each}
					</div>
				</section>

				<section class="border border-foreground bg-background p-4">
					<h2 class="mb-2 text-lg font-black">Administration</h2>
					<div class="grid gap-2">
						<Button href="/users" variant="secondary">Manage users</Button>
						<Button href="/groups" variant="outline">Manage role groups</Button>
					</div>
				</section>
			{/if}
		</aside>

		<section class="space-y-4">
			<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
				<div>
					<h2 class="text-xl font-black">Passwords</h2>
					<p class="text-sm text-muted-foreground">{filteredItems.length} visible</p>
				</div>
				<div class="flex flex-col gap-2 sm:flex-row">
					<select bind:value={selectedNodeId} class="h-9 border border-input bg-background px-3 text-sm">
						{#each nodeOptions as node}
							<option value={node.id}>{nodeLabel(node)}</option>
						{/each}
					</select>
					<Input class="sm:max-w-xs" placeholder="Search vault" bind:value={query} />
				</div>
			</div>

			{#if filteredItems.length === 0}
				<div class="border border-dashed border-foreground bg-background p-10 text-center">
					<p class="font-bold">No visible passwords.</p>
					<p class="text-sm text-muted-foreground">Add one or grant this user access.</p>
				</div>
			{/if}

			<div class="grid gap-4">
				{#each filteredItems as item}
					<article class="border border-foreground bg-background p-4 shadow-[4px_4px_0_var(--foreground)]">
						<div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
							<div>
								<h3 class="text-lg font-black">{item.title}</h3>
								<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
									<span>{item.username}</span>
									{#if item.url}
										<span>·</span>
										<a class="inline-flex items-center gap-1 underline-offset-2 hover:underline" href={normalizedUrl(item.url)} target="_blank" rel="noreferrer">
											{item.url}
											<ExternalLinkIcon class="size-3.5" />
										</a>
										<Button variant="ghost" size="icon-xs" aria-label="Copy URL" title="Copy URL" onclick={() => copyValue(`url-${item.id}`, normalizedUrl(item.url))}>
											{#if copied[`url-${item.id}`]}
												<CheckIcon />
											{:else}
												<CopyIcon />
											{/if}
										</Button>
									{/if}
								</div>
								{#if item.notes}<p class="mt-2 text-sm">{item.notes}</p>{/if}
							</div>
							<div class="flex gap-2">
								<Button variant="outline" size="sm" onclick={() => toggleReveal(item.id)}>
									{revealed[item.id] ? 'Hide' : 'Reveal'}
								</Button>
								{#if data.user?.isSuperuser}
									<Button variant="secondary" size="sm" onclick={() => toggleEdit(item.id)}>
										{editing[item.id] ? 'Close edit' : 'Edit'}
									</Button>
								{/if}
							</div>
						</div>
						{#if revealed[item.id]}
							<div class="mt-3 flex items-center justify-between gap-3 border border-border bg-muted p-3 font-mono text-sm">
								<span class="min-w-0 break-all">{revealed[item.id]}</span>
								<Button variant="ghost" size="icon-sm" aria-label="Copy password" title="Copy password" onclick={() => copyValue(`password-${item.id}`, revealed[item.id])}>
									{#if copied[`password-${item.id}`]}
										<CheckIcon />
									{:else}
										<CopyIcon />
									{/if}
								</Button>
							</div>
						{/if}

						{#if data.user?.isSuperuser}
							{#if editing[item.id]}
								<div class="mt-4 border-t border-border pt-4">
									<p class="mb-2 text-sm font-bold">Edit password</p>
									<form method="POST" action="?/updateItem" class="grid gap-2 lg:grid-cols-[1fr_1fr_1fr_1fr_auto]">
										<input type="hidden" name="id" value={item.id} />
										<Input name="title" value={item.title} aria-label="Title" required />
										<Input name="username" value={item.username} aria-label="Username" required />
										<Input name="password" type="password" placeholder="New password optional" aria-label="New password" />
										<Input name="url" value={item.url} aria-label="URL" />
										<Button type="submit" size="sm">Save</Button>
										<select name="nodeId" class="h-9 border border-input bg-transparent px-3 text-sm lg:col-span-2" aria-label="Hierarchy" required>
											{#each nodeOptions as node}
												<option value={node.id} selected={node.id === item.nodeId}>{nodeLabel(node)}</option>
											{/each}
										</select>
										<Textarea class="lg:col-span-4" name="notes" rows={2} aria-label="Notes" value={item.notes} />
									</form>
									<form method="POST" action="?/deleteItem" class="mt-2">
										<input type="hidden" name="id" value={item.id} />
										<Button type="submit" variant="destructive" size="sm">Delete password</Button>
									</form>
								</div>
							{/if}

							<div class="mt-4 grid gap-3 border-t border-border pt-4 md:grid-cols-2">
								<div>
									<p class="mb-2 text-sm font-bold">User access</p>
									<div class="space-y-2">
										{#each data.users as user}
											<form method="POST" action="?/setAccess" class="flex items-center gap-2">
												<input type="hidden" name="itemId" value={item.id} />
												<input type="hidden" name="targetType" value="user" />
												<input type="hidden" name="targetId" value={user.id} />
												<input class="size-4 accent-foreground" type="checkbox" name="enabled" checked={item.access.userIds.includes(user.id)} onchange={(event) => event.currentTarget.form?.requestSubmit()} />
												<span class="text-sm">{user.name}</span>
											</form>
										{/each}
									</div>
								</div>
								<div>
									<p class="mb-2 text-sm font-bold">Group access</p>
									<div class="space-y-2">
										{#each data.groups as group}
											<form method="POST" action="?/setAccess" class="flex items-center gap-2">
												<input type="hidden" name="itemId" value={item.id} />
												<input type="hidden" name="targetType" value="group" />
												<input type="hidden" name="targetId" value={group.id} />
												<input class="size-4 accent-foreground" type="checkbox" name="enabled" checked={item.access.groupIds.includes(group.id)} onchange={(event) => event.currentTarget.form?.requestSubmit()} />
												<span class="text-sm">{group.name}</span>
											</form>
										{/each}
									</div>
								</div>
							</div>
						{/if}
					</article>
				{/each}
			</div>
		</section>
	</div>
</main>
