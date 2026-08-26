"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import type { HouseholdAdminRecord } from "@/lib/households";

type Welcome = {
  name: string;
  message: string;
};

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
  const [welcome, setWelcome] = useState<Welcome>();

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

  async function addPerson(event: FormEvent<HTMLFormElement>, household: HouseholdAdminRecord) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    setWorking(`person-${household.id}`);
    setError(undefined);
    try {
      const result = await requestJson("/api/admin/households", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          householdId: household.id,
          name: form.get("name"),
          email: form.get("email"),
          username: form.get("username"),
        }),
      }) as { welcomeMessage?: string; member?: { name?: string } };
      formElement.reset();
      if (result.welcomeMessage) setWelcome({ name: result.member?.name || "New resident", message: result.welcomeMessage });
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not add this person.");
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

  async function copyWelcomeMessage() {
    if (!welcome) return;
    await navigator.clipboard.writeText(welcome.message);
  }

  return <>
    <section className="household-intro"><p>Make a household, add residents, then copy their welcome message into the email you send them. Gatey does not send email itself.</p></section>
    <section className="household-create" aria-labelledby="new-household-heading">
      <div><p className="eyebrow">New household</p><h2 id="new-household-heading">Start a home</h2></div>
      <form className="household-form household-create-form" onSubmit={createHousehold}>
        <label>Household name<input value={newName} onChange={(event) => setNewName(event.target.value)} placeholder="Smith household" required /></label>
        <label>Short URL name <span>Optional</span><input value={newSlug} onChange={(event) => setNewSlug(event.target.value)} placeholder="smith-household" /></label>
        <button className="primary-action" type="submit" disabled={working === "create-household"}>{working === "create-household" ? "Creating…" : "Create household"}</button>
      </form>
    </section>
    {error ? <p className="form-error household-error" role="alert">{error}</p> : null}
    <section className="household-list" aria-label="Households">
      {households.map((household) => <article className="household-card" key={household.id}>
        <form className="household-form household-edit-form" onSubmit={(event) => void updateHousehold(event, household.id)}>
          <label>Household name<input name="name" defaultValue={household.name} required /></label>
          <label>Short URL name<input name="slug" defaultValue={household.slug} required /></label>
          <button className="secondary-action" type="submit" disabled={working === `update-${household.id}`}>{working === `update-${household.id}` ? "Saving…" : "Save changes"}</button>
          {household.id !== "oren-home" ? <button className="text-button danger" type="button" disabled={working === `delete-${household.id}`} onClick={() => void deleteHousehold(household)}>Delete household</button> : <span className="household-protected">Initial household</span>}
        </form>
        <div className="household-people">
          <div><p className="eyebrow">Residents</p><h2>{household.members.length} {household.members.length === 1 ? "person" : "people"}</h2></div>
          <ul className="household-member-list">
            {household.members.map((member) => <li key={member.id}><div><strong>{member.name}</strong><span>{member.username ? `${member.username} · ` : ""}{member.email}</span></div><div className="household-member-actions">{member.role.split(",").includes("owner") ? null : <button className="text-button danger" type="button" disabled={working === `remove-${member.id}`} onClick={() => void removeMember(household.id, member.id, member.name)}>Remove</button>}</div></li>)}
          </ul>
          <form className="household-form person-form" onSubmit={(event) => void addPerson(event, household)}>
            <p>Add a person</p>
            <label>Name <span>Needed for a new account</span><input name="name" placeholder="Jamie Smith" /></label>
            <label>Email<input name="email" type="email" placeholder="jamie@example.com" required /></label>
            <label>Username <span>Needed for a new account</span><input name="username" placeholder="jamie" autoCapitalize="none" /></label>
            <button className="primary-action" type="submit" disabled={working === `person-${household.id}`}>{working === `person-${household.id}` ? "Adding…" : "Add person"}</button>
          </form>
        </div>
      </article>)}
    </section>
    {welcome ? <div className="dialog-backdrop" role="presentation"><section className="dialog welcome-dialog" role="dialog" aria-modal="true" aria-labelledby="welcome-message-title"><p className="eyebrow">Ready to send</p><h2 id="welcome-message-title">Welcome {welcome.name}</h2><p>Copy this and email it to them. The temporary password is only shown here.</p><textarea value={welcome.message} readOnly aria-label="Welcome message" /><div className="dialog-actions"><button className="primary-action" type="button" onClick={() => void copyWelcomeMessage()}>Copy message</button><button className="secondary-action" type="button" onClick={() => setWelcome(undefined)}>Done</button></div></section></div> : null}
  </>;
}
