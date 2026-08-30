"use client";

import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { AccessActivityItem } from "@/lib/access-history";
import { formatGateyDateTime } from "@/lib/date-time";

const actorKindLabels: Record<AccessActivityItem["actorKind"], string> = {
  person: "People",
  service_account: "Service accounts",
  managed_code: "Managed codes",
  visitor: "Visitors",
  other: "Other / unassigned",
};

function formatDate(value: string) {
  return formatGateyDateTime(value, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function methodLabel(value: string) {
  const labels: Record<string, string> = {
    PIN_CODE: "PIN",
    REMOTE_THROUGH_UAH: "Remote",
    LICENSEPLATE: "License plate",
    CALL: "Call",
    MOBILE_BUTTON: "Mobile",
    MOBILE_TAP: "Mobile tap",
    REX: "Exit sensor",
  };
  return labels[value] || value.toLowerCase().replaceAll("_", " ") || "Unknown";
}

function actorKey(event: AccessActivityItem) {
  return event.actorId || `name:${event.actorName}`;
}

export function AccessActivityTable({ events }: { events: AccessActivityItem[] }) {
  const [query, setQuery] = useState("");
  const [hiddenKinds, setHiddenKinds] = useState<AccessActivityItem["actorKind"][]>([]);
  const [hiddenActors, setHiddenActors] = useState<string[]>([]);

  const actors = useMemo(() => {
    const unique = new Map<string, string>();
    for (const event of events) unique.set(actorKey(event), event.actorName);
    return [...unique].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [events]);

  const visibleEvents = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase();
    return events.filter((event) => {
      if (hiddenKinds.includes(event.actorKind) || hiddenActors.includes(actorKey(event))) return false;
      if (!normalizedQuery) return true;
      return [event.actorName, event.householdName, event.displayMessage, event.reason, methodLabel(event.credentialProvider)]
        .some((value) => value?.toLocaleLowerCase().includes(normalizedQuery));
    });
  }, [events, hiddenActors, hiddenKinds, query]);

  const hasFilters = Boolean(query || hiddenKinds.length || hiddenActors.length);

  function toggleKind(kind: AccessActivityItem["actorKind"], checked: boolean) {
    setHiddenKinds((current) => checked ? [...current, kind] : current.filter((item) => item !== kind));
  }

  function clearFilters() {
    setQuery("");
    setHiddenKinds([]);
    setHiddenActors([]);
  }

  return <div className="grid gap-3">
    <section className="rounded-xl border bg-card p-4" aria-label="Access activity filters">
      <div className="grid gap-3 lg:grid-cols-[minmax(16rem,1fr)_minmax(14rem,20rem)_auto] lg:items-end">
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="access-search">Search activity
          <span className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" /><Input id="access-search" className="pl-8" type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name, household, method, or details" /></span>
        </label>
        <label className="grid gap-1.5 text-sm font-medium" htmlFor="exclude-access-actor">Exclude a person or code
          <select id="exclude-access-actor" value="" onChange={(event) => { if (event.target.value) setHiddenActors((current) => [...new Set([...current, event.target.value])]); }} className="h-8 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50">
            <option value="">Choose someone…</option>
            {actors.filter((actor) => !hiddenActors.includes(actor.id)).map((actor) => <option key={actor.id} value={actor.id}>{actor.name}</option>)}
          </select>
        </label>
        <Button type="button" variant="outline" disabled={!hasFilters} onClick={clearFilters}>Clear filters</Button>
      </div>
      <fieldset className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2">
        <legend className="float-left mr-5 text-sm font-medium">Hide types</legend>
        {(Object.entries(actorKindLabels) as Array<[AccessActivityItem["actorKind"], string]>).map(([kind, label]) => <label key={kind} className="flex cursor-pointer items-center gap-2 text-sm text-muted-foreground"><Checkbox checked={hiddenKinds.includes(kind)} onCheckedChange={(checked) => toggleKind(kind, checked === true)} />{label}</label>)}
      </fieldset>
      {hiddenActors.length ? <div className="mt-4 flex flex-wrap items-center gap-2"><span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Excluded</span>{hiddenActors.map((id) => <span key={id} className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-1 text-xs font-medium">{actors.find((actor) => actor.id === id)?.name || "Unknown"}<button type="button" className="rounded-full p-0.5 hover:bg-background" onClick={() => setHiddenActors((current) => current.filter((item) => item !== id))} aria-label={`Show ${actors.find((actor) => actor.id === id)?.name || "actor"}`}><X className="size-3" /></button></span>)}</div> : null}
    </section>
    <div className="flex items-center justify-between gap-4 px-1 text-sm text-muted-foreground"><span>Showing {visibleEvents.length} of {events.length} events</span>{hasFilters && !visibleEvents.length ? <span>Try clearing one or more filters.</span> : null}</div>
    <div className="admin-table-shell"><Table><TableHeader><TableRow><TableHead sortKey="when">When</TableHead><TableHead sortKey="actor">Who or code</TableHead><TableHead sortKey="household">Household</TableHead><TableHead sortKey="method">Method</TableHead><TableHead sortKey="result">Result</TableHead><TableHead sortKey="details">Details</TableHead></TableRow></TableHeader><TableBody>
      {visibleEvents.map((event) => <TableRow key={event.id} sortValues={{ when: event.occurredAt, actor: event.actorName, household: event.householdName, method: methodLabel(event.credentialProvider), result: event.result, details: event.displayMessage || event.reason || event.doorName }}><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(event.occurredAt)}</TableCell><TableCell><strong>{event.actorName}</strong>{event.actorKind === "service_account" ? <span className="mt-1 block text-xs text-muted-foreground">Service account</span> : !event.attributable ? <span className="mt-1 block text-xs text-amber-700">Not yet assigned</span> : null}</TableCell><TableCell>{event.householdName || "No household"}</TableCell><TableCell className="capitalize">{methodLabel(event.credentialProvider)}</TableCell><TableCell><span className={event.result === "ACCESS" ? "managed-badge" : "existing-badge"}>{event.result === "ACCESS" ? "Granted" : event.result.toLowerCase()}</span></TableCell><TableCell className="text-sm text-muted-foreground">{event.displayMessage || event.reason || event.doorName}</TableCell></TableRow>)}
      {!visibleEvents.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">{events.length ? "No access activity matches these filters." : "No UniFi access history has been synchronized yet."}</TableCell></TableRow> : null}
    </TableBody></Table></div>
  </div>;
}
