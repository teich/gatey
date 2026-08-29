"use client";

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  CAMERA_VIEWS,
  defaultPartyEnd,
  type CameraRefresh,
  type CameraView,
  type GateState,
  type PartyMode,
} from "@/app/resident/model";
import { dateFromGateyTimeInput, gateyTimeInputValue } from "@/lib/date-time";

export function useGate() {
  const [state, setState] = useState<GateState>("unknown");
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/gate", { cache: "no-store" });
      const payload = await response.json() as { state?: GateState; error?: string };
      if (!response.ok || !payload.state) throw new Error(payload.error || "Gate status is unavailable.");
      setState(payload.state);
      setError("");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gate status is unavailable.");
      throw caught;
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Gate status is unavailable.")), 0);
    const timer = window.setInterval(() => void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Gate status is unavailable.")), 5_000);
    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(timer);
    };
  }, [refresh]);

  const open = useCallback(async () => {
    if (state !== "closed" || opening) return;
    setOpening(true);
    setError("");
    try {
      const response = await fetch("/api/gate", { method: "POST" });
      const payload = await response.json() as { state?: GateState; error?: string };
      if (!response.ok || !payload.state) throw new Error(payload.error || "Gate could not be opened. Try again.");
      setState(payload.state);
      window.setTimeout(() => void refresh().catch((caught) => setError(caught instanceof Error ? caught.message : "Gate status is unavailable.")), 1_200);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Gate could not be opened. Try again.");
    } finally {
      setOpening(false);
    }
  }, [opening, refresh, state]);

  return { state, opening, error, refresh, open };
}

export function useCameraSnapshots(configured: boolean) {
  const [updatedAt, setUpdatedAt] = useState(() => new Date());
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const [expanded, setExpanded] = useState<CameraView | null>(null);
  const refreshState = useRef<CameraRefresh>({ revision: 0, pending: new Set(CAMERA_VIEWS), loaded: false, refreshing: false });
  const refreshTimer = useRef<number | undefined>(undefined);

  const refresh = useCallback(() => {
    if (!configured || refreshState.current.refreshing) return;
    const nextRevision = refreshState.current.revision + 1;
    refreshState.current = { revision: nextRevision, pending: new Set(CAMERA_VIEWS), loaded: false, refreshing: true };
    setRefreshing(true);
    setRevision(nextRevision);
    window.clearTimeout(refreshTimer.current);
    refreshTimer.current = window.setTimeout(() => {
      if (refreshState.current.revision !== nextRevision) return;
      refreshState.current.refreshing = false;
      setRefreshing(false);
    }, 20_000);
  }, [configured]);

  const settled = useCallback((camera: CameraView, settledRevision: number, loaded: boolean) => {
    const current = refreshState.current;
    if (current.revision !== settledRevision || !current.pending.has(camera)) return;
    current.pending.delete(camera);
    current.loaded ||= loaded;
    if (current.pending.size > 0) return;
    if (current.loaded) setUpdatedAt(new Date());
    current.refreshing = false;
    window.clearTimeout(refreshTimer.current);
    setRefreshing(false);
  }, []);

  useEffect(() => () => window.clearTimeout(refreshTimer.current), []);
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) refresh();
    }, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);

  return { updatedAt, refreshing, revision, expanded, setExpanded, refresh, settled };
}

export function usePartyMode() {
  const [party, setParty] = useState<PartyMode | null>(null);
  const [canEnd, setCanEnd] = useState(false);
  const [pending, setPending] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [startChoice, setStartChoice] = useState<"now" | "later">("now");
  const [startTime, setStartTime] = useState(() => gateyTimeInputValue(new Date(Date.now() + 30 * 60_000)));
  const [endTime, setEndTime] = useState(() => gateyTimeInputValue(defaultPartyEnd()));
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const refresh = useCallback(async () => {
    try {
      const response = await fetch("/api/party-mode", { cache: "no-store" });
      const payload = await response.json() as { party?: PartyMode | null; canEnd?: boolean; error?: string };
      if (!response.ok) throw new Error(payload.error || "Party mode is unavailable.");
      setParty(payload.party || null);
      setCanEnd(Boolean(payload.canEnd));
      setLoadError("");
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Party mode is unavailable.");
      throw caught;
    }
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => void refresh().catch((caught) => setLoadError(caught instanceof Error ? caught.message : "Party mode is unavailable.")), 0);
    const timer = window.setInterval(() => void refresh().catch((caught) => setLoadError(caught instanceof Error ? caught.message : "Party mode is unavailable.")), 15_000);
    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(timer);
    };
  }, [refresh]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const openDialog = useCallback(() => {
    setStartChoice("now");
    setStartTime(gateyTimeInputValue(new Date(Date.now() + 30 * 60_000)));
    setEndTime(gateyTimeInputValue(defaultPartyEnd()));
    setError("");
    setDialogOpen(true);
  }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = startChoice === "now" ? new Date() : dateFromGateyTimeInput(startTime);
    const endsAt = dateFromGateyTimeInput(endTime);
    if (startChoice === "later" && startsAt <= new Date()) {
      setError("Choose a start time later today.");
      return;
    }
    if (endsAt <= startsAt) {
      setError("The closing time must be after the starting time.");
      return;
    }
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/party-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }) });
      const payload = await response.json() as { party?: PartyMode | null; canEnd?: boolean; error?: string };
      if (!response.ok || !payload.party) throw new Error(payload.error || "Party mode could not be enabled. Try again.");
      setParty(payload.party);
      setCanEnd(Boolean(payload.canEnd));
      setNow(Date.now());
      setDialogOpen(false);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Party mode could not be enabled. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function end() {
    if (pending) return;
    setPending(true);
    setLoadError("");
    try {
      const response = await fetch("/api/party-mode", { method: "DELETE" });
      const payload = await response.json() as { error?: string };
      if (!response.ok) throw new Error(payload.error || "Party mode could not be ended. Try again.");
      setParty(null);
      setCanEnd(false);
      setNow(Date.now());
    } catch (caught) {
      setLoadError(caught instanceof Error ? caught.message : "Party mode could not be ended. Try again.");
    } finally {
      setPending(false);
    }
  }

  return { party, canEnd, pending, loadError, dialogOpen, setDialogOpen, startChoice, setStartChoice, startTime, setStartTime, endTime, setEndTime, error, now, setNow, refresh, openDialog, save, end };
}
