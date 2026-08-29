"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function MigrateVisitorButton({ visitorId, visitorName, households }: { visitorId: string; visitorName: string; households: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [householdId, setHouseholdId] = useState("");
  const [label, setLabel] = useState(visitorName);
  const [pin, setPin] = useState("");
  const [kind, setKind] = useState<"home" | "ongoing">("ongoing");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function migrate(event: FormEvent) {
    event.preventDefault();
    setWorking(true);
    setError("");
    try {
      const response = await fetch(`/api/admin/visitors/${encodeURIComponent(visitorId)}/migrate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ householdId, label, pin, kind }) });
      const contentType = response.headers.get("content-type") || "";
      if (!contentType.toLowerCase().includes("application/json")) {
        throw new Error(`Migration could not be completed${response.ok ? "." : ` (${response.status}).`}`);
      }
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!body) throw new Error("Migration could not be completed because Gatey returned an invalid response.");
      if (!response.ok) throw new Error(body.error || "Migration could not be completed.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Migration could not be completed.");
    } finally { setWorking(false); }
  }

  return <><button className="replace-pin-button" type="button" onClick={() => setOpen(true)}>Move to Gatey</button>{open ? <div className="dialog-backdrop" role="presentation"><section className="dialog pin-dialog" role="dialog" aria-modal="true" aria-labelledby={`migrate-${visitorId}`}><p className="eyebrow">One-time migration</p><h2 id={`migrate-${visitorId}`}>Move {visitorName} to Gatey</h2><p className="pin-dialog-note">Gatey will move this PIN to a new managed visitor. If UniFi rejects the handoff, Gatey will restore the PIN to the original visitor.</p><form className="migrate-visitor-form" onSubmit={migrate}><label className="field-label">Household<select className="text-input" value={householdId} onChange={(event) => setHouseholdId(event.target.value)} required><option value="">Choose household…</option>{households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select></label><label className="field-label">Name<input className="text-input" value={label} onChange={(event) => setLabel(event.target.value)} required /></label><label className="field-label">This is a<select className="text-input" value={kind} onChange={(event) => setKind(event.target.value as "home" | "ongoing")}><option value="ongoing">Ongoing code</option><option value="home">Home code</option></select></label><label className="field-label">Existing PIN <span>4–6 digits</span><input className="text-input pin-input" value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" required autoFocus /></label>{error ? <p className="form-error" role="alert">{error}</p> : null}<div className="pin-dialog-actions"><button className="primary-action" type="submit" disabled={working}>{working ? "Moving…" : "Move to Gatey"}</button><button className="text-button" type="button" disabled={working} onClick={() => setOpen(false)}>Cancel</button></div></form></section></div> : null}</>;
}
