<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';

	let { data, form } = $props();
	let query = $state('');
	let revealed = $state<Record<string, string>>({});

	let filteredItems = $derived(
		data.items.filter((item) =>
			`${item.title} ${item.username} ${item.url}`.toLowerCase().includes(query.toLowerCase())
		)
	);

	async function reveal(id: string) {
		const response = await fetch(`/reveal/${id}`);
		if (!response.ok) return;
		const body = await response.json();
		revealed[id] = body.password;
	}

	function copy(value: string) {
		navigator.clipboard?.writeText(value);
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

			{#if data.user?.isSuperuser}
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
				<Input class="sm:max-w-xs" placeholder="Search vault" bind:value={query} />
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
								<p class="text-sm text-muted-foreground">{item.username}{item.url ? ` · ${item.url}` : ''}</p>
								{#if item.notes}<p class="mt-2 text-sm">{item.notes}</p>{/if}
							</div>
							<div class="flex gap-2">
								<Button variant="outline" size="sm" onclick={() => reveal(item.id)}>Reveal</Button>
								{#if revealed[item.id]}
									<Button size="sm" onclick={() => copy(revealed[item.id])}>Copy</Button>
								{/if}
							</div>
						</div>
						{#if revealed[item.id]}
							<div class="mt-3 border border-border bg-muted p-3 font-mono text-sm">{revealed[item.id]}</div>
						{/if}

						{#if data.user?.isSuperuser}
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
