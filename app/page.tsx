import { ResidentHome } from "@/app/resident-home";
import { requirePageHousehold } from "@/lib/authorization";
import { camerasConfigured } from "@/lib/camera-snapshots";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const { session, household, isSystemAdmin } = await requirePageHousehold();

  return (
    <ResidentHome
      householdName={household.name}
      userName={session.user.name}
      isSystemAdmin={isSystemAdmin}
      camerasConfigured={camerasConfigured()}
    />
  );
}
