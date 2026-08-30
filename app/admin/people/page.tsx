import { ManagePinButton } from "@/app/admin/replace-pin-button";
import { PersonAssignmentManager } from "@/app/admin/people/person-assignment-manager";
import { PersonHouseholdAssignment } from "@/app/admin/people/person-household-assignment";
import { PersonPasswordReset } from "@/app/admin/people/person-password-reset";
import { PersonEditor } from "@/app/admin/people/person-editor";
import { MarkServiceAccountButton, ServiceAccountsSection } from "@/app/admin/people/service-account-manager";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { listAssignableAccounts, listPersonLinks } from "@/lib/admin-assignments";
import { managedPersonPins } from "@/lib/db";
import { listHouseholds } from "@/lib/households";
import { getUnifiInventorySnapshot } from "@/lib/unifi-inventory-cache";
import { listUserPhoneNumbers } from "@/lib/phone-access";
import { listUnifiServiceAccounts } from "@/lib/service-accounts";

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
  const serviceAccounts = listUnifiServiceAccounts();
  const { users: people, lastError: errorMessage } = getUnifiInventorySnapshot();
  const residentPeople = people.filter((person) => !serviceAccounts.has(person.id));
  const servicePeople = people.filter((person) => serviceAccounts.has(person.id));
  const unassignedCount = residentPeople.filter((person) => !links.get(person.id)?.householdId).length;

  return <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm font-medium text-muted-foreground">Long-term access</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">People</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Every UniFi person should link to one Gatey account and household.</p></div><span data-inventory-kind="users" className="rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-900">{unassignedCount} unassigned</span></div>
    {errorMessage ? <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">{errorMessage}</div> : null}
    <div className="admin-table-shell"><Table><TableHeader><TableRow><TableHead sortKey="person">Person</TableHead><TableHead sortKey="household">Household</TableHead><TableHead sortKey="account">Gatey account</TableHead><TableHead sortKey="credentials">Credentials</TableHead><TableHead className="admin-actions-head">Actions</TableHead></TableRow></TableHeader><TableBody>
      {residentPeople.map((person) => {
        const link = links.get(person.id);
        const storedPin = pins.get(person.id);
        return <TableRow key={person.id} data-inventory-kind="users" sortValues={{ person: person.name, household: link?.householdName, account: link?.accountName, credentials: storedPin || (person.hasPin ? "PIN assigned" : person.hasNfcCard ? "Card assigned" : "No PIN") }}><TableCell><strong>{person.name}</strong><span className={`inventory-status ${person.status.toLowerCase()}`}>{labelStatus(person.status)}</span></TableCell><TableCell>{link?.householdId ? <span className="managed-badge">{link.householdName}</span> : <span className="existing-badge">Unassigned</span>}</TableCell><TableCell>{link ? <><strong className="block">{link.accountName}</strong><span className="text-xs text-muted-foreground">{link.email || `${link.username || "Managed resident"} · No email`}</span></> : <span className="text-muted-foreground">Not linked</span>}</TableCell><TableCell>{storedPin ? <strong className="table-pin block text-xl leading-none">{storedPin}</strong> : <span className="block">{person.hasPin ? "PIN assigned" : "No PIN"}</span>}{person.hasNfcCard ? <span className="mt-1 block text-xs text-muted-foreground">Card assigned</span> : null}</TableCell><TableCell><div className="people-actions">{link?.householdId ? <><PersonEditor personId={person.id} userId={link.userId} accountName={link.accountName} email={link.email} username={link.username} householdId={link.householdId} households={households} phones={listUserPhoneNumbers(link.userId)} /><ManagePinButton endpoint={`/api/people/${encodeURIComponent(person.id)}/replace-pin`} name={person.name} hasPin={person.hasPin} /><PersonPasswordReset personId={person.id} personName={person.name} /></> : link ? <PersonHouseholdAssignment personId={person.id} households={households} /> : <><PersonAssignmentManager personName={person.name} personId={person.id} households={households} accounts={accounts} /><MarkServiceAccountButton personId={person.id} personName={person.name} /></>}</div></TableCell></TableRow>;
      })}
      {!residentPeople.length && !errorMessage ? <TableRow><TableCell colSpan={5} className="py-10 text-center text-muted-foreground">No resident people need attention.</TableCell></TableRow> : null}
    </TableBody></Table></div>
    <ServiceAccountsSection people={servicePeople.map(({ id, name, status }) => ({ id, name, status }))} />
  </div>;
}
