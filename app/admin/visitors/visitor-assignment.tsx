"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function VisitorAssignment({ visitorId, initialHouseholdId, households }: { visitorId: string; initialHouseholdId?: string; households: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState(initialHouseholdId ?? "");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function save() {
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/visitors/${encodeURIComponent(visitorId)}/assignment`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ householdId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not assign this visitor.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not assign this visitor.");
    } finally { setWorking(false); }
  }

  return <div className="grid min-w-48 gap-2"><select className="admin-compact-select" value={householdId} onChange={(event) => setHouseholdId(event.target.value)} aria-label="Visitor household"><option value="">Choose household…</option>{households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select><Button variant={initialHouseholdId ? "outline" : "default"} onClick={() => void save()} disabled={!householdId || working || householdId === initialHouseholdId}>{working ? "Saving…" : initialHouseholdId ? "Save assignment" : "Assign"}</Button>{error ? <span className="text-xs font-medium text-destructive">{error}</span> : null}</div>;
}
