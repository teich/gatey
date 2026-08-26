import Link from "next/link";
import { managedVisitorIds } from "@/lib/db";
import { listUserInventory, listVisitorInventory } from "@/lib/unifi-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(value?: string) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function labelStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

export default async function AdminPage() {
  let visitors;
  let users;
  let managed;
  let errorMessage: string | undefined;

  try {
    [visitors, users, managed] = await Promise.all([listVisitorInventory(), listUserInventory(), Promise.resolve(managedVisitorIds())]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Could not read visitors from UniFi Access.";
  }

  if (errorMessage || !visitors || !users || !managed) {
    return <main className="admin-shell"><header className="admin-header"><div><p className="eyebrow">Gatey admin</p><h1>Visitor inventory</h1></div><Link className="admin-home-link" href="/">Resident view</Link></header><section className="admin-empty"><h2>UniFi inventory unavailable</h2><p>{errorMessage ?? "Could not read visitors from UniFi Access."}</p></section></main>;
  }

  const unmanaged = visitors.filter((visitor) => !managed.has(visitor.id)).length;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><p className="eyebrow">Gatey admin</p><h1>Visitor inventory</h1></div>
        <Link className="admin-home-link" href="/">Resident view</Link>
      </header>
      <section className="admin-intro"><p>Read-only view of what UniFi Access currently has. People are long-term access accounts; visitors are time-bound passes. Nothing here changes a person, visitor, or code.</p><div className="inventory-counts"><span><strong>{users.length}</strong> people in UniFi</span><span><strong>{visitors.length}</strong> visitors in UniFi</span><span><strong>{unmanaged}</strong> visitors not yet managed by Gatey</span></div></section>
      <section className="inventory-section" aria-labelledby="people-heading"><div className="inventory-section-heading"><p className="eyebrow">Long-term access</p><h2 id="people-heading">People</h2></div>{users.length === 0 ? <section className="admin-empty"><p>UniFi returned no people.</p></section> : <section className="visitor-list" aria-label="UniFi people">{users.map((user) => <article className="visitor-row" key={user.id}><div className="visitor-title"><div><h3>{user.name}</h3><p className={`inventory-status ${user.status.toLowerCase()}`}>{labelStatus(user.status)}</p></div><span className="existing-badge">UniFi person</span></div><dl className="visitor-details"><div><dt>PIN</dt><dd>{user.hasPin ? "Assigned" : "No PIN"}</dd></div><div><dt>NFC card</dt><dd>{user.hasNfcCard ? "Assigned" : "No card"}</dd></div><div className="visitor-locations"><dt>Access policies</dt><dd>{user.policyNames.length ? user.policyNames.join(", ") : "No policy assigned"}</dd></div></dl><p className="visitor-id">UniFi ID: {user.id}</p></article>)}</section>}</section>
      <section className="inventory-section" aria-labelledby="visitors-heading"><div className="inventory-section-heading"><p className="eyebrow">Time-bound access</p><h2 id="visitors-heading">Visitors</h2></div>{visitors.length === 0 ? <section className="admin-empty"><p>UniFi returned an empty visitor list.</p></section> : <section className="visitor-list" aria-label="UniFi visitor inventory">{visitors.map((visitor) => {
        const isManaged = managed.has(visitor.id);
        return <article className="visitor-row" key={visitor.id}>
          <div className="visitor-title"><div><h2>{visitor.name}</h2><p className={`inventory-status ${visitor.status.toLowerCase()}`}>{labelStatus(visitor.status)}</p></div><span className={isManaged ? "managed-badge" : "existing-badge"}>{isManaged ? "Managed by Gatey" : "Existing in UniFi"}</span></div>
          <dl className="visitor-details"><div><dt>PIN</dt><dd>{visitor.hasPin ? "Assigned" : "No PIN"}</dd></div><div><dt>Visit type</dt><dd>{visitor.recurring ? "Recurring" : "One time"}</dd></div><div><dt>Starts</dt><dd>{formatDate(visitor.startsAt)}</dd></div><div><dt>Ends</dt><dd>{formatDate(visitor.endsAt)}</dd></div><div className="visitor-locations"><dt>Visit location</dt><dd>{visitor.resources.length ? visitor.resources.join(", ") : "None assigned"}</dd></div></dl>
          <p className="visitor-id">UniFi ID: {visitor.id}</p>
        </article>;
      })}</section>}</section>
    </main>
  );
}
