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

## Resident experience preview

The resident home is currently a safe interaction preview for the new gate-first experience. When camera stream settings are present, the two camera views are authenticated, on-demand snapshots. The **Open gate** button and the gate's physical state are connected to UniFi; Gatey shares one controller status read across residents for five seconds and refreshes again after an open request. Party mode is also connected: one household can schedule it for today, Gatey starts a later party, and UniFi enforces the chosen close time. Permanent-code changes are still simulated and labeled in the UI. Existing temporary guest-code creation, sharing, listing, and cancellation remain connected to UniFi. The preview includes installable-app metadata so it can be evaluated from a phone home screen before the remaining controls are wired.

Every real gate-open request, party-mode change, and guest-code change is recorded in the administrator **Activity log**, including the resident and household at the time of the action and its outcome.

## Call-to-open

Gatey can answer the existing Twilio gate number directly. Administrators add one or more E.164 phone numbers to a linked account under **Admin → People → Phone access**, then choose whether each number may open the gate and whether it may use the 30-minute hold-open action. The caller presses `1` to open or, when explicitly permitted, `2` to hold the gate open. Phone actions use the same resident, household, party-mode state, UniFi client, and activity log as the web app.

Configure `TWILIO_PUBLIC_BASE_URL`, `TWILIO_AUTH_TOKEN`, `TWILIO_PHONE_NUMBER`, and optionally `TWILIO_TTS_VOICE`, then set `GATEY_TWILIO_ENABLED=true`. Twilio should send form-encoded voice webhooks to `POST /twilio/voice`; Gatey validates every `X-Twilio-Signature`. The public base URL must exactly match the origin Twilio calls.

Legacy callers can be previewed and imported from `phone-gate-bridge`:

```bash
npm run phones:import -- --callers ../phone-gate-bridge/deploy/config/allowed-callers.toml --map ./phone-map.json
npm run phones:import -- --callers ../phone-gate-bridge/deploy/config/allowed-callers.toml --map ./phone-map.json --apply
```

The optional mapping file maps E.164 numbers to Gatey account emails. Without it, the importer only accepts an exact, unique caller-name/account-name match. The command is a dry run unless `--apply` is present.

## Camera snapshots

Gatey deliberately does not send RTSPS addresses to the phone. The server uses its local `ffmpeg` installation to capture one JPEG frame at a time and returns it only through the signed-in, same-origin snapshot route. Add these settings to the environment where Gatey runs:

```bash
GATEY_CAMERA_PERSON_RTSPS_URL=rtsps://...
GATEY_CAMERA_ROAD_RTSPS_URL=rtsps://...
GATEY_CAMERA_INSECURE_TLS=false
```

Set `GATEY_CAMERA_INSECURE_TLS=true` only for a private/self-signed camera certificate. The stream remains encrypted, but its certificate will not be verified; use it only on the trusted local camera network. `ffmpeg` must be installed on the production host.

## Requirements

- Node.js 26 or later (Gatey uses the built-in `node:sqlite` module)
- Access to the UniFi Access controller

## Local setup

Install dependencies and copy the example environment values into `.env`. Set `BETTER_AUTH_SECRET` to at least 32 random characters; one way to create it is:

```bash
openssl rand -base64 32
```

Set `BETTER_AUTH_URL` to the browser origin (`http://localhost:3000` locally and the public HTTPS origin in production).

Apply the checked-in database migrations, then create the first administrator
with Gatey's Better Auth bootstrap helper:

```bash
npm run db:migrate
npm run auth:create-admin
```

The command asks for the password twice and creates Oren with:

- email: `oren@teich.net`
- username: `oren`
- app role: `admin`
- `oren-home` organization role: `owner`

The organization membership is added by the auth creation hook. Drizzle records
each applied migration and only runs new ones. Treat generated migrations as
immutable after they have been applied.

After changing [the typed schema](./lib/schema.ts), generate and inspect a new
migration before applying it locally:

```bash
npm run db:generate -- --name=describe_the_change
npm run db:check
npm run db:migrate
```

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
- Deployments install and enable `gatey-party-scheduler.timer`, which calls a protected local route once a minute so scheduled party mode starts even when nobody has Gatey open. The deployment generates `GATEY_SCHEDULER_SECRET` in `/etc/gatey/gatey.env` on its first run.

Deploy the pushed `main` branch from a trusted development machine with:

```bash
npm run deploy:prod
```

The deployment script builds the pushed `main` branch locally with Node 26,
uploads the build, and connects as root to manage systemd and the database
backup directory. It refuses a dirty production checkout, creates a consistent
SQLite backup, fast-forwards from `origin/main`, stops Gatey, applies only new
migrations, atomically swaps the build and dependencies, restarts, and checks
the local sign-in page. If migration or the health check fails, it restores the
previous database, commit, and build. Building locally keeps deployment within
the production host's small memory limit.

The admin sidebar shows a simple incrementing version number derived from the
number of commits in the deployed `main` history. Before deploying, the script
warns when local commits or working-tree changes are not on `origin/main` and
asks whether to stop or intentionally deploy the older pushed version.
