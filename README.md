# Password Vault

Minimal SvelteKit password vault for development teams.

## Features

- Invite-only users with one seeded superuser
- Encrypted password storage using AES-256-GCM
- Turso/libSQL database support, with local `file:local.db` fallback
- Per-user and per-group password access
- Simple vault UI for adding, revealing, copying, and granting secrets

## Local Setup

```sh
npm install
cp .env.example .env
npm run dev
```

Default development superuser:

- Email: `admin@vault.local`
- Password: `ChangeMe123!`

Set a real `APP_ENCRYPTION_KEY` before storing real secrets.

## Turso

Set these values in `.env`:

```sh
TURSO_DATABASE_URL=libsql://your-db.turso.io
TURSO_AUTH_TOKEN=your-token
APP_ENCRYPTION_KEY=replace-with-a-random-32-character-key
```

Tables are created automatically on first server request.

## Verify

```sh
npm run check
npm test
npm run build
```

## Deploy to Cloudflare Workers

```sh
CLOUDFLARE_API_TOKEN=... npm run deploy
```

The deploy command reads non-secret Worker config from `wrangler.jsonc` and uploads secret values from `.env`.
