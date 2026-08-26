import { SignOutButton } from "@/app/no-household/sign-out-button";
import { requirePageAuth } from "@/lib/authorization";

export const dynamic = "force-dynamic";

export default async function NoHouseholdPage() {
  const { session } = await requirePageAuth();

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Gatey</p>
        <h1>No household yet.</h1>
        <p>{session.user.name}, your account is valid, but it has not been added to a household. Ask the Gatey administrator to add you.</p>
        <SignOutButton />
      </section>
    </main>
  );
}
