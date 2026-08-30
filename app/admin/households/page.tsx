import { HouseholdManager } from "@/app/admin/households/household-manager";
import { listHouseholds } from "@/lib/households";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HouseholdAdminPage() {
  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 p-4 md:p-6 lg:p-8">
      <div><p className="text-sm font-medium text-muted-foreground">Community structure</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Households</h1><p className="mt-2 max-w-2xl text-sm text-muted-foreground">Manage the household directory and see how people and visitor passes are distributed. Use People to manage individual residents.</p></div>
      <HouseholdManager households={listHouseholds()} />
    </div>
  );
}
