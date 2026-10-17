# Research Application Tracker

A private, account-based tracker for research outreach applications. Each user can organize applications by term, record professor and contact details, keep a contact history, receive follow-up reminders, and import Excel files into the active term.

## Stack

- Vinext / React
- Cloudflare Workers
- Cloudflare D1 with Drizzle ORM
- First-party email/password sessions using Web Crypto

Passwords are never stored directly. The application stores a PBKDF2-SHA-256 password verifier with a unique random salt. Login sessions use random tokens; only token hashes are stored in D1, and the browser cookie is `HttpOnly`, `SameSite=Lax`, and `Secure` in production.

## Local development

Install dependencies and build the Worker:

```bash
pnpm install
pnpm build
```

Apply the D1 migrations to the local database and start the built Worker:

```bash
pnpm db:migrate:local
pnpm start
```

The local server normally runs at `http://127.0.0.1:8787`.

## Cloudflare deployment

Cloudflare configuration lives in `wrangler.jsonc`. It binds `DB` to the `ra-tracker-db` D1 database.

Production is served from `https://ratracker.app`. The `workers.dev` route remains enabled as a fallback.

Apply production migrations before the first deployment and whenever a new migration is added:

```bash
pnpm db:migrate:remote
```

For a manual deployment:

```bash
pnpm build
pnpm deploy
```

For Workers Builds with GitHub, use:

- Build command: `pnpm run build`
- Deploy command: `pnpm run deploy`
- Preview command: `pnpm run preview`

Every push to the production branch can then trigger a new Cloudflare build and deployment.

## Database migrations

Update `db/schema.ts`, generate a migration, inspect the SQL, then apply it locally and remotely:

```bash
pnpm db:generate
pnpm db:migrate:local
pnpm db:migrate:remote
```

Do not edit or replay a migration that has already been applied to production. Add a new migration instead.

## Account behavior

- Email addresses are normalized to lowercase.
- Passwords must contain 10–128 characters.
- Sessions persist on the same device for up to one year.
- Application data remains separated by the authenticated user ID.
- Signing out invalidates the current server-side session.

Email verification, password recovery, and automated abuse protection should be added before promoting the service to a large public audience.
