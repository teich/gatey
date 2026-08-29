import { ResidentHome } from "@/app/resident-home";
import { requirePageHousehold } from "@/lib/authorization";
import { camerasConfigured } from "@/lib/camera-snapshots";
import { listUserPhoneNumbers } from "@/lib/phone-access";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function HomePage() {
  const { session, household, isSystemAdmin } = await requirePageHousehold();
  const canCallGate = listUserPhoneNumbers(session.user.id)
    .some((phone) => phone.enabled && (phone.canOpen || phone.canHoldOpen));

  return (
    <ResidentHome
      householdName={household.name}
      userName={session.user.name}
      isSystemAdmin={isSystemAdmin}
      camerasConfigured={camerasConfigured()}
      gatePhoneNumber={canCallGate ? process.env.TWILIO_PHONE_NUMBER || "" : ""}
    />
  );
}
