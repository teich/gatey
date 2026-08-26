import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { SignInForm } from "@/app/sign-in/sign-in-form";
import { auth } from "@/lib/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export default async function SignInPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (session) redirect("/");

  return (
    <main className="auth-shell">
      <section className="auth-card">
        <p className="eyebrow">Bennett Valley Gate</p>
        <h1>Welcome home.</h1>
        <p>Sign in to create and manage your household&apos;s guest codes.</p>
        <SignInForm />
      </section>
    </main>
  );
}
