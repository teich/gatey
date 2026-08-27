# Gatey

A small, resident-first guest code app for Bennett Valley Gate. Gatey runs on Next.js, stores local state in SQLite, and provisions time-bound access through UniFi Access.

## Identity and household model

Gatey uses Better Auth with its Organization, Admin, and Username plugins:

- A household is a Better Auth organization.
- A person is a UniFi person linked one-to-one with a Better Auth user. The
  user's organization membership determines their household.
- A visitor is a time-bound UniFi pass explicitly assigned to a household.
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

## Managing households

Open **Admin → Households** to create and rename households, review residents, and retire an empty household. Use **Admin → People** to see everyone discovered in UniFi, link an existing Gatey account or create one, and assign the person to a household. Creating an account shows a one-time welcome message you can copy into your own email. Gatey does not send mail itself. Use **Admin → Visitors** to assign current visitor passes to households.

People belong to one household in this MVP. Removing them preserves their account so the administrator can assign it again later. For safety, Gatey will not delete `oren-home`, a household with residents, or one with Gatey visitor/PIN records.

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

Deploy the pushed `main` branch from a trusted development machine with:

```bash
npm run deploy:prod
```

The deployment script builds the pushed `main` branch locally with Node 26,
uploads the build, and connects as root to manage systemd and the database
backup directory. It refuses a dirty production checkout, creates a consistent
SQLite backup, fast-forwards from `origin/main`, atomically swaps the build and
dependencies, restarts, and checks the local sign-in page. If that check fails,
it restores the previous commit and build. Building locally keeps deployment
within the production host's small memory limit.
