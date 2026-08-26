import Link from "next/link";
import { HouseholdManager } from "@/app/admin/households/household-manager";
import { listHouseholds } from "@/lib/households";
import { requirePageAdmin } from "@/lib/authorization";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HouseholdAdminPage() {
  await requirePageAdmin();

  return (
    <main className="admin-shell household-admin-shell">
      <header className="admin-header">
        <div><p className="eyebrow">Gatey admin</p><h1>Households</h1></div>
        <Link className="admin-home-link" href="/admin">Access inventory</Link>
      </header>
      <HouseholdManager households={listHouseholds()} />
    </main>
  );
}
