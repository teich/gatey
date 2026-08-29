"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, RotateCcw, ServerCog } from "lucide-react";
import { Button } from "@/components/ui/button";

type ServicePerson = { id: string; name: string; status: string };

async function changeClassification(personId: string, method: "PUT" | "DELETE") {
  const response = await fetch(`/api/admin/people/${encodeURIComponent(personId)}/service-account`, { method });
  if (!response.ok) {
    const result = await response.json() as { error?: string };
    throw new Error(result.error || "Could not update this service account.");
  }
}

export function MarkServiceAccountButton({ personId, personName }: { personId: string; personName: string }) {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function mark() {
    if (!window.confirm(`Mark ${personName} as a service account? It will move out of the resident list and no longer count as unassigned.`)) return;
    setWorking(true);
    setError(undefined);
    try {
      await changeClassification(personId, "PUT");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not classify this service account.");
    } finally { setWorking(false); }
  }

  return <div className="grid gap-1"><Button variant="ghost" onClick={() => void mark()} disabled={working}><ServerCog data-icon="inline-start" />{working ? "Moving…" : "Service account"}</Button>{error ? <span className="max-w-44 text-xs font-medium text-destructive">{error}</span> : null}</div>;
}

export function ServiceAccountsSection({ people }: { people: ServicePerson[] }) {
  const router = useRouter();
  const [workingId, setWorkingId] = useState<string>();
  const [error, setError] = useState<string>();

  async function restore(person: ServicePerson) {
    setWorkingId(person.id);
    setError(undefined);
    try {
      await changeClassification(person.id, "DELETE");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not restore this person.");
    } finally { setWorkingId(undefined); }
  }

  if (!people.length) return null;
  return <details className="group overflow-hidden rounded-xl border bg-card">
    <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 select-none [&::-webkit-details-marker]:hidden">
      <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground"><ServerCog className="size-4" /></span>
      <span className="min-w-0 flex-1"><strong className="block text-sm">Service accounts</strong><span className="block text-xs text-muted-foreground">{people.length} intentionally excluded from resident management</span></span>
      <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" />
    </summary>
    <div className="border-t">
      {people.map((person) => <div className="flex flex-wrap items-center gap-3 border-b px-4 py-3 last:border-b-0" key={person.id}>
        <div className="min-w-0 flex-1"><strong className="block text-sm">{person.name}</strong><span className="text-xs capitalize text-muted-foreground">UniFi status: {person.status.toLowerCase().replaceAll("_", " ")}</span></div>
        <Button size="sm" variant="outline" onClick={() => void restore(person)} disabled={Boolean(workingId)}><RotateCcw data-icon="inline-start" />{workingId === person.id ? "Restoring…" : "Restore to people"}</Button>
      </div>)}
      {error ? <p className="border-t bg-destructive/5 px-4 py-2 text-sm font-medium text-destructive" role="alert">{error}</p> : null}
    </div>
  </details>;
}
