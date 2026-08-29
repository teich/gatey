"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import type { HouseholdAdminRecord } from "@/lib/households";

async function requestJson(url: string, init: RequestInit) {
  const response = await fetch(url, init);
  const body = await response.json() as { error?: string };
  if (!response.ok) throw new Error(body.error || "Could not save the household.");
  return body;
}

export function HouseholdManager({ households }: { households: HouseholdAdminRecord[] }) {
  const router = useRouter();
  const [newName, setNewName] = useState("");
  const [newSlug, setNewSlug] = useState("");
  const [working, setWorking] = useState<string>();
  const [error, setError] = useState<string>();

  async function createHousehold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorking("create-household");
    setError(undefined);
    try {
      await requestJson("/api/admin/households", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName, slug: newSlug }),
      });
      setNewName("");
      setNewSlug("");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the household.");
    } finally {
      setWorking(undefined);
    }
  }

  async function updateHousehold(event: FormEvent<HTMLFormElement>, householdId: string) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setWorking(`update-${householdId}`);
    setError(undefined);
    try {
      await requestJson(`/api/admin/households/${encodeURIComponent(householdId)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.get("name"), slug: form.get("slug") }),
      });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not update the household.");
    } finally {
      setWorking(undefined);
    }
  }

  async function removeMember(householdId: string, memberId: string, name: string) {
    if (!window.confirm(`Remove ${name} from this household? Their account will remain available for reassignment.`)) return;
    setWorking(`remove-${memberId}`);
    setError(undefined);
    try {
      await requestJson(`/api/admin/households/${encodeURIComponent(householdId)}/members/${encodeURIComponent(memberId)}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not remove this person.");
    } finally {
      setWorking(undefined);
    }
  }

  async function deleteHousehold(household: HouseholdAdminRecord) {
    if (!window.confirm(`Delete ${household.name}? This is only allowed once its residents and Gatey records are gone.`)) return;
    setWorking(`delete-${household.id}`);
    setError(undefined);
    try {
      await requestJson(`/api/admin/households/${encodeURIComponent(household.id)}`, { method: "DELETE" });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not delete the household.");
    } finally {
      setWorking(undefined);
    }
  }

  return <>
    <section className="household-create" aria-labelledby="new-household-heading">
      <div><p className="eyebrow">New household</p><h2 id="new-household-heading">Start a home</h2></div>
      <form className="household-form household-create-form" onSubmit={createHousehold}>
        <label>Household name<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Smith household" required /></label>
        <label>Short URL name <span>Optional</span><input value={newSlug} onChange={(event) => setNewSlug(event.target.value)} placeholder="smith-household" /></label>
        <Button className="h-[46px] px-4" type="submit" disabled={working === "create-household"}>{working === "create-household" ? "Creating…" : "Create household"}</Button>
      </form>
    </section>
    {error ? <p className="form-error household-error" role="alert">{error}</p> : null}
    <section className="household-list" aria-label="Households">
      {households.map((household) => <article className="household-card" key={household.id}>
        <form className="household-form household-edit-form" onSubmit={(event) => void updateHousehold(event, household.id)}>
          <label>Household name<input name="name" defaultValue={household.name} required /></label>
          <label>Short URL name<input name="slug" defaultValue={household.slug} required /></label>
          <Button className="h-[46px] px-4" variant="outline" type="submit" disabled={working === `update-${household.id}`}>{working === `update-${household.id}` ? "Saving…" : "Save changes"}</Button>
          {household.id !== "oren-home" ? <button className="text-button danger" type="button" disabled={working === `delete-${household.id}`} onClick={() => void deleteHousehold(household)}>Delete household</button> : <span className="household-protected">Initial household</span>}
        </form>
        <div className="household-people">
          <div className="household-summary"><div><p className="eyebrow">At a glance</p><h2>{household.members.length} {household.members.length === 1 ? "person" : "people"}</h2></div><div className="household-summary-count"><strong>{household.visitorCount}</strong><span>{household.visitorCount === 1 ? "visitor pass" : "visitor passes"}</span></div></div>
          <ul className="household-member-list">
            {household.members.map((member) => <li key={member.id}><div><strong>{member.name}</strong><span>{member.username ? `${member.username} · ` : ""}{member.email}</span></div><div className="household-member-actions"><span className={member.controllerUserId ? "managed-badge" : "existing-badge"}>{member.controllerUserId ? "Linked to UniFi" : "Needs UniFi link"}</span>{member.role.split(",").includes("owner") ? null : <button className="text-button danger" type="button" disabled={working === `remove-${member.id}`} onClick={() => void removeMember(household.id, member.id, member.name)}>Remove</button>}</div></li>)}
            {!household.members.length ? <li className="household-member-empty">No people assigned yet.</li> : null}
          </ul>
          <div className="household-assign-people"><p>People are discovered in UniFi first, then linked to their Gatey account and household.</p><Link className="admin-home-link" href="/admin/people">Assign people</Link></div>
        </div>
      </article>)}
    </section>
  </>;
}
