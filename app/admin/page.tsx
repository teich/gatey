import Link from "next/link";
import { ManagePinButton } from "@/app/admin/replace-pin-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { managedPersonPins, managedVisitorIds, managedVisitorPins } from "@/lib/db";
import { listUserInventory, listVisitorInventory } from "@/lib/unifi-access";
import { requirePageAdmin } from "@/lib/authorization";

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
  await requirePageAdmin();

  let visitors;
  let users;
  let managedVisitors;
  let visitorPins;
  let personPins;
  let errorMessage: string | undefined;

  try {
    [visitors, users, managedVisitors, visitorPins, personPins] = await Promise.all([
      listVisitorInventory(),
      listUserInventory(),
      Promise.resolve(managedVisitorIds()),
      Promise.resolve(managedVisitorPins()),
      Promise.resolve(managedPersonPins()),
    ]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Could not read UniFi Access.";
  }

  if (errorMessage || !visitors || !users || !managedVisitors || !visitorPins || !personPins) {
    return <main className="admin-shell"><header className="admin-header"><div><p className="eyebrow">Gatey admin</p><h1>Access inventory</h1></div><div className="admin-header-links"><Link className="admin-home-link" href="/admin/households">Households</Link><Link className="admin-home-link" href="/">Resident view</Link></div></header><section className="admin-empty"><h2>UniFi inventory unavailable</h2><p>{errorMessage ?? "Could not read UniFi Access."}</p></section></main>;
  }

  const currentVisitors = visitors.filter((visitor) => !["CANCELLED", "NO_VISIT", "EXPIRED", "REVOKED"].includes(visitor.status.toUpperCase()));
  const unmanagedVisitors = currentVisitors.filter((visitor) => !managedVisitors.has(visitor.id)).length;

  return (
    <main className="admin-shell">
      <header className="admin-header">
        <div><p className="eyebrow">Gatey admin</p><h1>Access inventory</h1></div>
        <div className="admin-header-links"><Link className="admin-home-link" href="/admin/households">Households</Link><Link className="admin-home-link" href="/">Resident view</Link></div>
      </header>
      <section className="admin-intro"><p>People have long-term access. Visitors are time-bound passes. PINs that Gatey creates or replaces are stored here so they stay easy to find.</p><div className="inventory-counts"><span><strong>{users.length}</strong> people in UniFi</span><span><strong>{currentVisitors.length}</strong> current visitors</span><span><strong>{unmanagedVisitors}</strong> visitors not yet managed by Gatey</span></div></section>

      <section className="inventory-section" aria-labelledby="people-heading">
        <div className="inventory-section-heading"><p className="eyebrow">Long-term access</p><h2 id="people-heading">People</h2></div>
        {users.length === 0 ? <section className="admin-empty"><p>UniFi returned no people.</p></section> : <div className="admin-table-shell"><Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>PIN</TableHead><TableHead>Gatey PIN</TableHead><TableHead>Access policies</TableHead><TableHead>Card</TableHead><TableHead className="admin-actions-head">Action</TableHead></TableRow></TableHeader><TableBody>{users.map((user) => {
          const storedPin = personPins.get(user.id);
          return <TableRow key={user.id}><TableCell><strong>{user.name}</strong><span className={`inventory-status ${user.status.toLowerCase()}`}>{labelStatus(user.status)}</span></TableCell><TableCell>{user.hasPin ? "Assigned" : "No PIN"}</TableCell><TableCell>{storedPin ? <strong className="table-pin">{storedPin}</strong> : "Not yet stored"}</TableCell><TableCell className="policy-cell">{user.policyNames.length ? user.policyNames.join(", ") : "No policy assigned"}</TableCell><TableCell>{user.hasNfcCard ? "Assigned" : "No card"}</TableCell><TableCell><ManagePinButton endpoint={`/api/people/${encodeURIComponent(user.id)}/replace-pin`} name={user.name} hasPin={user.hasPin} /></TableCell></TableRow>;
        })}</TableBody></Table></div>}
      </section>

      <section className="inventory-section" aria-labelledby="visitors-heading">
        <div className="inventory-section-heading"><p className="eyebrow">Time-bound access</p><h2 id="visitors-heading">Visitors</h2></div>
        {currentVisitors.length === 0 ? <section className="admin-empty"><p>No current visitors.</p></section> : <div className="admin-table-shell"><Table><TableHeader><TableRow><TableHead>Visitor</TableHead><TableHead>PIN</TableHead><TableHead>Gatey PIN</TableHead><TableHead>Visit type</TableHead><TableHead>Starts</TableHead><TableHead>Ends</TableHead><TableHead>Source</TableHead><TableHead className="admin-actions-head">Action</TableHead></TableRow></TableHeader><TableBody>{currentVisitors.map((visitor) => {
          const isManaged = managedVisitors.has(visitor.id);
          const storedPin = visitorPins.get(visitor.id);
          return <TableRow key={visitor.id}><TableCell><strong>{visitor.name}</strong><span className={`inventory-status ${visitor.status.toLowerCase()}`}>{labelStatus(visitor.status)}</span></TableCell><TableCell>{visitor.hasPin ? "Assigned" : "No PIN"}</TableCell><TableCell>{storedPin ? <strong className="table-pin">{storedPin}</strong> : "Not yet stored"}</TableCell><TableCell>{visitor.recurring ? "Recurring" : "One time"}</TableCell><TableCell>{formatDate(visitor.startsAt)}</TableCell><TableCell>{formatDate(visitor.endsAt)}</TableCell><TableCell><span className={isManaged ? "managed-badge" : "existing-badge"}>{isManaged ? "Gatey" : "UniFi"}</span></TableCell><TableCell><ManagePinButton endpoint={`/api/visitors/${encodeURIComponent(visitor.id)}/replace-pin`} name={visitor.name} hasPin={visitor.hasPin} /></TableCell></TableRow>;
        })}</TableBody></Table></div>}
      </section>
    </main>
  );
}
