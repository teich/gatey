# Gate Access App — Kickoff Plan

## Practical implementation posture

This is a convenience app for a home gate, not a high-security access system.
There is an unlocked pedestrian entrance beside the gate, so the primary risks
are accidental over-sharing, confusing status, and codes that remain active
longer than intended—not a determined intruder.

For the first household pilot:

- Optimize for a resident creating, finding, sharing, and canceling a code with
  no explanation.
- Keep UniFi credentials server-side and require UniFi itself to enforce expiry.
- Use ordinary household separation and long-lived sign-in; do not add repeated
  authentication, elaborate rate limits, PIN reveal audits, or extensive alerting.
- Store PINs directly in the local database initially. Encrypting the database
  or individual PINs can be added later if the app moves beyond the trusted home
  host or the threat model changes.
- Treat reconciliation, backups, and useful errors as reliability work, not as a
  reason to delay the wife pilot.
- A supported UniFi API is preferred, but an isolated, tested adapter using a
  stable local endpoint is acceptable for the pilot if that is what the installed
  controller exposes. Controller updates may require adapter maintenance.

Do not expose the UniFi controller or secrets through the public app, log raw
tokens, or rely on the app process to expire a live code. Those remain sensible
baseline constraints.

## Decision

Build a new repository for a locally hosted Next.js application. Keep
`phone-gate-bridge` unchanged as the reliable call-to-open fallback.

Working name: `gate-access`.

The app will run on the same LAN as the UniFi Access controller and communicate
with it server-side. A Cloudflare Tunnel will expose only the Next.js web app;
the controller, database, and UniFi API token remain private.

```text
Browser -> Cloudflare -> Tunnel -> Next.js on localhost -> UniFi Access on LAN
                                      |
                                      +-> local database
                                      +-> email/SMS provider

Phone call -> existing phone-gate-bridge -> UniFi Access
```

Cloudflare Tunnel is transport, not application authentication. Residents sign
in to the app itself. Do not put a second Cloudflare Access login in front of
the resident experience.

## Product goal

Give four households a trustworthy, extremely simple way to create and remember
gate codes for guests.

The first pilot user is Oren's wife. The first release succeeds when she can:

1. Open the app without remembering a password.
2. Create a code for a friend in under 30 seconds.
3. Return a week later and see what the code was, who it was for, and whether it
   is still active.
4. Cancel it without asking the administrator for help.

The resident experience is the product. The admin interface can be denser.

## MVP scope

### Resident

- Accept an invitation through a one-time magic link.
- Stay signed in on a trusted device for a long period (target: 90 days).
- Create a temporary guest code.
- Choose a simple duration: **Today**, **7 days**, or **Choose dates**.
- Optionally label it, for example “Susan” or “Gardener.”
- See the full code again later.
- Copy or share the code from the device share sheet.
- See all active and upcoming codes created by their household.
- Cancel one of their household's codes.

### Admin

- Invite, suspend, and remove residents.
- Assign residents to a household.
- See every active, upcoming, expired, failed, and revoked code.
- Reveal a code; revelations are audited.
- Revoke any code.
- See provisioning, revocation, sign-in, and message-delivery history.
- See an obvious warning when the app and UniFi disagree.

### Explicitly deferred

- Rolling codes and scheduled SMS rotation.
- Remote gate-open buttons.
- Native mobile apps.
- Multiple properties or gates.
- Self-service public signup.
- Complex recurring visitor schedules.
- A redesign of the existing phone bridge or its dashboard.

## UX specification

### Resident home

The initial screen should contain:

- Property name.
- One dominant **Create guest code** button.
- An **Active codes** list showing label, large spaced digits, and expiration.
- An **Upcoming codes** section only when it has content.
- A collapsed **Past codes** section.

No charts, UniFi terminology, role controls, tables, or hamburger menu are
needed for residents.

### Creation flow

Use one short page or three very small steps:

