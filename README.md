# Gatey

A small, resident-first guest code app for Bennett Valley Gate. Gatey runs on Next.js, stores local state in SQLite, and provisions time-bound access through UniFi Access.

## Identity and household model

Gatey uses Better Auth with its Organization, Admin, and Username plugins:

- A household is a Better Auth organization.
- A person is a Better Auth user with an organization membership.
- A visitor is a time-bound Gatey credential scoped by `household_id`.
- Every member of a household can list, create, and revoke that household's visitor credentials.
- The Better Auth `admin` role is app-wide and separate from organization roles such as `owner` and `member`.

Public sign-up is disabled. The initial organization is `oren-home`, preserving the household ID used by the existing pilot data.

## Requirements

- Node.js 26 or later (Gatey uses the built-in `node:sqlite` module)
- Access to the UniFi Access controller

## Local setup

Install dependencies and copy the example environment values into `.env`. Set `BETTER_AUTH_SECRET` to at least 32 random characters; one way to create it is:

```bash
openssl rand -base64 32
```

Set `BETTER_AUTH_URL` to the browser origin (`http://localhost:3000` locally and the public HTTPS origin in production).

Create the first administrator with Gatey's Better Auth bootstrap helper:

```bash
npm run auth:create-admin
```

The command asks for the password twice and creates Oren with:

- email: `oren@teich.net`
- username: `oren`
- app role: `admin`
- `oren-home` organization role: `owner`

The organization membership is added by the auth creation hook. The checked-in migrations are applied automatically when Gatey first opens its database.

Running the same command again resets Oren's password instead of creating a duplicate and revokes existing sessions. The explicit reset alias is equivalent:

```bash
npm run auth:reset-admin-password
```

Start the app:

```bash
npm run dev -- --hostname 127.0.0.1
```

Then open the local URL printed by Next.js. Use `npm run build` for a production build.

## Deployment notes

- Bind Next.js to `127.0.0.1`; expose only the app through the Cloudflare Tunnel.
- Keep `BETTER_AUTH_SECRET`, the UniFi token, and the SQLite file outside version control.
- Set `GATEY_DB_PATH` to an absolute persistent path under systemd.
- Back up the SQLite database independently of the application.
