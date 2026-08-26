# UniFi Access spike

This is the integration gate before any real Gatey credential provisioning.

It shares the bridge's runtime configuration names:

```text
UNIFI_HOST
UNIFI_ACCESS_API_TOKEN
UNIFI_ACCESS_PORT=12445
UNIFI_INSECURE_TLS=false
UNIFI_DOOR_NAME=Gate
```

Load those values from the protected bridge environment on the actual host, or
give Gatey its own protected environment file with the same values. Do not copy
the token into `.env.example`, source, fixtures, or git.

The initial probe is read-only. Its optional fixture output redacts sensitive
keys and is intended to document the controller's available API surface.

After the read-only probe identifies a working visitor endpoint, create one
short-lived physical-reader test credential:

```bash
npm run spike:unifi:visitor -- --create --minutes 10
```

The command borrows the resource, schedule, timezone, and timestamp format
from the controller topology. It creates a recurring visitor schedule that is
usable all day, every day, within the requested start/end window. It prints the
resulting PIN and stable visitor ID, then leaves the credential active for the
requested window. Revoke it after the reader test:

```bash
npm run spike:unifi:visitor -- --revoke <visitor-id>
```
