"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { PhoneAccess } from "@/lib/phone-access";

export function PersonPhoneManager({ userId, personName, phones }: { userId: string; personName: string; phones: PhoneAccess[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<PhoneAccess | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  function close() {
    if (working) return;
    setOpen(false);
    setEditing(null);
    setError(undefined);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const payload = {
      phoneE164: form.get("phoneE164"),
      label: form.get("label"),
      notes: form.get("notes"),
      enabled: form.get("enabled") === "on",
      canOpen: form.get("canOpen") === "on",
      canHoldOpen: form.get("canHoldOpen") === "on",
    };
    const endpoint = editing
      ? `/api/admin/users/${encodeURIComponent(userId)}/phones/${encodeURIComponent(editing.id)}`
      : `/api/admin/users/${encodeURIComponent(userId)}/phones`;
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(endpoint, { method: editing ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save this phone number.");
      setEditing(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not save this phone number.");
    } finally { setWorking(false); }
  }

  async function remove(phone: PhoneAccess) {
    if (!window.confirm(`Remove ${phone.phoneE164} from ${personName}?`)) return;
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/phones/${encodeURIComponent(phone.id)}`, { method: "DELETE" });
      if (!response.ok) {
        const result = await response.json() as { error?: string };
        throw new Error(result.error || "Could not remove this phone number.");
      }
      setEditing(null);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this phone number.");
    } finally { setWorking(false); }
  }

  return <>
    <Button variant="outline" onClick={() => setOpen(true)}>Phone access{phones.length ? ` (${phones.length})` : ""}</Button>
    {open ? <div className="dialog-backdrop" role="presentation"><section className="dialog admin-assignment-dialog" role="dialog" aria-modal="true" aria-labelledby={`phones-${userId}`}>
      <p className="eyebrow">Call-to-open</p>
      <h2 id={`phones-${userId}`}>{personName}&apos;s phone access</h2>
      {phones.length ? <div className="grid gap-2">{phones.map((phone) => <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3" key={phone.id}><div><strong className="block">{phone.phoneE164}</strong><span className="text-xs text-muted-foreground">{phone.label} · {phone.enabled ? [phone.canOpen ? "open" : "", phone.canHoldOpen ? "30-minute hold" : ""].filter(Boolean).join(", ") || "no actions" : "disabled"}</span></div><div className="flex gap-2"><Button size="sm" variant="outline" onClick={() => setEditing(phone)}>Edit</Button><Button size="sm" variant="outline" onClick={() => void remove(phone)} disabled={working}>Remove</Button></div></div>)}</div> : <p>No phone numbers are authorized yet.</p>}
      <form className="admin-assignment-form" onSubmit={save} key={editing?.id || "new"}>
        <h3 className="font-semibold">{editing ? "Edit phone" : "Add phone"}</h3>
        <div className="admin-assignment-fields"><label>Phone number<input name="phoneE164" type="tel" defaultValue={editing?.phoneE164} placeholder="+17075551111" required /></label><label>Label<input name="label" defaultValue={editing?.label || "Mobile"} required /></label><label>Notes<input name="notes" defaultValue={editing?.notes} placeholder="Optional" /></label></div>
        <label className="flex-row items-center gap-2"><input name="enabled" type="checkbox" defaultChecked={editing?.enabled ?? true} /> Enabled</label>
        <label className="flex-row items-center gap-2"><input name="canOpen" type="checkbox" defaultChecked={editing?.canOpen ?? true} /> Press 1 can open the gate</label>
        <label className="flex-row items-center gap-2"><input name="canHoldOpen" type="checkbox" defaultChecked={editing?.canHoldOpen ?? false} /> Press 2 can hold it open for 30 minutes</label>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions"><Button type="submit" disabled={working}>{working ? "Saving…" : editing ? "Save changes" : "Add phone"}</Button>{editing ? <Button type="button" variant="outline" onClick={() => setEditing(null)}>Cancel edit</Button> : null}<Button type="button" variant="outline" onClick={close}>Done</Button></div>
      </form>
    </section></div> : null}
  </>;
}
