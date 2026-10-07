import Link from "next/link";
import { requirePageHousehold } from "@/lib/authorization";
import { getShortcutConnection } from "@/lib/shortcuts";
import ShortcutSetup from "./setup";

export const dynamic = "force-dynamic";

export default async function ShortcutsPage() {
  const { session, household } = await requirePageHousehold();
  return <main className="resident-shell">
    <section className="resident-page shortcut-setup" aria-labelledby="shortcuts-title">
      <Link href="/">← Back to Gatey</Link>
      <div className="resident-page-heading"><p className="resident-kicker">iPhone pilot</p><h1 id="shortcuts-title">Open on arrival</h1><p>Let your iPhone open the gate when you come home. Your location stays on your phone.</p></div>
      <ShortcutSetup initialConnection={getShortcutConnection(session.user.id, household.id)} />
    </section>
  </main>;
}
