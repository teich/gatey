"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Save, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { PersonPhoneEditor, type EditablePhone } from "@/app/admin/people/person-phone-manager";
import type { PhoneAccess } from "@/lib/phone-access";

type HouseholdOption = { id: string; name: string };

function editablePhones(phones: PhoneAccess[]): EditablePhone[] {
  return phones.map(({ id, phoneE164, label, notes, enabled, canOpen, canHoldOpen }) => ({ key: id, id, phoneE164, label, notes, enabled, canOpen, canHoldOpen }));
}

export function PersonEditor({ personId, accountName, email, username, householdId, households, phones }: {
  personId: string;
  userId: string;
  accountName: string;
  email: string | null;
  username: string | null;
  householdId: string | null;
  households: HouseholdOption[];
  phones: PhoneAccess[];
}) {
  const router = useRouter();
  const initialPhones = useMemo(() => editablePhones(phones), [phones]);
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [name, setName] = useState(accountName);
  const [draftEmail, setDraftEmail] = useState(email || "");
  const [draftHouseholdId, setDraftHouseholdId] = useState(householdId || "");
  const [draftPhones, setDraftPhones] = useState<EditablePhone[]>(initialPhones);

  function resetDraft() {
    setName(accountName);
    setDraftEmail(email || "");
    setDraftHouseholdId(householdId || "");
    setDraftPhones(initialPhones);
    setError(undefined);
  }

  function show() {
    resetDraft();
    setOpen(true);
  }

  function close() {
    if (working) return;
    setOpen(false);
    resetDraft();
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/people/${encodeURIComponent(personId)}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email: draftEmail,
          householdId: draftHouseholdId,
          phones: draftPhones.map(({ id, phoneE164, label, notes, enabled, canOpen, canHoldOpen }) => ({ id, phoneE164, label, notes, enabled, canOpen, canHoldOpen })),
        }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update this person.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this person.");
    } finally { setWorking(false); }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? show() : close()}>
    <DialogTrigger render={<Button variant="outline" />}><Pencil data-icon="inline-start" />Edit person</DialogTrigger>
    <DialogContent className="sm:max-w-2xl" showCloseButton={!working}>
      <DialogHeader>
        <span className="text-xs font-semibold tracking-[.16em] text-muted-foreground uppercase">Gatey account</span>
        <DialogTitle>Edit {accountName}</DialogTitle>
        <DialogDescription>Update the resident, household, and call-to-open access together, then save once.</DialogDescription>
      </DialogHeader>
      <form className="grid gap-5" onSubmit={save}>
        <div><h3 className="text-sm font-semibold">Account details</h3><p className="text-xs text-muted-foreground">Used for sign-in, household access, and activity attribution.</p></div>
        <div className="grid gap-4">
          <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor={`person-name-${personId}`}>Name</label><Input id={`person-name-${personId}`} value={name} onChange={(event) => setName(event.target.value)} autoComplete="name" required disabled={working} className="h-10" /></div>
          <div className="grid gap-1.5"><div className="flex items-baseline justify-between gap-3"><label className="text-sm font-medium" htmlFor={`person-email-${personId}`}>Email address</label><span className="text-xs text-muted-foreground">Optional</span></div><Input id={`person-email-${personId}`} type="email" value={draftEmail} onChange={(event) => setDraftEmail(event.target.value)} autoComplete="email" disabled={working} className="h-10" /><p className="text-xs text-muted-foreground">Leave blank for an admin-managed resident who does not use Gatey.</p></div>
          <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor={`person-household-${personId}`}>Household</label><select id={`person-household-${personId}`} value={draftHouseholdId} onChange={(event) => setDraftHouseholdId(event.target.value)} required disabled={working} className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50"><option value="" disabled>Choose a household…</option>{households.map((household) => <option value={household.id} key={household.id}>{household.name}</option>)}</select></div>
          {username ? <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground"><UserRound className="size-4" /></div><div><span className="block text-sm font-medium">Username: {username}</span><span className="block text-xs text-muted-foreground">Usernames are permanent sign-in identifiers.</span></div></div> : null}
        </div>
        <Separator />
        <PersonPhoneEditor phones={draftPhones} onChange={setDraftPhones} disabled={working} />
        {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
        <DialogFooter className="border-t pt-5"><Button type="button" variant="outline" onClick={close} disabled={working}>Cancel</Button><Button type="submit" disabled={working}><Save data-icon="inline-start" />{working ? "Saving changes…" : "Save changes"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
