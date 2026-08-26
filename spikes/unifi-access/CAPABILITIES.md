# UniFi Access capability matrix

This spike uses the same `UNIFI_*` runtime variables as `phone-gate-bridge`.
It makes only authenticated `GET` requests and never prints the bearer token.

Run it on a machine that has the bridge environment values:

```bash
npm run spike:unifi -- --write-fixture
```

| Capability | Status | Evidence / next check |
| --- | --- | --- |
| Authenticate to UniFi Access | Proven | The bridge token authenticated every probe request. |
| List doors | Proven by bridge | `GET /api/v1/developer/doors` |
| List visitor records | Proven | `GET /api/v1/developer/visitors` returns visitor IDs, PIN presence, dates, schedule, and resources. |
| Create scheduled visitor PIN | In progress | The documented lifecycle is create visitor with `resources`, generate a PIN, then assign it to the visitor. |
| Read a visitor PIN by stable ID | Proven | The created visitor was immediately returned by the list endpoint with its stable ID and timing metadata. |
| Revoke a visitor PIN | Proven | `DELETE /api/v1/developer/visitors/{id}` revoked both disposable probe records. |
| Assign a new visitor to the gate door group | In progress | The official reference specifies `resources: [{ id, type: "door_group" }]`; earlier probes used an invalid visit reason and did not assign PINs separately. |
| Controller-enforced expiry while Gatey is offline | Unknown | Physical-reader test after successful scheduled creation. |

The controller's official reference documents the full visitor lifecycle: create
the visitor with location resources, generate a PIN credential, then assign the
PIN to the visitor. The lifecycle script follows that sequence.
