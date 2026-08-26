import Link from "next/link";
import { ArrowRightIcon, HouseIcon, TicketIcon, UsersIcon } from "lucide-react";
import { listPersonLinks, listVisitorHouseholds } from "@/lib/admin-assignments";
import { listHouseholds } from "@/lib/households";
import { listUserInventory, listVisitorInventory } from "@/lib/unifi-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function AdminPage() {
  const households = listHouseholds();
  const peopleLinks = listPersonLinks();
  const visitorHouseholds = listVisitorHouseholds();
  let visitors = [] as Awaited<ReturnType<typeof listVisitorInventory>>;
  let users = [] as Awaited<ReturnType<typeof listUserInventory>>;
  let errorMessage: string | undefined;

  try {
    [visitors, users] = await Promise.all([listVisitorInventory(), listUserInventory()]);
  } catch (error) {
    errorMessage = error instanceof Error ? error.message : "Could not read UniFi Access.";
  }

  const currentVisitors = visitors.filter((visitor) => !["CANCELLED", "NO_VISIT", "EXPIRED", "REVOKED"].includes(visitor.status.toUpperCase()));
  const unassignedPeople = users.filter((person) => !peopleLinks.get(person.id)?.householdId);
  const unassignedVisitors = currentVisitors.filter((visitor) => !visitorHouseholds.has(visitor.id));
  const memberCount = households.reduce((count, household) => count + household.members.length, 0);
  const cards = [
    { label: "Households", value: households.length, detail: `${memberCount} household ${memberCount === 1 ? "member" : "members"}`, href: "/admin/households", icon: HouseIcon },
    { label: "People", value: users.length, detail: `${unassignedPeople.length} need ${unassignedPeople.length === 1 ? "assignment" : "assignment"}`, href: "/admin/people", icon: UsersIcon },
    { label: "Current visitors", value: currentVisitors.length, detail: `${unassignedVisitors.length} need ${unassignedVisitors.length === 1 ? "assignment" : "assignment"}`, href: "/admin/visitors", icon: TicketIcon },
  ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Gate access at a glance</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Overview</h1>
      </div>
      {errorMessage ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900"><strong>UniFi inventory unavailable.</strong> {errorMessage}</div> : null}
      <section className="grid gap-4 md:grid-cols-3" aria-label="Admin summary">
        {cards.map((card) => <Link key={card.label} href={card.href} className="group rounded-xl border bg-card p-5 shadow-xs transition-colors hover:bg-muted/40"><div className="flex items-center justify-between"><span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground"><card.icon className="size-4" /></span><ArrowRightIcon className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" /></div><p className="mt-5 text-3xl font-semibold tabular-nums">{card.value}</p><p className="mt-1 font-medium">{card.label}</p><p className="mt-1 text-sm text-muted-foreground">{card.detail}</p></Link>)}
      </section>
      <section className="rounded-xl border bg-card">
        <div className="border-b p-5"><h2 className="font-semibold">Needs attention</h2><p className="mt-1 text-sm text-muted-foreground">Unassigned UniFi records cannot be shown to the right household.</p></div>
        <div className="grid gap-px bg-border md:grid-cols-2">
          <Link href="/admin/people" className="flex items-center justify-between bg-card p-5 hover:bg-muted/40"><span><strong className="block">{unassignedPeople.length} unassigned {unassignedPeople.length === 1 ? "person" : "people"}</strong><span className="mt-1 block text-sm text-muted-foreground">Link discovered people to Gatey accounts.</span></span><ArrowRightIcon className="size-4 text-muted-foreground" /></Link>
          <Link href="/admin/visitors" className="flex items-center justify-between bg-card p-5 hover:bg-muted/40"><span><strong className="block">{unassignedVisitors.length} unassigned {unassignedVisitors.length === 1 ? "visitor" : "visitors"}</strong><span className="mt-1 block text-sm text-muted-foreground">Choose which household owns each pass.</span></span><ArrowRightIcon className="size-4 text-muted-foreground" /></Link>
        </div>
      </section>
    </div>
  );
}
