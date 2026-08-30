import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatGateyDateTime } from "@/lib/date-time";
import { listTwilioEvents } from "@/lib/twilio-activity";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function formatDate(value: string) {
  return formatGateyDateTime(value, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit" });
}

function eventLabel(event: string) {
  const labels: Record<string, string> = {
    action_failed: "Hold failed",
    action_unauthorized: "Action denied",
    caller_blocked: "Caller blocked",
    caller_prompted: "Caller prompted",
    hold_open: "Hold started",
    invalid_digit: "Invalid selection",
    signature_invalid: "Invalid signature",
    unlock_failed: "Open failed",
    unlock_success: "Gate opened",
  };
  return labels[event] || event.replaceAll("_", " ");
}

export default function CallsPage() {
  const events = listTwilioEvents();
  return <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
    <div><p className="text-sm font-medium text-muted-foreground">Twilio responder</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Phone calls</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Webhook decisions and call-to-open outcomes. Physical gate changes also appear in the main activity log.</p></div>
    <div className="admin-table-shell"><Table><TableHeader><TableRow><TableHead sortKey="when">When</TableHead><TableHead sortKey="caller">Caller</TableHead><TableHead sortKey="resident">Resident</TableHead><TableHead sortKey="household">Household</TableHead><TableHead sortKey="event">Event</TableHead><TableHead sortKey="detail">Detail</TableHead></TableRow></TableHeader><TableBody>
      {events.map((event) => <TableRow key={event.id} sortValues={{ when: event.occurredAt, caller: event.callerE164, resident: event.actorName, household: event.householdName, event: eventLabel(event.event), detail: event.detail || event.callSid }}><TableCell className="whitespace-nowrap text-sm text-muted-foreground">{formatDate(event.occurredAt)}</TableCell><TableCell className="font-mono text-sm">{event.callerE164 || "—"}</TableCell><TableCell>{event.actorName || "Unknown"}</TableCell><TableCell>{event.householdName || "—"}</TableCell><TableCell><span className={event.event.includes("success") || event.event === "hold_open" ? "managed-badge" : event.event.includes("failed") || event.event.includes("blocked") || event.event.includes("invalid") ? "existing-badge" : "inventory-status"}>{eventLabel(event.event)}</span></TableCell><TableCell className="max-w-sm text-sm text-muted-foreground">{event.detail || (event.callSid ? `Call ${event.callSid}` : "—")}</TableCell></TableRow>)}
      {!events.length ? <TableRow><TableCell colSpan={6} className="py-12 text-center text-muted-foreground">No Twilio calls have reached Gatey yet.</TableCell></TableRow> : null}
    </TableBody></Table></div>
  </div>;
}
