<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();
</script>

<svelte:head><title>Role Groups | Vault</title></svelte:head>

<main class="min-h-screen bg-[oklch(0.985_0.014_88)] text-foreground">
	<header class="border-b border-foreground bg-background">
		<div class="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p class="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Admin</p>
				<h1 class="text-2xl font-black">Role groups</h1>
			</div>
			<div class="flex items-center gap-2">
				<Button href="/" variant="ghost" size="sm">Vault</Button>
				<Button href="/users" variant="ghost" size="sm">Users</Button>
				<Badge variant="secondary">{data.user?.name}</Badge>
			</div>
		</div>
	</header>

	<div class="mx-auto grid max-w-5xl gap-5 px-4 py-5 lg:grid-cols-[360px_1fr]">
		<section class="border border-foreground bg-background p-4 shadow-[5px_5px_0_var(--foreground)]">
			<h2 class="mb-4 text-lg font-black">Create role group</h2>
			<form method="POST" action="?/createGroup" class="flex gap-2">
				<Input name="name" placeholder="Backend, Mobile..." required />
				<Button type="submit">Add</Button>
			</form>
			{#if form?.groupMissing}
				<p class="mt-3 text-sm text-destructive">Group name is required.</p>
			{/if}
		</section>

		<section class="space-y-4">
			<div>
				<h2 class="text-xl font-black">Groups</h2>
				<p class="text-sm text-muted-foreground">Grant password access to these groups from the vault page.</p>
			</div>

			<div class="grid gap-3 sm:grid-cols-2">
				{#each data.groups as group}
					<article class="border border-foreground bg-background p-4 shadow-[4px_4px_0_var(--foreground)]">
						<h3 class="font-black">{group.name}</h3>
					</article>
				{/each}
			</div>
			{#if data.groups.length === 0}
				<div class="border border-dashed border-foreground bg-background p-10 text-center">
					<p class="font-bold">No role groups yet.</p>
				</div>
			{/if}
		</section>
	</div>
</main>
