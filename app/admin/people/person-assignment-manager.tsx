"use client";

import { FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { AssignableAccount } from "@/lib/admin-assignments";

type HouseholdOption = { id: string; name: string };

export function PersonAssignmentManager({ personName, personId, households, accounts }: {
  personName: string;
  personId: string;
  households: HouseholdOption[];
  accounts: AssignableAccount[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [householdId, setHouseholdId] = useState(households[0]?.id ?? "");
  const [accountId, setAccountId] = useState("new");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string>();
  const [welcome, setWelcome] = useState<string>();
  const eligibleAccounts = useMemo(() => accounts.filter((account) => !account.householdId || account.householdId === householdId), [accounts, householdId]);

  async function assign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/people/${encodeURIComponent(personId)}/assignment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId,
          ...(accountId === "new" ? { name: form.get("name"), email: form.get("email"), username: form.get("username") } : { accountId }),
        }),
      });
      const result = await response.json() as { error?: string; welcomeMessage?: string };
      if (!response.ok) throw new Error(result.error || "Could not assign this person.");
      if (result.welcomeMessage) {
        setWelcome(result.welcomeMessage);
      } else {
        setOpen(false);
        router.refresh();
      }
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not assign this person.");
    } finally {
      setWorking(false);
    }
  }

  async function copyWelcome() {
    if (welcome) await navigator.clipboard.writeText(welcome);
  }

  return <>
    <Button variant="outline" onClick={() => setOpen(true)} disabled={!households.length}>Assign</Button>
    {open ? <div className="dialog-backdrop" role="presentation">
      <section className="dialog admin-assignment-dialog" role="dialog" aria-modal="true" aria-labelledby={`assign-${personId}`}>
        <p className="eyebrow">UniFi person</p>
        <h2 id={`assign-${personId}`}>Assign {personName}</h2>
        {welcome ? <>
          <p>The person is assigned. Copy this welcome message now—the temporary password is only shown here.</p>
          <textarea className="admin-welcome-message" value={welcome} readOnly aria-label="Welcome message" />
          <div className="dialog-actions"><Button size="lg" onClick={() => void copyWelcome()}>Copy message</Button><Button size="lg" variant="outline" onClick={() => { setWelcome(undefined); setOpen(false); router.refresh(); }}>Done</Button></div>
        </> : <form className="admin-assignment-form" onSubmit={assign}>
          <label>Household<select value={householdId} onChange={(event) => { setHouseholdId(event.target.value); setAccountId("new"); }} required>{households.map((household) => <option key={household.id} value={household.id}>{household.name}</option>)}</select><span className="font-normal text-muted-foreground">Need another one? <Link href="/admin/households" className="font-medium text-foreground underline underline-offset-4">Create a household first.</Link></span></label>
          <label>Gatey account<select value={accountId} onChange={(event) => setAccountId(event.target.value)}><option value="new">Create a Gatey account</option>{eligibleAccounts.map((account) => <option key={account.id} value={account.id}>{account.name} · {account.email}{account.householdName ? ` · ${account.householdName}` : ""}</option>)}</select></label>
          {accountId === "new" ? <div className="admin-assignment-fields"><label>Name<input name="name" defaultValue={personName} required /></label><label>Email<input name="email" type="email" required placeholder="person@example.com" /></label><label>Username<input name="username" required minLength={3} autoCapitalize="none" placeholder="username" /></label></div> : null}
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <div className="dialog-actions"><Button size="lg" type="submit" disabled={working || !householdId}>{working ? "Assigning…" : "Assign person"}</Button><Button size="lg" type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button></div>
        </form>}
      </section>
    </div> : null}
  </>;
}
