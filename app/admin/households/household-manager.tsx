"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle, HousePlus, Pencil, Search, Trash2, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { HouseholdAdminRecord } from "@/lib/households";

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error || "Could not save the household.");
  return body;
}

function peopleLabel(count: number) {
  return `${count} ${count === 1 ? "person" : "people"}`;
}

function HouseholdFields({ prefix, name, slug, slugOptional = false }: { prefix: string; name?: string; slug?: string; slugOptional?: boolean }) {
  return <div className="grid gap-4">
    <div className="grid gap-1.5">
      <label className="text-sm font-medium" htmlFor={`${prefix}-name`}>Household name</label>
      <Input id={`${prefix}-name`} name="name" defaultValue={name} placeholder="Smith household" required className="h-10" autoFocus />
      <p className="text-xs text-muted-foreground">The name residents and administrators will recognize.</p>
    </div>
    <div className="grid gap-1.5">
      <div className="flex items-baseline justify-between gap-3"><label className="text-sm font-medium" htmlFor={`${prefix}-slug`}>Short name</label>{slugOptional ? <span className="text-xs text-muted-foreground">Optional</span> : null}</div>
      <Input id={`${prefix}-slug`} name="slug" defaultValue={slug} placeholder="smith-household" required={!slugOptional} className="h-10 font-mono" spellCheck={false} />
      <p className="text-xs text-muted-foreground">A unique, URL-safe identifier. We’ll make one from the household name if left blank.</p>
    </div>
  </div>;
}

