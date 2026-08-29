"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";

type RefreshResult = {
  changed?: boolean;
  usersChanged?: boolean;
  visitorsChanged?: boolean;
  recovered?: boolean;
};

export function AdminInventoryRefresh() {
  const router = useRouter();
  const [, startTransition] = useTransition();

  useEffect(() => {
    let cancelled = false;
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;

    async function refresh() {
      try {
        const response = await fetch("/api/admin/inventory/refresh", { method: "POST" });
        const result = await response.json() as RefreshResult;
        if (cancelled || !response.ok || (!result.changed && !result.recovered)) return;

        const root = document.documentElement;
        if (result.usersChanged) root.classList.add("admin-users-refreshed");
        if (result.visitorsChanged) root.classList.add("admin-visitors-refreshed");
        startTransition(() => router.refresh());
        cleanupTimer = setTimeout(() => {
          root.classList.remove("admin-users-refreshed", "admin-visitors-refreshed");
        }, 1_600);
      } catch {
        // The last successful snapshot remains authoritative when UniFi is unavailable.
      }
    }

    void refresh();
    return () => {
      cancelled = true;
      if (cleanupTimer) clearTimeout(cleanupTimer);
      document.documentElement.classList.remove("admin-users-refreshed", "admin-visitors-refreshed");
    };
  }, [router]);

  return null;
}
