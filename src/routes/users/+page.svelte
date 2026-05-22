<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';

	let { data, form } = $props();
</script>

<svelte:head><title>Users | Vault</title></svelte:head>

<main class="min-h-screen bg-[oklch(0.985_0.014_88)] text-foreground">
	<header class="border-b border-foreground bg-background">
		<div class="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
			<div>
				<p class="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Admin</p>
				<h1 class="text-2xl font-black">Users</h1>
			</div>
			<div class="flex items-center gap-2">
				<Button href="/" variant="ghost" size="sm">Vault</Button>
				<Button href="/groups" variant="ghost" size="sm">Groups</Button>
				<Badge variant="secondary">{data.user?.name}</Badge>
			</div>
		</div>
	</header>

	<div class="mx-auto grid max-w-7xl gap-5 px-4 py-5 lg:grid-cols-[360px_1fr]">
		<section class="border border-foreground bg-background p-4 shadow-[5px_5px_0_var(--foreground)]">
			<h2 class="mb-4 text-lg font-black">Invite user</h2>
			<form method="POST" action="?/createUser" class="space-y-3">
				<Input name="name" placeholder="Name" required />
				<Input name="email" type="email" placeholder="Email" required />
				<Input name="password" type="password" placeholder="Temporary password" required />
				{#if form?.userMissing}
					<p class="text-sm text-destructive">Name, email, and an 8+ character password are required.</p>
				{/if}
				<Button type="submit" class="w-full">Create user</Button>
			</form>
		</section>

		<section class="space-y-4">
			<div>
				<h2 class="text-xl font-black">Team members</h2>
				<p class="text-sm text-muted-foreground">Assign each user to one or more role groups.</p>
			</div>

			<div class="grid gap-4">
				{#each data.users as user}
					<article class="border border-foreground bg-background p-4 shadow-[4px_4px_0_var(--foreground)]">
						<div class="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
							<div>
								<h3 class="font-black">{user.name}</h3>
								<p class="text-sm text-muted-foreground">{user.email}</p>
							</div>
							{#if user.isSuperuser}<Badge>Superuser</Badge>{/if}
						</div>

						<form method="POST" action="?/updateUser" class="mb-4 grid gap-2 border border-border p-3 lg:grid-cols-[1fr_1fr_1fr_auto]">
							<input type="hidden" name="id" value={user.id} />
							<Input name="name" value={user.name} aria-label="Name" required />
							<Input name="email" type="email" value={user.email} aria-label="Email" required />
							<Input name="password" type="password" placeholder="New password optional" aria-label="New password" />
							<div class="flex items-center gap-2">
								<label class="flex items-center gap-2 text-sm font-medium">
									<input class="size-4 accent-foreground" type="checkbox" name="isSuperuser" checked={user.isSuperuser} />
									Admin
								</label>
								<Button type="submit" size="sm">Save</Button>
							</div>
						</form>

						<div class="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
							{#each data.groups as group}
								<form method="POST" action="?/setMember" class="flex items-center gap-2 border border-border p-2">
									<input type="hidden" name="userId" value={user.id} />
									<input type="hidden" name="groupId" value={group.id} />
									<input class="size-4 accent-foreground" type="checkbox" name="enabled" checked={user.groupIds.includes(group.id)} onchange={(event) => event.currentTarget.form?.requestSubmit()} />
									<span class="text-sm font-medium">{group.name}</span>
								</form>
							{/each}
						</div>
						{#if data.groups.length === 0}
							<p class="text-sm text-muted-foreground">Create role groups before assigning memberships.</p>
						{/if}

						<form method="POST" action="?/deleteUser" class="mt-4">
							<input type="hidden" name="id" value={user.id} />
							<Button type="submit" variant="destructive" size="sm" disabled={user.id === data.user?.id}>Delete user</Button>
						</form>
					</article>
				{/each}
			</div>
			{#if form?.cannotDeleteSelf}
				<p class="text-sm text-destructive">You cannot delete your own user.</p>
			{/if}
			{#if form?.cannotDemoteSelf}
				<p class="text-sm text-destructive">You cannot remove your own superuser access.</p>
			{/if}
		</section>
	</div>
</main>
