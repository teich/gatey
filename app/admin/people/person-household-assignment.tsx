"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function PersonHouseholdAssignment({ personId, households }: { personId: string; households: Array<{ id: string; name: string }> }) {
  const router = useRouter();
  const [householdId, setHouseholdId] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();

  async function assign() {
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/people/${encodeURIComponent(personId)}/assignment`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ householdId }) });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not assign this person.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not assign this person.");
    } finally { setWorking(false); }
  }

  return <div className="grid min-w-48 gap-2"><select className="admin-compact-select" value={householdId} onChange={(event) => setHouseholdId(event.target.value)} aria-label="Person household"><option value="">Choose household…</option>{households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select><Button onClick={() => void assign()} disabled={!householdId || working}>{working ? "Assigning…" : "Assign household"}</Button>{error ? <span className="text-xs font-medium text-destructive">{error}</span> : null}</div>;
}
