"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ReplacePinButton({ userId, name }: { userId: string; name: string }) {
  const router = useRouter();
  const [pin, setPin] = useState<string>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  async function replacePin() {
    if (!window.confirm(`Replace ${name}'s current UniFi PIN? The old PIN will stop working before the new one is assigned.`)) return;
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/people/${encodeURIComponent(userId)}/replace-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name }),
      });
      const body = await response.json() as { pin?: string; error?: string };
      if (!response.ok || !body.pin) throw new Error(body.error || "Could not replace the PIN.");
      setPin(body.pin);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not replace the PIN.");
    } finally {
      setWorking(false);
    }
  }

  return <div className="pin-replacement"><button className="replace-pin-button" type="button" disabled={working} onClick={replacePin}>{working ? "Replacing PIN…" : "Replace PIN"}</button>{pin ? <p className="new-pin">New Gatey PIN: <strong>{pin}</strong></p> : null}{error ? <p className="replace-pin-error">{error}</p> : null}</div>;
}
