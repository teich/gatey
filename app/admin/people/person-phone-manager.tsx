"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock3, Pencil, Phone, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
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

  const formKey = editing?.id || "new";
  return <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : close()}>
    <DialogTrigger render={<Button variant="outline" />}><Phone data-icon="inline-start" />Phone access{phones.length ? ` (${phones.length})` : ""}</DialogTrigger>
    <DialogContent className="sm:max-w-xl" showCloseButton={!working}>
      <DialogHeader>
        <span className="text-xs font-semibold tracking-[.16em] text-muted-foreground uppercase">Call-to-open</span>
        <DialogTitle>{personName}&apos;s phone access</DialogTitle>
        <DialogDescription>Choose which numbers can call Gatey and what each caller is allowed to do.</DialogDescription>
      </DialogHeader>

      {phones.length ? <div className="grid gap-2">{phones.map((phone) => {
        const permissions = phone.enabled ? [phone.canOpen ? "Open gate" : "", phone.canHoldOpen ? "30-minute hold" : ""].filter(Boolean) : [];
        return <div className="flex items-center gap-3 rounded-xl border bg-background p-3" key={phone.id}>
          <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground"><Phone className="size-4" /></div>
          <div className="min-w-0 flex-1"><strong className="block truncate text-sm">{phone.phoneE164}</strong><div className="mt-1 flex flex-wrap items-center gap-1.5"><span className="text-xs text-muted-foreground">{phone.label}</span>{phone.enabled ? permissions.map((permission) => <span className="rounded-md bg-primary/8 px-1.5 py-0.5 text-[11px] font-medium text-primary" key={permission}>{permission}</span>) : <span className="rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">Disabled</span>}</div></div>
          <div className="flex shrink-0 gap-1"><Button type="button" size="icon-sm" variant="ghost" onClick={() => { setEditing(phone); setError(undefined); }} aria-label={`Edit ${phone.phoneE164}`}><Pencil /></Button><Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => void remove(phone)} disabled={working} aria-label={`Remove ${phone.phoneE164}`}><Trash2 /></Button></div>
        </div>;
      })}</div> : <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/30 p-4"><div className="flex size-9 items-center justify-center rounded-lg bg-background text-muted-foreground"><Phone className="size-4" /></div><div><p className="text-sm font-medium">No authorized phones</p><p className="text-xs text-muted-foreground">Add a number below to enable call-to-open.</p></div></div>}

      <Separator />

      <form className="grid gap-5" onSubmit={save} key={formKey}>
        <div className="flex items-center justify-between gap-3"><div><h3 className="text-sm font-semibold">{editing ? "Edit phone" : "Add a phone"}</h3><p className="text-xs text-muted-foreground">Use the full international number, including + and country code.</p></div>{editing ? <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(null); setError(undefined); }}>Cancel edit</Button> : null}</div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor={`phone-${formKey}`}>Phone number</label><Input id={`phone-${formKey}`} name="phoneE164" type="tel" defaultValue={editing?.phoneE164} placeholder="+17075551111" autoComplete="tel" required className="h-10 font-mono" /></div>
          <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor={`label-${formKey}`}>Label</label><Input id={`label-${formKey}`} name="label" defaultValue={editing?.label || "Mobile"} placeholder="Mobile" required className="h-10" /></div>
          <div className="grid gap-1.5 sm:col-span-2"><label className="text-sm font-medium" htmlFor={`notes-${formKey}`}>Notes <span className="font-normal text-muted-foreground">(optional)</span></label><Input id={`notes-${formKey}`} name="notes" defaultValue={editing?.notes} placeholder="Owner, family, caregiver…" className="h-10" /></div>
        </div>

        <div className="grid gap-2">
          <label htmlFor={`enabled-${formKey}`} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-data-checked:border-primary/35 has-data-checked:bg-primary/[.035]"><Checkbox id={`enabled-${formKey}`} name="enabled" defaultChecked={editing?.enabled ?? true} className="mt-0.5" /><span><span className="block text-sm font-medium">Enabled</span><span className="block text-xs leading-relaxed text-muted-foreground">Accept calls from this number.</span></span></label>
          <label htmlFor={`open-${formKey}`} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-data-checked:border-primary/35 has-data-checked:bg-primary/[.035]"><Checkbox id={`open-${formKey}`} name="canOpen" defaultChecked={editing?.canOpen ?? true} className="mt-0.5" /><ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="block text-sm font-medium">Open the gate</span><span className="block text-xs leading-relaxed text-muted-foreground">Press 1 performs a normal momentary open.</span></span></label>
          <label htmlFor={`hold-${formKey}`} className="flex cursor-pointer items-start gap-3 rounded-xl border p-3 transition-colors has-data-checked:border-primary/35 has-data-checked:bg-primary/[.035]"><Checkbox id={`hold-${formKey}`} name="canHoldOpen" defaultChecked={editing?.canHoldOpen ?? false} className="mt-0.5" /><Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="block text-sm font-medium">Hold open for 30 minutes</span><span className="block text-xs leading-relaxed text-muted-foreground">Press 2 starts party mode immediately.</span></span></label>
        </div>

        {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={close} disabled={working}>Done</Button><Button type="submit" disabled={working}>{editing ? <Pencil data-icon="inline-start" /> : <Plus data-icon="inline-start" />}{working ? "Saving…" : editing ? "Save changes" : "Add phone"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
