import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAuditEvents, type AuditEvent } from "@/lib/audit-log";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" }).format(new Date(value));
}

function actionLabel(event: AuditEvent) {
  if (event.action === "gate.open") return event.outcome === "succeeded" ? "Opened the gate" : "Tried to open the gate";
  if (event.action === "party.enabled") return event.outcome === "succeeded" ? "Enabled party mode" : "Tried to enable party mode";
  if (event.action === "party.scheduled") return event.outcome === "succeeded" ? "Scheduled party mode" : "Tried to schedule party mode";
  if (event.action === "party.started") return event.outcome === "succeeded" ? "Party mode started" : "Party mode did not start";
  if (event.action === "party.ended") return event.outcome === "succeeded" ? "Ended party mode" : "Tried to end party mode";
  if (event.action === "party.cancelled") return event.outcome === "succeeded" ? "Canceled party mode" : "Tried to cancel party mode";
  if (event.action === "guest-code.created") return event.outcome === "succeeded" ? "Created a guest code" : "Tried to create a guest code";
  if (event.action === "guest-code.cancelled") return event.outcome === "succeeded" ? "Canceled a guest code" : "Tried to cancel a guest code";
  if (event.action === "gate-code.created") return "Created a gate code";
  if (event.action === "gate-code.disabled") return "Disabled a gate code";
  if (event.action === "gate-code.migrated") return "Moved a code to Gatey";
  return event.action.replaceAll(".", " ");
}

function detailLabel(event: AuditEvent) {
  if (event.outcome === "failed") return "Controller request failed";
  if (event.action === "gate.open") {
    if (event.details.state === "open") return "Gate reported open";
    if (event.details.state === "opening") return "Gate reported opening";
    return "Controller accepted the open request";
  }
  if (event.details.startsAt && event.details.endsAt) return `${formatDate(event.details.startsAt)} – ${formatDate(event.details.endsAt)}`;
  if (event.details.label) return event.details.label;
  return "—";
}

export default function ActivityPage() {
  const events = listAuditEvents();

  return <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
    <div><p className="text-sm font-medium text-muted-foreground">Accountability</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Activity log</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">A permanent record of gate, party-mode, and guest-code actions. Newest activity appears first.</p></div>
    <div className="admin-table-shell"><Table><TableHeader><TableRow><TableHead>When</TableHead><TableHead>Who</TableHead><TableHead>Household</TableHead><TableHead>Action</TableHead><TableHead>Result</TableHead><TableHead>Gatey&apos;s record</TableHead></TableRow></TableHeader><TableBody>
      {events.map((event) => <TableRow key={event.id}><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(event.occurredAt)}</TableCell><TableCell><strong>{event.actorName}</strong></TableCell><TableCell>{event.householdName || "No household"}</TableCell><TableCell>{actionLabel(event)}</TableCell><TableCell><span className={event.outcome === "succeeded" ? "managed-badge" : "existing-badge"}>{event.outcome === "succeeded" ? "Completed" : "Failed"}</span></TableCell><TableCell className="text-sm text-muted-foreground">{detailLabel(event)}</TableCell></TableRow>)}
      {!events.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No activity yet. Gate actions will appear here.</TableCell></TableRow> : null}
    </TableBody></Table></div>
  </div>;
}
