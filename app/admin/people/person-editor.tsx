"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Pencil, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

type HouseholdOption = { id: string; name: string };

export function PersonEditor({ personId, accountName, email, username, householdId, households }: {
  personId: string;
  accountName: string;
  email: string;
  username: string | null;
  householdId: string | null;
  households: HouseholdOption[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  function close() {
    if (working) return;
    setOpen(false);
    setError(undefined);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/people/${encodeURIComponent(personId)}/profile`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), email: form.get("email"), householdId: form.get("householdId") }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not update this person.");
      setOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update this person.");
    } finally { setWorking(false); }
  }

  return <Dialog open={open} onOpenChange={(nextOpen) => nextOpen ? setOpen(true) : close()}>
    <DialogTrigger render={<Button variant="outline" />}><Pencil data-icon="inline-start" />Edit person</DialogTrigger>
    <DialogContent showCloseButton={!working}>
      <DialogHeader>
        <span className="text-xs font-semibold tracking-[.16em] text-muted-foreground uppercase">Gatey account</span>
        <DialogTitle>Edit {accountName}</DialogTitle>
        <DialogDescription>Update this resident’s Gatey identity or move them to another household. Their phone access, UniFi link, and history will stay attached.</DialogDescription>
      </DialogHeader>
      <form className="grid gap-5" onSubmit={save}>
        <div className="grid gap-4">
          <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor={`person-name-${personId}`}>Name</label><Input id={`person-name-${personId}`} name="name" defaultValue={accountName} autoComplete="name" required className="h-10" /></div>
          <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor={`person-email-${personId}`}>Email address</label><Input id={`person-email-${personId}`} name="email" type="email" defaultValue={email} autoComplete="email" required className="h-10" /></div>
          <div className="grid gap-1.5"><label className="text-sm font-medium" htmlFor={`person-household-${personId}`}>Household</label><select id={`person-household-${personId}`} name="householdId" defaultValue={householdId || ""} required className="h-10 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"><option value="" disabled>Choose a household…</option>{households.map((household) => <option value={household.id} key={household.id}>{household.name}</option>)}</select></div>
          {username ? <div className="flex items-center gap-3 rounded-xl border bg-muted/30 p-3"><div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-background text-muted-foreground"><UserRound className="size-4" /></div><div><span className="block text-sm font-medium">Username: {username}</span><span className="block text-xs text-muted-foreground">Usernames are permanent sign-in identifiers.</span></div></div> : null}
        </div>
        {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={close} disabled={working}>Cancel</Button><Button type="submit" disabled={working}><Pencil data-icon="inline-start" />{working ? "Saving…" : "Save changes"}</Button></DialogFooter>
      </form>
    </DialogContent>
  </Dialog>;
}
