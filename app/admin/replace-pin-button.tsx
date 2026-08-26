"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function ReplacePinButton({ userId, name, hasPin }: { userId: string; name: string; hasPin: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [manualPin, setManualPin] = useState("");
  const [resultPin, setResultPin] = useState<string>();
  const [error, setError] = useState<string>();
  const [working, setWorking] = useState(false);

  function close() {
    if (working) return;
    setOpen(false);
    setManualPin("");
    setResultPin(undefined);
    setError(undefined);
  }

  async function savePin(pin?: string) {
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/people/${encodeURIComponent(userId)}/replace-pin`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: name, ...(pin ? { pin } : {}) }),
      });
      const body = await response.json() as { pin?: string; error?: string };
      if (!response.ok || !body.pin) throw new Error(body.error || "Could not save the PIN.");
      setResultPin(body.pin);
      router.refresh();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Could not save the PIN.");
    } finally {
      setWorking(false);
    }
  }

  function submitManualPin(event: FormEvent) {
    event.preventDefault();
    const pin = manualPin.trim();
    if (!/^\d{4,8}$/.test(pin)) {
      setError("Use a 4 to 8 digit PIN.");
      return;
    }
    void savePin(pin);
  }

  return <><button className="replace-pin-button" type="button" onClick={() => setOpen(true)}>Manage PIN</button>{open ? <div className="dialog-backdrop" role="presentation"><section className="dialog pin-dialog" role="dialog" aria-modal="true" aria-labelledby={`pin-dialog-${userId}`}><p className="eyebrow">{hasPin ? "Current PIN assigned" : "No PIN assigned"}</p><h2 id={`pin-dialog-${userId}`}>Manage {name}&apos;s PIN</h2>{resultPin ? <><p className="pin-dialog-success">Gatey saved this PIN:</p><p className="dialog-pin">{resultPin}</p><button className="primary-action" type="button" onClick={close}>Done</button></> : <form onSubmit={submitManualPin}><label className="field-label" htmlFor={`pin-${userId}`}>Choose a PIN <span>4–8 digits</span></label><input id={`pin-${userId}`} className="text-input pin-input" value={manualPin} onChange={(event) => setManualPin(event.target.value.replace(/\D/g, "").slice(0, 8))} inputMode="numeric" autoComplete="off" placeholder="For example: 1234" autoFocus /><p className="pin-dialog-note">A specified PIN is tried without removing the current one first. If UniFi rejects it, the existing PIN stays unchanged.</p>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="pin-dialog-actions"><button className="primary-action" type="submit" disabled={working}>{working ? "Saving PIN…" : "Save this PIN"}</button><button className="secondary-action" type="button" disabled={working} onClick={() => void savePin()}>{working ? "Saving PIN…" : "Generate a new PIN instead"}</button><button className="text-button" type="button" disabled={working} onClick={close}>Cancel</button></div></form>}</section></div> : null}</>;
}
