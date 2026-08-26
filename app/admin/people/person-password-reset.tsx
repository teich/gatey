"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

export function PersonPasswordReset({ personId, personName }: { personId: string; personName: string }) {
  const [open, setOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [welcome, setWelcome] = useState<string>();
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();

  function close() {
    if (working) return;
    setOpen(false);
    setWelcome(undefined);
    setCopied(false);
    setError(undefined);
  }

  async function resetPassword() {
    setWorking(true);
    setError(undefined);
    try {
      const response = await fetch(`/api/admin/people/${encodeURIComponent(personId)}/reset-password`, { method: "POST" });
      const result = await response.json() as { error?: string; welcomeMessage?: string };
      if (!response.ok || !result.welcomeMessage) throw new Error(result.error || "Could not reset this password.");
      setWelcome(result.welcomeMessage);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not reset this password.");
    } finally {
      setWorking(false);
    }
  }

  async function copyWelcome() {
    if (!welcome) return;
    await navigator.clipboard.writeText(welcome);
    setCopied(true);
  }

  return <>
    <Button variant="outline" onClick={() => setOpen(true)}>Reset login</Button>
    {open ? <div className="dialog-backdrop" role="presentation"><section className="dialog admin-assignment-dialog" role="dialog" aria-modal="true" aria-labelledby={`reset-${personId}`}>
      <p className="eyebrow">Gatey account</p>
      <h2 id={`reset-${personId}`}>Reset {personName}&apos;s login?</h2>
      {welcome ? <>
        <p>The old password no longer works. Copy this welcome message now—the new temporary password is only shown here.</p>
        <textarea className="admin-welcome-message" value={welcome} readOnly aria-label="Welcome message" />
        <div className="dialog-actions"><Button size="lg" onClick={() => void copyWelcome()}>{copied ? "Message copied" : "Copy message"}</Button><Button size="lg" variant="outline" onClick={close}>Done</Button></div>
      </> : <>
        <p>This replaces the current password with a new temporary one. Any existing signed-in devices remain signed in.</p>
        {error ? <p className="form-error" role="alert">{error}</p> : null}
        <div className="dialog-actions"><Button size="lg" onClick={() => void resetPassword()} disabled={working}>{working ? "Resetting…" : "Generate temporary password"}</Button><Button size="lg" variant="outline" onClick={close} disabled={working}>Cancel</Button></div>
      </>}
    </section></div> : null}
  </>;
}
