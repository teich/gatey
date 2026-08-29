import { ManagePinButton } from "@/app/admin/replace-pin-button";
import { PersonAssignmentManager } from "@/app/admin/people/person-assignment-manager";
import { PersonHouseholdAssignment } from "@/app/admin/people/person-household-assignment";
import { PersonPasswordReset } from "@/app/admin/people/person-password-reset";
import { PersonPhoneManager } from "@/app/admin/people/person-phone-manager";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAssignableAccounts, listPersonLinks } from "@/lib/admin-assignments";
import { managedPersonPins } from "@/lib/db";
import { listHouseholds } from "@/lib/households";
import { listUserInventory } from "@/lib/unifi-access";
import { listUserPhoneNumbers } from "@/lib/phone-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function labelStatus(status: string) {
  return status.toLowerCase().replaceAll("_", " ");
}

export default async function PeoplePage() {
  const households = listHouseholds().map(({ id, name }) => ({ id, name }));
  const links = listPersonLinks();
  const accounts = listAssignableAccounts();
  const pins = managedPersonPins();
  let people: Awaited<ReturnType<typeof listUserInventory>> = [];
  let errorMessage: string | undefined;
  try { people = await listUserInventory(); } catch (error) { errorMessage = error instanceof Error ? error.message : "Could not read UniFi Access."; }
  const unassignedCount = people.filter((person) => !links.get(person.id)?.householdId).length;

  return <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-muted-foreground">Long-term access</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">People</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Every UniFi person should link to one Gatey account and household.</p></div><span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">{unassignedCount} unassigned</span></div>
    {errorMessage ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{errorMessage}</div> : null}
    <div className="admin-table-shell"><Table><TableHeader><TableRow><TableHead>Person</TableHead><TableHead>Household</TableHead><TableHead>Gatey account</TableHead><TableHead>Credentials</TableHead><TableHead className="admin-actions-head">Actions</TableHead></TableRow></TableHeader><TableBody>
      {people.map((person) => {
        const link = links.get(person.id);
        const storedPin = pins.get(person.id);
        return <TableRow key={person.id}><TableCell><strong>{person.name}</strong><span className={`inventory-status ${person.status.toLowerCase()}`}>{labelStatus(person.status)}</span></TableCell><TableCell>{link?.householdId ? <span className="managed-badge">{link.householdName}</span> : <span className="existing-badge">Unassigned</span>}</TableCell><TableCell>{link ? <><strong className="block">{link.accountName}</strong><span className="text-xs text-muted-foreground">{link.email}</span></> : <span className="text-muted-foreground">Not linked</span>}</TableCell><TableCell>{storedPin ? <strong className="table-pin block text-xl leading-none">{storedPin}</strong> : <span className="block">{person.hasPin ? "PIN assigned" : "No PIN"}</span>}{person.hasNfcCard ? <span className="mt-1 block text-xs text-muted-foreground">Card assigned</span> : null}</TableCell><TableCell><div className="people-actions">{link?.householdId ? <><ManagePinButton endpoint={`/api/people/${encodeURIComponent(person.id)}/replace-pin`} name={person.name} hasPin={person.hasPin} /><PersonPhoneManager userId={link.userId} personName={person.name} phones={listUserPhoneNumbers(link.userId)} /><PersonPasswordReset personId={person.id} personName={person.name} /></> : link ? <PersonHouseholdAssignment personId={person.id} households={households} /> : <PersonAssignmentManager personName={person.name} personId={person.id} households={households} accounts={accounts} />}</div></TableCell></TableRow>;
      })}
      {!people.length && !errorMessage ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">UniFi returned no people.</TableCell></TableRow> : null}
    </TableBody></Table></div>
  </div>;
}
