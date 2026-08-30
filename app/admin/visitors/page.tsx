import { VisitorAssignment } from "@/app/admin/visitors/visitor-assignment";
import { MigrateVisitorButton } from "@/app/admin/visitors/migrate-visitor-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listVisitorHouseholds } from "@/lib/admin-assignments";
import { listActorUsageSummaries } from "@/lib/access-history";
import { formatGateyDateTime } from "@/lib/date-time";
import { managedVisitorPins } from "@/lib/db";
import { managedGateyVisitorIds } from "@/lib/gate-codes";
import { listHouseholds } from "@/lib/households";
import { getUnifiInventorySnapshot } from "@/lib/unifi-inventory-cache";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(value?: string) {
  if (!value) return "Not set";
  return formatGateyDateTime(value, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function labelStatus(status: string) { return status.toLowerCase().replaceAll("_", " "); }

export default async function VisitorsPage() {
  const households = listHouseholds().map(({ id, name }) => ({ id, name }));
  const assignments = listVisitorHouseholds();
  const pins = managedVisitorPins();
  const gateyVisitors = managedGateyVisitorIds();
  const { visitors, lastError: errorMessage } = getUnifiInventorySnapshot();
  const currentVisitors = visitors.filter((visitor) => {
    const archived = ["CANCELLED", "NO_VISIT", "EXPIRED", "REVOKED"].includes(visitor.status.toUpperCase());
    const interruptedMigration = visitor.status.toUpperCase() === "CANCELLED" && visitor.hasPin && assignments.has(visitor.id) && !gateyVisitors.has(visitor.id);
    return !archived || interruptedMigration;
  });
  const unassignedCount = currentVisitors.filter((visitor) => !assignments.has(visitor.id)).length;
  const usage = listActorUsageSummaries(currentVisitors.map((visitor) => visitor.id));

  return <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-muted-foreground">Time-bound access</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Visitors</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Assign every current UniFi visitor pass to the household that owns it.</p></div><span data-inventory-kind="visitors" className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">{unassignedCount} unassigned</span></div>
    {errorMessage ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{errorMessage}</div> : null}
    <div className="admin-table-shell"><Table><TableHeader><TableRow><TableHead sortKey="visitor">Visitor</TableHead><TableHead sortKey="household">Household</TableHead><TableHead sortKey="schedule">Schedule</TableHead><TableHead sortKey="recentUse">Recent use</TableHead><TableHead sortKey="credentials">Credentials</TableHead><TableHead className="admin-actions-head">Assignment</TableHead><TableHead>PIN</TableHead></TableRow></TableHeader><TableBody>
      {currentVisitors.map((visitor) => {
        const assignment = assignments.get(visitor.id);
        const pin = pins.get(visitor.id);
        const isGateyManaged = gateyVisitors.has(visitor.id);
        const visitorUsage = usage.get(visitor.id);
        return <TableRow key={visitor.id} data-inventory-kind="visitors" sortValues={{ visitor: visitor.name, household: assignment?.householdName, schedule: visitor.startsAt, recentUse: visitorUsage?.lastUsedAt, credentials: pin || (visitor.hasPin ? "PIN assigned" : "No PIN") }}>
          <TableCell><strong>{visitor.name}</strong><span className={`inventory-status ${visitor.status.toLowerCase()}`}>{labelStatus(visitor.status)}</span></TableCell>
          <TableCell>{assignment ? <span className="managed-badge">{assignment.householdName}</span> : <span className="existing-badge">Unassigned</span>}</TableCell>
          <TableCell><span className="block">{visitor.recurring ? "Recurring" : "One time"}</span><span className="mt-1 block text-xs text-muted-foreground">{formatDate(visitor.startsAt)} – {formatDate(visitor.endsAt)}</span></TableCell>
          <TableCell>{visitorUsage?.known ? <><strong>{visitorUsage.useCount} uses</strong><span className="mt-1 block text-xs text-muted-foreground">{visitorUsage.lastUsedAt ? `Last ${formatDate(visitorUsage.lastUsedAt)}` : `None in ${visitorUsage.usageWindowDays} days`}</span></> : <span className="text-muted-foreground">Not synced</span>}</TableCell>
          <TableCell>{pin ? <strong className="table-pin block text-xl leading-none">{pin}</strong> : <span className="block">{visitor.hasPin ? "PIN assigned" : "No PIN"}</span>}</TableCell>
          <TableCell><VisitorAssignment visitorId={visitor.id} initialHouseholdId={assignment?.householdId} households={households} /></TableCell>
          <TableCell>{isGateyManaged ? <span className="managed-badge">Managed in Gatey</span> : <MigrateVisitorButton visitorId={visitor.id} visitorName={visitor.name} households={households} />}</TableCell>
        </TableRow>;
      })}
      {!currentVisitors.length && !errorMessage ? <TableRow><TableCell colSpan={7} className="py-10 text-center text-muted-foreground">No current visitors.</TableCell></TableRow> : null}
    </TableBody></Table></div>
  </div>;
}