1. “Who is this for?” — optional name.
2. “How long should it work?” — Today / 7 days / Choose dates.
3. Review and **Create code**.

The success state must show:

- The PIN in large, spaced digits.
- Plain-language validity dates in the property's timezone.
- **Copy code** and **Share** actions.
- “You can always find this code on the home screen.”

Never remove a successfully created code from the UI just because the creation
screen was dismissed.

### Accessibility baseline

- Minimum 18px resident body text and generous touch targets.
- High contrast; status must not rely on color alone.
- Plain language and explicit dates, including the year where ambiguity exists.
- No swipe-only actions, hover-only explanations, or auto-disappearing notices.
- Confirmation before revocation, followed by a persistent result.
- Test at 200% browser zoom and with VoiceOver/TalkBack.
- Test on the actual phones used by the pilot household.

## Proposed technical baseline

- Next.js with TypeScript, using the Node.js runtime.
- Server Components and server actions/route handlers by default; add client
  components only where interaction requires them.
- SQLite for the initial single-host deployment, with checked-in migrations.
- A small repository layer so the database choice is not spread through UI code.
- A server-only `UnifiAccessAdapter` interface isolating all controller details.
- A provider interface for email and SMS so pilot delivery can change without
  changing product logic.
- A production Next.js build managed by systemd and bound to `127.0.0.1`.
- `cloudflared` managed separately by systemd.

Select the concrete auth and database libraries during repository bootstrap,
after checking their current Next.js compatibility. Avoid a large application
framework layered on top of Next.js for this small deployment.

## Data model

### `households`

- `id`, `name`, `status`, timestamps

### `users`

- `id`, normalized email and/or phone, display name, status, timestamps

### `memberships`

- `user_id`, `household_id`, role (`resident` or `admin`)

### `invitations`

- Recipient, household, role, token digest, expiry, accepted/revoked timestamps

### `sessions`

- Opaque token digest, user, expiry, last-used timestamp, revocation timestamp

### `credentials`

- Household and creator
- Human label
- Encrypted PIN value plus a safe display suffix
- Requested start/end time
- Controller credential/visitor identifier
- State: `pending`, `active`, `revoking`, `revoked`, `expired`, `failed`, or
  `out_of_sync`
- Provisioning error and timestamps

### `deliveries`

- Credential, recipient, channel, provider identifier, state, attempts, error,
  timestamps

### `audit_events`

- Actor, household, action, target, result, request correlation ID, timestamp,
  and safe metadata

Audit metadata must never contain a raw PIN, invitation token, session token, or
provider secret.

## Credential lifecycle

1. Authorize the resident against the household.
2. Generate a random PIN using a cryptographically secure generator.
3. Reject ambiguous or prohibited patterns and retry controller conflicts.
4. Insert a `pending` record.
5. Provision the scheduled credential in UniFi with an idempotency key where
   the API permits it.
6. Store the controller identifier and mark the record `active` only after the
   controller confirms success.
7. Display and optionally share the code.
8. Reconcile controller state periodically and on every admin view.
9. Revoke in UniFi before marking the local record `revoked`.

The application is the friendly record of who and why; UniFi is the enforcement
authority. Never claim a code is active or revoked unless controller state is
known. When state is uncertain, show **Needs attention**, not a reassuring guess.

Because users must be able to retrieve codes later, PINs cannot be stored only
as hashes. Encrypt them with authenticated encryption using a key outside the
database. Mask codes by default in the admin interface and audit every reveal.

## Authentication and authorization

- Invitations are admin-created, single-use, short-lived, and stored as token
  digests rather than raw tokens.
- There is no public registration endpoint.
- Use secure, HTTP-only, same-site cookies and rotate the session after sign-in.
- A resident can read and mutate only their household's credentials.
- Only an admin can invite residents, view all households, or override ownership.
- Suspending a user revokes their sessions immediately but does not silently
  revoke guest credentials; the admin chooses what happens to those codes.
- Rate-limit magic-link requests, invitation acceptance, PIN creation, reveal,
  and revocation.