export function HouseholdManager({ households }: { households: HouseholdAdminRecord[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<HouseholdAdminRecord>();
  const [deleting, setDeleting] = useState<HouseholdAdminRecord>();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  const visibleHouseholds = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase();
    if (!normalized) return households;
    return households.filter((household) => [household.name, household.slug].some((value) => value.toLocaleLowerCase().includes(normalized)));
  }, [households, query]);

  const residentCount = households.reduce((total, household) => total + household.members.length, 0);
  const visitorCount = households.reduce((total, household) => total + household.visitorCount, 0);
  const emptyCount = households.filter((household) => !household.members.length).length;

  function closeDialogs() {
    if (working) return;
    setCreateOpen(false);
    setEditing(undefined);
    setDeleting(undefined);
    setError(undefined);
  }

  async function createHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setError(undefined);
    try {
      await requestJson("/api/admin/households", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), slug: form.get("slug") }),
      });
      setCreateOpen(false);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the household.");
    } finally {
      setWorking(false);
    }
  }

  async function updateHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setError(undefined);
    try {
      await requestJson(`/api/admin/households/${encodeURIComponent(editing.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), slug: form.get("slug") }),
      });
      setEditing(undefined);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the household.");
    } finally {
      setWorking(false);
    }
  }

  async function deleteHousehold() {
    if (!deleting) return;
    setWorking(true);
    setError(undefined);
    try {
      await requestJson(`/api/admin/households/${encodeURIComponent(deleting.id)}`, { method: "DELETE" });
      setDeleting(undefined);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the household.");
    } finally {
      setWorking(false);
    }
  }

  function beginEdit(household: HouseholdAdminRecord) {
    setError(undefined);
    setEditing(household);
  }

  function beginDelete() {
    if (!editing) return;
    setDeleting(editing);
    setEditing(undefined);
    setError(undefined);
  }

  return <>
    <section className="grid gap-3 sm:grid-cols-3" aria-label="Household totals">
      <div className="rounded-xl border bg-card p-4"><span className="text-sm text-muted-foreground">Households</span><strong className="mt-1 block text-2xl font-semibold tracking-tight">{households.length}</strong></div>
      <div className="rounded-xl border bg-card p-4"><span className="text-sm text-muted-foreground">People assigned</span><strong className="mt-1 block text-2xl font-semibold tracking-tight">{residentCount}</strong></div>
      <div className="rounded-xl border bg-card p-4"><span className="text-sm text-muted-foreground">Visitor passes</span><strong className="mt-1 block text-2xl font-semibold tracking-tight">{visitorCount}</strong></div>
    </section>

    <section className="grid gap-3" aria-labelledby="household-list-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div><h2 id="household-list-heading" className="text-lg font-semibold tracking-tight">All households</h2><p className="text-sm text-muted-foreground">{emptyCount ? `${emptyCount} ${emptyCount === 1 ? "household has" : "households have"} no people assigned.` : "Every household has at least one person assigned."}</p></div>
        <Button size="lg" type="button" onClick={() => { setError(undefined); setCreateOpen(true); }}><HousePlus data-icon="inline-start" />Add household</Button>
      </div>
      <div className="flex flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between">
        <label className="relative block w-full sm:max-w-sm" htmlFor="household-search"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="household-search" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search name or short name" className="pl-8" /><span className="sr-only">Search households</span></label>
        <span className="px-1 text-sm text-muted-foreground" aria-live="polite">Showing {visibleHouseholds.length} of {households.length}</span>
      </div>
      <div className="admin-table-shell">
        <Table>
          <TableHeader><TableRow><TableHead>Household</TableHead><TableHead>Short name</TableHead><TableHead>People</TableHead><TableHead>Visitor passes</TableHead><TableHead>Status</TableHead><TableHead className="w-0 text-right">Actions</TableHead></TableRow></TableHeader>
          <TableBody>
            {visibleHouseholds.map((household) => {
              const unlinkedCount = household.members.filter((member) => !member.controllerUserId).length;
              return <TableRow key={household.id}>
                <TableCell><strong className="block font-medium">{household.name}</strong>{household.id === "oren-home" ? <span className="mt-1 block text-xs text-muted-foreground">Initial household</span> : null}</TableCell>
                <TableCell><code className="rounded-md bg-muted px-2 py-1 text-xs">{household.slug}</code></TableCell>
                <TableCell><span className="inline-flex items-center gap-1.5 font-medium"><UsersRound className="size-4 text-muted-foreground" />{peopleLabel(household.members.length)}</span></TableCell>
                <TableCell>{household.visitorCount}</TableCell>
                <TableCell>{!household.members.length ? <span className="existing-badge">No people</span> : unlinkedCount ? <span className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700"><AlertCircle className="size-4" />{unlinkedCount === 1 ? "Needs a UniFi link" : `${unlinkedCount} need UniFi links`}</span> : <span className="managed-badge">Set up</span>}</TableCell>
                <TableCell className="text-right"><Button type="button" variant="outline" onClick={() => beginEdit(household)}><Pencil data-icon="inline-start" />Edit</Button></TableCell>
              </TableRow>;
            })}
            {!visibleHouseholds.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{households.length ? "No households match that search." : "No households have been created yet."}</TableCell></TableRow> : null}
          </TableBody>
        </Table>
      </div>
    </section>

    <Dialog open={createOpen} onOpenChange={(open) => open ? setCreateOpen(true) : closeDialogs()}>
      <DialogContent showCloseButton={!working}>
        <DialogHeader><span className="text-xs font-semibold tracking-[.16em] text-muted-foreground uppercase">New household</span><DialogTitle>Add a household</DialogTitle><DialogDescription>Create the household record first. Assign its residents from the People page afterward.</DialogDescription></DialogHeader>
        <form className="grid gap-5" onSubmit={createHousehold}>
          <HouseholdFields prefix="create-household" slugOptional />
          {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={closeDialogs} disabled={working}>Cancel</Button><Button type="submit" disabled={working}><HousePlus data-icon="inline-start" />{working ? "Creating…" : "Add household"}</Button></DialogFooter>
        </form>
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(editing)} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
      <DialogContent showCloseButton={!working}>
        <DialogHeader><span className="text-xs font-semibold tracking-[.16em] text-muted-foreground uppercase">Household details</span><DialogTitle>Edit {editing?.name}</DialogTitle><DialogDescription>Change the household’s display name or short name. People are managed separately.</DialogDescription></DialogHeader>
        {editing ? <form className="grid gap-5" onSubmit={updateHousehold}>
          <HouseholdFields key={editing.id} prefix={`edit-household-${editing.id}`} name={editing.name} slug={editing.slug} />
          {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={closeDialogs} disabled={working}>Cancel</Button><Button type="submit" disabled={working}><Pencil data-icon="inline-start" />{working ? "Saving…" : "Save changes"}</Button></DialogFooter>
        </form> : null}
        {editing?.id !== "oren-home" ? <><Separator /><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><h3 className="text-sm font-semibold">Delete household</h3><p className="text-xs text-muted-foreground">Only empty households without Gatey records can be deleted.</p></div><Button type="button" variant="destructive" onClick={beginDelete} disabled={working}><Trash2 data-icon="inline-start" />Delete</Button></div></> : <div className="rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">The initial household cannot be deleted.</div>}
      </DialogContent>
    </Dialog>

    <Dialog open={Boolean(deleting)} onOpenChange={(open) => { if (!open) closeDialogs(); }}>
      <DialogContent showCloseButton={!working}>
        <DialogHeader><span className="text-xs font-semibold tracking-[.16em] text-destructive uppercase">Permanent action</span><DialogTitle>Delete {deleting?.name}?</DialogTitle><DialogDescription>This removes the household permanently. It will only succeed if there are no people or Gatey access records attached to it.</DialogDescription></DialogHeader>
        {error ? <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
        <DialogFooter><Button type="button" variant="outline" onClick={closeDialogs} disabled={working}>Cancel</Button><Button type="button" variant="destructive" onClick={() => void deleteHousehold()} disabled={working}><Trash2 data-icon="inline-start" />{working ? "Deleting…" : "Delete household"}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  </>;
}
