"use client";

import { useId } from "react";
import { Clock3, Phone, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export type EditablePhone = {
  key: string;
  id?: string;
  phoneE164: string;
  label: string;
  notes: string;
  enabled: boolean;
  canOpen: boolean;
  canHoldOpen: boolean;
};

export function PersonPhoneEditor({ phones, disabled, onChange }: {
  phones: EditablePhone[];
  disabled: boolean;
  onChange: (phones: EditablePhone[]) => void;
}) {
  const headingId = useId();

  function update(key: string, patch: Partial<EditablePhone>) {
    onChange(phones.map((phone) => phone.key === key ? { ...phone, ...patch } : phone));
  }

  function add() {
    onChange([...phones, {
      key: crypto.randomUUID(),
      phoneE164: "",
      label: "Mobile",
      notes: "",
      enabled: true,
      canOpen: true,
      canHoldOpen: false,
    }]);
  }

  return <section className="grid gap-4" aria-labelledby={headingId}>
    <div className="flex items-start justify-between gap-3">
      <div><h3 id={headingId} className="text-sm font-semibold">Phone access{phones.length ? ` (${phones.length})` : ""}</h3><p className="text-xs leading-relaxed text-muted-foreground">Numbers this person can use to call Gatey. Changes are saved with the rest of the person.</p></div>
      <Button type="button" size="sm" variant="outline" onClick={add} disabled={disabled}><Plus data-icon="inline-start" />Add number</Button>
    </div>

    {!phones.length ? <div className="flex items-center gap-3 rounded-xl border border-dashed bg-muted/30 p-4"><div className="flex size-9 items-center justify-center rounded-lg bg-background text-muted-foreground"><Phone className="size-4" /></div><div><p className="text-sm font-medium">No authorized phones</p><p className="text-xs text-muted-foreground">This person cannot use call-to-open.</p></div></div> : null}

    <div className="grid gap-3">{phones.map((phone, index) => {
      const fieldId = `phone-${phone.key}`;
      return <div className="grid gap-4 rounded-xl border bg-muted/20 p-4" key={phone.key}>
        <div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><Phone className="size-4 shrink-0 text-muted-foreground" /><h4 className="truncate text-sm font-semibold">{phone.phoneE164 || `New phone ${index + 1}`}</h4></div><Button type="button" size="icon-sm" variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={() => onChange(phones.filter((candidate) => candidate.key !== phone.key))} disabled={disabled} aria-label={`Remove ${phone.phoneE164 || `new phone ${index + 1}`}`}><Trash2 /></Button></div>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor={fieldId}>Phone number</label><Input id={fieldId} type="tel" value={phone.phoneE164} onChange={(event) => update(phone.key, { phoneE164: event.target.value })} placeholder="+17075551111" autoComplete="tel" required disabled={disabled} className="h-10 font-mono" /><p className="text-xs text-muted-foreground">Include + and the country code.</p></div>
          <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor={`label-${phone.key}`}>Label</label><Input id={`label-${phone.key}`} value={phone.label} onChange={(event) => update(phone.key, { label: event.target.value })} placeholder="Mobile" required disabled={disabled} className="h-10" /></div>
          <div className="grid gap-1.5 sm:col-span-2"><label className="text-sm font-medium" htmlFor={`notes-${phone.key}`}>Notes <span className="font-normal text-muted-foreground">(optional)</span></label><Input id={`notes-${phone.key}`} value={phone.notes} onChange={(event) => update(phone.key, { notes: event.target.value })} placeholder="Owner, family, caregiver…" disabled={disabled} className="h-10" /></div>
        </div>

        <div className="grid gap-2 sm:grid-cols-3">
          <label htmlFor={`enabled-${phone.key}`} className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-data-checked:border-primary/35 has-data-checked:bg-primary/[.035]"><Checkbox id={`enabled-${phone.key}`} checked={phone.enabled} onCheckedChange={(checked) => update(phone.key, { enabled: checked })} disabled={disabled} className="mt-0.5" /><span><span className="block text-sm font-medium">Enabled</span><span className="block text-xs leading-relaxed text-muted-foreground">Accept calls.</span></span></label>
          <label htmlFor={`open-${phone.key}`} className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-data-checked:border-primary/35 has-data-checked:bg-primary/[.035]"><Checkbox id={`open-${phone.key}`} checked={phone.canOpen} onCheckedChange={(checked) => update(phone.key, { canOpen: checked })} disabled={disabled} className="mt-0.5" /><ShieldCheck className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="block text-sm font-medium">Open gate</span><span className="block text-xs leading-relaxed text-muted-foreground">Press 1.</span></span></label>
          <label htmlFor={`hold-${phone.key}`} className="flex cursor-pointer items-start gap-2.5 rounded-xl border p-3 transition-colors has-data-checked:border-primary/35 has-data-checked:bg-primary/[.035]"><Checkbox id={`hold-${phone.key}`} checked={phone.canHoldOpen} onCheckedChange={(checked) => update(phone.key, { canHoldOpen: checked })} disabled={disabled} className="mt-0.5" /><Clock3 className="mt-0.5 size-4 shrink-0 text-muted-foreground" /><span><span className="block text-sm font-medium">30-min hold</span><span className="block text-xs leading-relaxed text-muted-foreground">Press 2.</span></span></label>
        </div>
      </div>;
    })}</div>
  </section>;
}