- Require a recent sign-in for changing identity details or revealing codes
  outside the resident's own household.

## Local deployment and Tunnel

- Bind Next.js to `127.0.0.1`, not the LAN or all interfaces.
- Route a dedicated hostname such as `gate.example.com` to
  `http://localhost:<app-port>`.
- Keep the required final Tunnel ingress rule as `http_status:404`.
- Keep tunnel credentials and application secrets out of git.
- Set the public base URL explicitly and reject unexpected Host headers.
- Trust forwarded client information only from the local `cloudflared` origin.
- Validate and test Tunnel ingress rules before restarting production.
- Run database backups independently of the application and test restoration.
- Alert when the app, tunnel, controller connection, or reconciliation job is
  unhealthy.

Do not route the UniFi controller, SQLite file, debug endpoints, or an
unrestricted internal API through the tunnel.

## Rolling codes — phase two

Rolling codes are an advanced feature, not a resident-home-screen feature.

Configuration includes a recipient, label, cadence, timezone, delivery channel,
and grace period. A safe rotation should:

1. Provision the next scheduled credential first.
2. Confirm it with UniFi.
3. Send it and record provider delivery state.
4. Keep the previous credential valid for a bounded overlap when UniFi's model
   supports separate credentials.
5. Alert the admin on any provisioning or delivery failure.
6. Never revoke the old credential first and then hope the new message arrives.

If UniFi permits only one PIN for the underlying identity, use separate visitor
credentials or do not offer overlap-based rotation. SMS delivery receipts are
useful operational signals but are not proof that a person read the message.

## Milestones

### 0. Integration proof

- Complete the UniFi capability spike and expiry-offline test.

### 1. Walking skeleton

- Bootstrap Next.js, database migrations, local secrets, health check, systemd
  unit, and Tunnel hostname.
- Implement admin-created invitation and persistent sign-in.
- Implement the UniFi adapter with recorded fixtures for tests.

### 2. Wife pilot

- Create, list, reveal, share, and revoke temporary codes.
- Add clear active/upcoming/past state.
- Add admin visibility and basic audit history.
- Observe the pilot instead of explaining the UI; fix every point that requires
  verbal guidance.

### 3. Household pilot

- Add the first neighbor household.
- Add reconciliation, backups, health alerts, and recovery procedures.
- Verify behavior during controller, internet, Tunnel, and SMS outages.

### 4. Rolling codes

- Add scheduling and delivery only after temporary credentials have been stable
  in real use.

## Initial acceptance tests

- A resident creates a code and can still retrieve it after signing out and back
  in.
- A second household cannot see or modify that code.
- The admin sees it and its true controller status.
- Refreshing or retrying creation does not create duplicate credentials.
- Revocation survives a lost browser response and remains idempotent.
- An expired code fails at the physical reader while the app is stopped.
- An app database restore can reconcile with the controller without presenting
  stale codes as valid.
- Logs and error reports contain no raw PINs or authentication tokens.
- The existing call-to-open bridge continues working throughout deployment and
  outages of the new app.

## First repository tasks

1. Create `gate-access` with a concise README linking to this plan.
2. Add the UniFi capability spike before application scaffolding grows.
3. Record architecture decisions for credential expiry, auth library, encryption
   key management, and database backups.
4. Build the resident home and creation flow using a fake UniFi adapter.
5. Replace the fake adapter only after the physical-reader spike passes.

## References

- [UniFi visitor schedules](https://help.ui.com/hc/en-us/articles/29026499254935-Configuring-Visitor-Schedules-in-UniFi-Access)
- [UniFi PIN configuration](https://help.ui.com/hc/en-us/articles/29027022553239-Configuring-PIN-Unlock-in-UniFi-Access)
- [Cloudflare Tunnel configuration](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/configure-tunnels/local-management/configuration-file/)
- [Twilio messaging onboarding](https://www.twilio.com/docs/messaging/onboarding)
