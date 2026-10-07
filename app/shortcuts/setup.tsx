"use client";

import { useState } from "react";

type Connection = { id: string; createdAt: number; lastUsedAt: number | null } | null;
type Access = { token: string };

export default function ShortcutSetup({ initialConnection }: { initialConnection: Connection }) {
  const [connection, setConnection] = useState(initialConnection);
  const [access, setAccess] = useState<Access | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function copy(value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setNotice("Copied.");
    } catch {
      setNotice("Select the value above and copy it manually.");
    }
  }

  async function mutate(method: "POST" | "DELETE") {
    setPending(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/shortcuts", { method });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update shortcut access.");
      if (method === "POST") {
        setAccess(result);
        setConnection(result.connection);
      } else {
        setAccess(null);
        setConnection(null);
        setNotice("Shortcut access disconnected.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update shortcut access."); }
    finally { setPending(false); }
  }

  return <>
    {error ? <p role="alert" className="shortcut-error">{error}</p> : null}
    <section className="shortcut-step">
      <h2>1. Download Open Gatey</h2>
      <p>Download the shortcut on your iPhone, open it in Shortcuts, and choose Add Shortcut. It contains one action with the gate’s URL and POST method already set.</p>
      <a className="shortcut-button" href="/shortcuts/Open%20Gatey.shortcut">Download Open Gatey</a>
      <p className="shortcut-note">Delete the old version first if you installed it.</p>
    </section>
    <section className="shortcut-step">
      <h2>2. Paste your access key</h2>
      <p>Create a key below. Edit Open Gatey in Shortcuts, expand its action’s options, and replace the Authorization header value with the copied value. That’s the only field you need to change.</p>
      {connection ? <p className="shortcut-note">You already have an active key. Creating a replacement disables the old key; paste the replacement into your shortcut.</p> : null}
      <button className="shortcut-button" disabled={pending} onClick={() => void mutate("POST")}>{pending ? "Working…" : connection ? "Create replacement key" : "Create access key"}</button>
      {access ? <div className="shortcut-connect">
        <p><label htmlFor="shortcut-authorization">Authorization header value</label></p>
        <input id="shortcut-authorization" className="shortcut-value" readOnly value={`Bearer ${access.token}`} onFocus={(event) => event.currentTarget.select()} />
        <button className="shortcut-secondary" onClick={() => void copy(`Bearer ${access.token}`)}>Copy Authorization</button>
        <p className="shortcut-note">This value is shown only when you create the key. If you lose it, create a replacement here.</p>
      </div> : null}
      {notice ? <p role="status">{notice}</p> : null}
      <p>Run Open Gatey once while at the gate and allow network access if asked. <strong>This opens the gate.</strong></p>
    </section>
    <section className="shortcut-step">
      <h2>3. Run it when you arrive</h2>
      <ol>
        <li>Open Automation → + → Arrive and choose the gate’s location.</li>
        <li>Start with a boundary of about 200 meters. Choose Any Time and Run Immediately.</li>
        <li>Select Open Gatey (or add Run Shortcut → Open Gatey).</li>
        <li>Drive outside the boundary and return with your phone locked. Adjust the boundary if the gate opens too early or late.</li>
      </ol>
      <p className="shortcut-note">Your phone needs an internet connection when you arrive. Your location stays on your phone.</p>
    </section>
    {connection ? <section className="shortcut-step">
      <h2>Disconnect</h2>
      <p>Disable the key if you no longer use the automation.</p>
      <button className="shortcut-secondary" disabled={pending} onClick={() => void mutate("DELETE")}>Disconnect shortcut access</button>
    </section> : null}
  </>;
}
