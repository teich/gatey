import { AccessActivityTable } from "@/app/admin/access/access-activity-table";
import { SyncAccessButton } from "@/app/admin/access/sync-access-button";
import { accessActivityTotals, getAccessSyncStatus, listAccessActivity } from "@/lib/access-history";
import { formatGateyDateTime } from "@/lib/date-time";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(value?: string) {
  if (!value) return "Not yet";
  return formatGateyDateTime(value, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
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
    <AccessActivityTable events={events} />
  </div>;
}
