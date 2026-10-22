"use client";

import { FormEvent, useId, useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import type { AccessPolicyOption } from "@/lib/unifi-access";

type HouseholdOption = { id: string; name: string };

// Also exposed on existing people so interrupted access setup can be completed
// after leaving the creation dialog, without registering another UniFi user.
export function AddPerson({
  households = [],
  householdId,
  person,
}: {
  households?: HouseholdOption[];
  householdId?: string;
  person?: { id: string; name: string; policyNames: string[] };
}) {
  const router = useRouter();
  const fieldId = useId();
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [policies, setPolicies] = useState<AccessPolicyOption[]>([]);
  const [policyId, setPolicyId] = useState("");
  const [pin, setPin] = useState("");
  const [createdId, setCreatedId] = useState<string>();
  const [welcome, setWelcome] = useState<string>();
  const [error, setError] = useState<string>();
  const [recovery, setRecovery] = useState(false);
  const [done, setDone] = useState(false);
  const [copied, setCopied] = useState(false);

  async function loadPolicies() {
    setLoading(true);
    setError(undefined);
    try {
      const response = await fetch("/api/admin/people", { cache: "no-store" });
      const result = (await response.json()) as { policies?: AccessPolicyOption[]; error?: string };
      if (!response.ok || !result.policies) throw new Error(result.error || "Could not load access policies.");
      setPolicies(result.policies);
      if (!result.policies.length)
        setError("No access policies are available. Create a resident gate policy in UniFi first.");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not load access policies.");
    } finally {
      setLoading(false);
    }
  }

  function changeOpen(nextOpen: boolean) {
    if (working) return;
    setOpen(nextOpen);
    if (nextOpen) {
      setCreatedId(undefined);
      setWelcome(undefined);
      setRecovery(false);
      setDone(false);
      setCopied(false);
      setPin("");
      setPolicyId("");
      setPolicies([]);
      void loadPolicies();
    } else {
      router.refresh();
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(true);
    setError(undefined);
    let targetId = person?.id || createdId;
    try {
      if (!targetId) {
        let response: Response;
        let result: { personId?: string; welcomeMessage?: string; error?: string; needsRecovery?: boolean };
        try {
          response = await fetch("/api/admin/people", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              firstName: form.get("firstName"),
              lastName: form.get("lastName"),
              username: form.get("username"),
              email: form.get("email"),
              householdId: form.get("householdId"),
              phone: form.get("phone"),
              policyId,
            }),
          });
          result = await response.json();
        } catch {
          setRecovery(true);
          throw new Error(
            "The connection was interrupted and creation may have succeeded. Close this dialog and check People before adding anyone again. Use Reset login if the login details were lost.",
          );
        }
        if (result.welcomeMessage) setWelcome(result.welcomeMessage);
        if (result.needsRecovery) setRecovery(true);
        if (!response.ok || !result.personId) throw new Error(result.error || "Could not create this person.");
        targetId = result.personId;
        setCreatedId(targetId);
      }
      const response = await fetch(`/api/admin/people/${encodeURIComponent(targetId)}/access`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ policyId, pin }),
      });
      const result = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not save access.");
      setDone(true);
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not finish setup. Retry access setup to continue.");
    } finally {
      setWorking(false);
    }
  }

  async function copyWelcome() {
    try {
      await navigator.clipboard.writeText(welcome || "");
      setCopied(true);
    } catch {
      setError("Could not copy. Select and copy the login details below.");
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogTrigger render={<Button variant="outline" disabled={!person && !households.length} />}>
        {person ? <KeyRound data-icon="inline-start" /> : <UserPlus data-icon="inline-start" />}
        {person ? "Gate access" : "Add person"}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl" showCloseButton={!working}>
        <DialogHeader>
          <DialogTitle>
            {done
              ? person
                ? "Access saved"
                : "Person added"
              : person
                ? `Gate access for ${person.name}`
                : "Add a person"}
          </DialogTitle>
          <DialogDescription>
            {person
              ? "Choose the UniFi policy that controls this person’s doors and schedule. Saving replaces their current policy assignments."
              : "Create a UniFi person and a Gatey account in one place, with access to their household."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          {!person && !done ? (
            <fieldset disabled={working || Boolean(createdId) || recovery} className="grid gap-4 disabled:opacity-60">
              <div className="grid grid-cols-2 gap-3">
                <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${fieldId}-first`}>
                  First name
                  <Input id={`${fieldId}-first`} name="firstName" required maxLength={40} autoComplete="given-name" />
                </label>
                <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${fieldId}-last`}>
                  Last name
                  <Input id={`${fieldId}-last`} name="lastName" required maxLength={40} autoComplete="family-name" />
                </label>
              </div>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${fieldId}-household`}>
                Household
                <select
                  className="h-10 rounded-lg border border-input bg-background px-2.5"
                  id={`${fieldId}-household`}
                  name="householdId"
                  defaultValue={householdId || ""}
                  required
                >
                  <option value="" disabled>
                    Choose a household…
                  </option>
                  {households.map((household) => (
                    <option key={household.id} value={household.id}>
                      {household.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${fieldId}-username`}>
                Username
                <Input
                  id={`${fieldId}-username`}
                  name="username"
                  required
                  minLength={3}
                  maxLength={64}
                  pattern="[A-Za-z0-9_.]{3,64}"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  autoComplete="off"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  Permanent sign-in name. Letters, numbers, underscores, and periods.
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${fieldId}-email`}>
                Email (optional)
                <Input id={`${fieldId}-email`} name="email" type="email" autoComplete="email" />
                <span className="text-xs font-normal text-muted-foreground">
                  An email is not needed to sign in. You can copy and share the login details.
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${fieldId}-phone`}>
                Call-to-open phone (optional)
                <Input id={`${fieldId}-phone`} name="phone" type="tel" placeholder="+17075551111" autoComplete="tel" />
                <span className="text-xs font-normal text-muted-foreground">
                  Include the country code. Enables opening the gate, without 30-minute hold permission.
                </span>
              </label>
            </fieldset>
          ) : null}
          {createdId && !done ? (
            <p className="rounded-lg bg-muted p-3 text-sm">
              The person and household membership are saved. Finish access setup below; retrying will use the same
              person.
            </p>
          ) : null}
          {!done && !recovery ? (
            <fieldset disabled={working || loading} className="grid gap-4">
              {person ? (
                <p className="text-xs text-muted-foreground">
                  Current policies: {person.policyNames.join(", ") || "None"}
                </p>
              ) : null}
              <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${fieldId}-policy`}>
                Access policy
                <select
                  id={`${fieldId}-policy`}
                  value={policyId}
                  onChange={(event) => setPolicyId(event.target.value)}
                  required
                  className="h-10 rounded-lg border border-input bg-background px-2.5"
                >
                  <option value="" disabled>
                    {loading ? "Loading policies…" : "Choose a resident gate policy…"}
                  </option>
                  {policies.map((policy) => (
                    <option key={policy.id} value={policy.id}>
                      {policy.name}
                    </option>
                  ))}
                </select>
                <span className="text-xs font-normal text-muted-foreground">
                  Choose the policy used by residents. Its doors and schedule apply to this person.
                </span>
              </label>
              <label className="grid gap-1.5 text-sm font-medium" htmlFor={`${fieldId}-pin`}>
                {person ? "New personal PIN (optional)" : "Personal PIN (optional)"}
                <Input
                  id={`${fieldId}-pin`}
                  value={pin}
                  onChange={(event) => setPin(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  inputMode="numeric"
                  autoComplete="off"
                  pattern="[0-9]{4,8}"
                  placeholder="4–8 digits"
                />
                <span className="text-xs font-normal text-muted-foreground">
                  {person
                    ? "Leave blank to keep the current PIN."
                    : "Leave blank to use the household code or Gatey app."}
                </span>
              </label>
            </fieldset>
          ) : null}
          {done ? (
            <p className="text-sm">
              {person
                ? "The selected access policy is assigned."
                : "Their UniFi person, Gatey account, household, and access policy are ready."}
              {pin ? " The personal PIN is saved." : ""}
            </p>
          ) : null}
          {welcome ? (
            <div className="grid gap-2">
              <label className="text-sm font-medium" htmlFor={`${fieldId}-welcome`}>
                Login details
              </label>
              <p className="text-xs text-muted-foreground">
                Copy these before closing. Share them when setup is complete. Nothing is sent automatically.
              </p>
              <textarea
                id={`${fieldId}-welcome`}
                className="min-h-48 w-full rounded-lg border p-3 text-sm"
                readOnly
                value={welcome}
              />
              <Button type="button" variant="outline" onClick={() => void copyWelcome()}>
                {copied ? "Copied" : "Copy login details"}
              </Button>
            </div>
          ) : null}
          {error ? (
            <p className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive" role="alert">
              {error}
            </p>
          ) : null}
          {!loading && !policies.length && !recovery && !done ? (
            <Button type="button" variant="outline" onClick={() => void loadPolicies()}>
              Reload access policies
            </Button>
          ) : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={working} onClick={() => changeOpen(false)}>
              {done ? "Done" : createdId || recovery ? "Close" : "Cancel"}
            </Button>
            {!done && !recovery ? (
              <Button type="submit" disabled={working || loading || !policyId}>
                {working ? "Saving…" : person ? "Save access" : createdId ? "Retry access setup" : "Add person"}
              </Button>
            ) : null}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
