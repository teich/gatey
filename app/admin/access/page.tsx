import { SyncAccessButton } from "@/app/admin/access/sync-access-button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { accessActivityTotals, getAccessSyncStatus, listAccessActivity } from "@/lib/access-history";
import { formatGateyDateTime } from "@/lib/date-time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(value?: string) {
  if (!value) return "Not yet";
  return formatGateyDateTime(value, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function methodLabel(value: string) {
  const labels: Record<string, string> = {
    PIN_CODE: "PIN",
    REMOTE_THROUGH_UAH: "Remote",
    LICENSEPLATE: "License plate",
    CALL: "Call",
    MOBILE_BUTTON: "Mobile",
    MOBILE_TAP: "Mobile tap",
    REX: "Exit sensor",
  };
  return labels[value] || value.toLowerCase().replaceAll("_", " ") || "Unknown";
}

export default function AccessPage() {
  const status = getAccessSyncStatus();
  const totals = accessActivityTotals();
  const events = listAccessActivity();

  return <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-muted-foreground">Physical gate history</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Access activity</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Who used the gate, when they used it, and which household or managed code it belongs to.</p></div><SyncAccessButton /></div>
    {status.state === "failed" ? <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900"><strong>Synchronization failed.</strong> {status.lastError}</div> : null}
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-xl border bg-card p-4"><span className="text-sm text-muted-foreground">Granted · {totals.windowDays} days</span><strong className="mt-2 block text-3xl">{totals.granted}</strong></div>
      <div className="rounded-xl border bg-card p-4"><span className="text-sm text-muted-foreground">Successful PIN uses</span><strong className="mt-2 block text-3xl">{totals.pinUses}</strong></div>
      <div className="rounded-xl border bg-card p-4"><span className="text-sm text-muted-foreground">Blocked attempts</span><strong className="mt-2 block text-3xl">{totals.blocked}</strong></div>
      <div className="rounded-xl border bg-card p-4"><span className="text-sm text-muted-foreground">History coverage</span><strong className="mt-2 block text-base">{status.coverageStartsAt ? `Since ${formatDate(status.coverageStartsAt)}` : "Awaiting first sync"}</strong><small className="mt-1 block text-muted-foreground">Updated {formatDate(status.lastSucceededAt)}</small></div>
    </div>
    <div className="admin-table-shell"><Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who or code</TableHead><TableHead>Household</TableHead><TableHead>Method</TableHead><TableHead>Result</TableHead><TableHead>Details</TableHead></TableRow></TableHeader><TableBody>
      {events.map((event) => <TableRow key={event.id}><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(event.occurredAt)}</TableCell><TableCell><strong>{event.actorName}</strong>{!event.attributable ? <span className="mt-1 block text-xs text-amber-700">Not yet assigned</span> : null}</TableCell><TableCell>{event.householdName || "No household"}</TableCell><TableCell className="capitalize">{methodLabel(event.credentialProvider)}</TableCell><TableCell><span className={event.result === "ACCESS" ? "managed-badge" : "existing-badge"}>{event.result === "ACCESS" ? "Granted" : event.result.toLowerCase()}</span></TableCell><TableCell className="text-sm text-muted-foreground">{event.displayMessage || event.reason || event.doorName}</TableCell></TableRow>)}
      {!events.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No UniFi access history has been synchronized yet.</TableCell></TableRow> : null}
    </TableBody></Table></div>
  </div>;
}
