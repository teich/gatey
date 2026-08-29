"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function SyncAccessButton() {
  const router = useRouter();
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  async function sync() {
    setWorking(true);
    setError("");
    try {
      const response = await fetch("/api/admin/access/sync", { method: "POST" });
      const body = await response.json() as { error?: string };
      if (!response.ok) throw new Error(body.error || "Access history could not be synchronized.");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Access history could not be synchronized.");
    } finally {
      setWorking(false);
    }
  }

  return <div className="flex flex-col items-end gap-2"><Button size="lg" type="button" disabled={working} onClick={() => void sync()}>{working ? "Syncing…" : "Sync now"}</Button>{error ? <span className="max-w-sm text-right text-xs text-destructive">{error}</span> : null}</div>;
}
