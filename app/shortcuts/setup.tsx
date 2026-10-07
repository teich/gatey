"use client";

import { useCallback, useEffect, useState } from "react";

type Connection = { id: string; createdAt: number; lastUsedAt: number | null } | null;

export default function ShortcutSetup({ initialConnection }: { initialConnection: Connection }) {
  const [connection, setConnection] = useState(initialConnection);
  const [pairing, setPairing] = useState<{ pairingUrl: string; expiresAt: number } | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/shortcuts", { cache: "no-store" });
      if (!response.ok) throw new Error("Could not refresh connection status. Reload Gatey to try again.");
      const result = await response.json() as { connection: Connection };
      setConnection(result.connection);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not refresh connection status."); }
  }, []);

  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === "visible") void refresh(); };
    window.addEventListener("focus", onVisible);
    window.addEventListener("pageshow", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onVisible);
      window.removeEventListener("pageshow", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  async function mutate(method: "POST" | "DELETE") {
    setPending(true); setError(""); setNotice(""); setPairing(null);
    try {
      const response = await fetch("/api/shortcuts", { method });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Could not update shortcut access.");
      if (method === "POST") setPairing(result);
      else {
        setConnection(null);
        setNotice("Shortcut access disconnected. Turn off the arrival automation in Shortcuts to stop failed attempts.");
      }
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Could not update shortcut access."); }
    finally { setPending(false); }
  }

  return <>
    <div className="shortcut-status" role="status">
      <strong>{connection ? "Shortcut access connected" : "No shortcut connected"}</strong>
      <p>{connection?.lastUsedAt ? `Last accepted opening: ${new Date(connection.lastUsedAt).toISOString().slice(0, 16).replace("T", " ")} UTC` : connection ? "No opening recorded yet. Pairing alone does not open the gate." : "Install the shortcut, then connect your account below."}</p>
      <small>Connection status does not verify that your iPhone’s arrival automation is enabled.</small>
    </div>
    {error ? <p role="alert" className="shortcut-error">{error}</p> : null}
    {notice ? <p role="status">{notice}</p> : null}
    <section className="shortcut-step">
      <h2>1. Add the shortcut</h2>
      <p>On your iPhone, download and open the file, then choose Add Shortcut. Keep its name “Open Gatey.” If a download preview appears, open it in Shortcuts.</p>
      <a className="shortcut-button" href="/shortcuts/Open%20Gatey.shortcut">Download Open Gatey</a>
      <p className="shortcut-note">This shared file contains no access key. It uses iCloud Drive → Shortcuts → Gatey-connection.json to remember your connection. Enable iCloud Drive on this iPhone.</p>
    </section>
    <section className="shortcut-step">
      <h2>2. Connect your account</h2>
      <p>Create a connection link, then tap Connect this iPhone. Allow Shortcuts to connect to Gatey and save its connection file when asked. This step does not open the gate.</p>
      {connection ? <p className="shortcut-note">Connecting again replaces your current shortcut key. Other devices using the old key will need to reconnect.</p> : null}
      <button className="shortcut-button" disabled={pending} onClick={() => void mutate("POST")}>{pending ? "Working…" : pairing ? "Create a fresh connection link" : "Create connection link"}</button>
      {pairing ? <div className="shortcut-connect"><a className="shortcut-button" href={pairing.pairingUrl}>Connect this iPhone</a><p>Single-use link, valid for 10 minutes. After Shortcuts says you’re connected, return here.</p></div> : null}
    </section>
    <section className="shortcut-step">
      <h2>3. Test an opening</h2>
      <p>Run Open Gatey once from Shortcuts and allow any remaining permissions. <strong>This opens the gate.</strong> Confirm it moves before setting up automatic arrival.</p>
      <button className="shortcut-secondary" disabled={pending} onClick={() => void refresh()}>Refresh connection status</button>
    </section>
    <section className="shortcut-step">
      <h2>4. Open when you arrive</h2>
      <ol>
        <li>In Shortcuts, open Automation → + → Arrive. On newer versions, edit Open Gatey and add an Arrive automation.</li>
        <li>Select the gate’s position on the map. Start with a radius of about 200 meters, and adjust after a test drive.</li>
        <li>Choose Any Time and Run Immediately (without confirmation).</li>
        <li>Select Open Gatey. If you’re choosing actions, use Run Shortcut → Open Gatey, with no input.</li>
        <li>Drive outside the circle, lock your phone, and drive home. Check whether the opening happens at the right time.</li>
      </ol>
      <p className="shortcut-note">Cellular service is needed at the arrival boundary. Keep the connection file downloaded in Files if that option is available. If an arrival is missed, use Gatey’s normal open button. Don’t add delayed retries.</p>
    </section>
    <section className="shortcut-step">
      <h2>Disconnect</h2>
      <p>Immediately disable this account’s shortcut key and any unused connection link. Your normal Gatey access stays available.</p>
      <button className="shortcut-secondary" disabled={pending} onClick={() => void mutate("DELETE")}>Disconnect shortcut access</button>
    </section>
  </>;
}
