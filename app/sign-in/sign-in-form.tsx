"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";

export function SignInForm() {
  const router = useRouter();
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signIn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError("");

    const login = identifier.trim();
    const result = login.includes("@")
      ? await authClient.signIn.email({ email: login, password, rememberMe: true })
      : await authClient.signIn.username({ username: login, password, rememberMe: true });

    if (result.error) {
      setError(result.error.message || "That username or password did not work.");
      setPending(false);
      return;
    }

    router.replace("/");
    router.refresh();
  }

  return (
    <form className="auth-form" onSubmit={signIn}>
      <label htmlFor="identifier">Username or email</label>
      <input
        id="identifier"
        name="identifier"
        type="text"
        autoComplete="username"
        autoCapitalize="none"
        spellCheck={false}
        value={identifier}
        onChange={(event) => setIdentifier(event.target.value)}
        required
        autoFocus
      />
      <label htmlFor="password">Password</label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        required
      />
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="primary-action" type="submit" disabled={pending}>
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
