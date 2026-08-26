# Gatey

A small, resident-first guest code app for Oakview Gate. The product plan lives
in [`../NEW_APP_PLAN.md`](../NEW_APP_PLAN.md).

## Current slice

The resident pilot flow is implemented with a fake, device-local backend:

- See active, upcoming, expired, and canceled codes
- Create a code for today, seven days, or exact dates
- Copy and share a code
- Cancel a code with confirmation
- Keep demo codes across refreshes using browser storage

The UI says when it is in demo mode. It does not contact UniFi yet and should
not be mistaken for a real credential issuer.

## Run locally

```bash
npm run dev -- --hostname 127.0.0.1
```

Then open the local URL printed by Next.js. Run `npm run build` for a production
build.

## Practical MVP posture

This is a convenience system for a residential gate with a nearby unlocked
pedestrian entrance. The MVP keeps the important boundaries—UniFi calls stay
server-side, households cannot see each other's codes, and controller-enforced
expiry is required—without building bank-grade controls around low-impact data.

The next engineering slice is the UniFi capability spike, followed by swapping
the device-local demo repository for SQLite and adding simple long-lived login.
