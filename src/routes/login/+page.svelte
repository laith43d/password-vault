<script lang="ts">
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let { form } = $props();
</script>

<svelte:head><title>Login | Vault</title></svelte:head>

<main class="grid min-h-screen place-items-center bg-[oklch(0.97_0.02_94)] px-4">
	<section class="w-full max-w-sm border border-foreground bg-background p-6 shadow-[8px_8px_0_var(--foreground)]">
		<div class="mb-8">
			<p class="text-xs font-bold uppercase tracking-[0.22em] text-muted-foreground">Team vault</p>
			<h1 class="mt-2 text-3xl font-black">Sign in</h1>
		</div>

		<form method="POST" class="space-y-4">
			<div class="space-y-2">
				<Label for="email">Email</Label>
				<Input id="email" name="email" type="email" value={form?.email ?? ''} autocomplete="username" required />
			</div>
			<div class="space-y-2">
				<Label for="password">Password</Label>
				<Input id="password" name="password" type="password" autocomplete="current-password" required />
			</div>
			{#if form?.invalid}
				<p class="text-sm font-medium text-destructive">Invalid email or password.</p>
			{/if}
			<Button class="w-full" type="submit">Enter vault</Button>
		</form>
	</section>
</main>
