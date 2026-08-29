"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Copy,
  DoorOpen,
  House,
  KeyRound,
  LockKeyhole,
  LogOut,
  PartyPopper,
  Plus,
  Phone,
  RefreshCw,
  Settings,
  Share2,
  UsersRound,
  X,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import {
  dateFromGateyDateTimeInput,
  dateFromGateyTimeInput,
  formatGateyDateTime as formatInGateyTime,
  gateyDateKey,
  gateyDateTimeInputValue,
  gateyEndOfDay,
  gateyTimeInputValue,
  gateyYear,
  shiftGateyDateKey,
} from "@/lib/date-time";

type Duration = "today" | "week" | "custom";
type CodeState = "active" | "upcoming" | "expired" | "revoked";
type Screen = "gate" | "codes" | "more" | "create" | "success";
type GateState = "closed" | "opening" | "open" | "unknown";
type CameraView = "person" | "road";

const INSTALL_CARD_DISMISSED_KEY = "gatey.install-card-dismissed";

type GuestCode = {
  id: string;
  label: string;
  pin: string;
  startsAt: string;
  endsAt: string;
  revokedAt?: string;
  lastUsedAt?: string;
  lastUseKnown?: boolean;
  useCount?: number;
  usageWindowDays?: number;
  weeklyUses?: number[];
};

type PermanentCode = {
  id: string;
  label: string;
  pin: string;
  kind: "household" | "person";
  lastUsedAt?: string;
  lastUseKnown?: boolean;
  useCount?: number;
  usageWindowDays?: number;
  weeklyUses?: number[];
};

type GateCodeResponse = GuestCode & {
  kind: "home" | "ongoing" | "temporary";
  state: "active" | "disabled";
  controllerEndsAt: string;
};

type PartyMode = {
  state: "scheduled" | "active";
  startsAt: string;
  endsAt: string;
  householdId: string;
  householdName: string;
};

function getState(code: GuestCode, now = new Date()): CodeState {
  if (code.revokedAt) return "revoked";
  if (new Date(code.startsAt) > now) return "upcoming";
  if (new Date(code.endsAt) < now) return "expired";
  return "active";
}

function spacedPin(pin: string) {
  if (pin.length <= 4) return pin.split("").join(" ");
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

function formatDateTime(value: string, includeYear = false) {
  return formatInGateyTime(value, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  });
}

function formatTime(value: string | Date) {
  return formatInGateyTime(value, { hour: "numeric", minute: "2-digit" });
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}

function shouldShowInstallCard() {
  if (typeof window === "undefined") return false;
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  const installed = window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
  try {
    return !installed && localStorage.getItem(INSTALL_CARD_DISMISSED_KEY) !== "true";
  } catch {
    return !installed;
  }
}

function codeTiming(code: GuestCode, state: CodeState) {
  if (state === "revoked") return `Canceled ${formatDateTime(code.revokedAt!, true)}`;
  if (state === "expired") return `Ended ${formatDateTime(code.endsAt, true)}`;
  if (state === "upcoming") return `Starts ${formatDateTime(code.startsAt, true)}`;

  const today = new Date();
  return gateyDateKey(code.endsAt) === gateyDateKey(today)
    ? `Works until ${formatTime(code.endsAt)} today`
    : `Works until ${formatDateTime(code.endsAt, gateyYear(code.endsAt) !== gateyYear(today))}`;
}

function codeLastUsed(code: Pick<GuestCode, "lastUsedAt" | "lastUseKnown">) {
  if (code.lastUseKnown === false) return "Last use unavailable";
  if (!code.lastUsedAt) return "Not used yet";
  const today = new Date();
  if (gateyDateKey(code.lastUsedAt) === gateyDateKey(today)) return `Used today at ${formatTime(code.lastUsedAt)}`;
  if (gateyDateKey(code.lastUsedAt) === shiftGateyDateKey(today, -1)) return `Used yesterday at ${formatTime(code.lastUsedAt)}`;
  return `Used ${formatDateTime(code.lastUsedAt, gateyYear(code.lastUsedAt) !== gateyYear(today))}`;
}

function codeUsage(code: Pick<GuestCode, "useCount" | "usageWindowDays" | "lastUseKnown">) {
  if (code.lastUseKnown === false) return "Usage history is syncing";
  const count = code.useCount || 0;
  const days = code.usageWindowDays || 90;
  return `${count} successful ${count === 1 ? "use" : "uses"} in ${days} days`;
}

function UsageBars({ values = [] }: { values?: number[] }) {
  const max = Math.max(1, ...values);
  return <span className="resident-usage-bars" aria-label="Weekly usage over the last eight weeks">{values.map((value, index) => <i key={index} style={{ height: `${Math.max(12, Math.round((value / max) * 100))}%` }} title={`${value} uses`} />)}</span>;
}

function defaultPartyEnd() {
  const now = Date.now();
  const nextHalfHour = Math.ceil(now / (30 * 60_000)) * 30 * 60_000;
  const result = new Date(nextHalfHour + 3 * 60 * 60_000);
  const end = gateyEndOfDay(now);
  return result > end ? end : result;
}

function partyPhase(party: PartyMode | null) {
  return party?.state || "off";
}

function countdown(until: string, now: number) {
  const minutes = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min remaining`;
  if (!remainingMinutes) return `${hours} ${hours === 1 ? "hour" : "hours"} remaining`;
  return `${hours} hr ${remainingMinutes} min remaining`;
}

function GuestCodeCard({
  code,
  onCopy,
  onShare,
  onCancel,
  copied,
}: {
  code: GuestCode;
  onCopy: (code: GuestCode) => void;
  onShare: (code: GuestCode) => void;
  onCancel?: (code: GuestCode) => void;
  copied: boolean;
}) {
  const state = getState(code);
  const stateText = state === "active" ? "Works now" : state === "upcoming" ? "Scheduled" : state === "revoked" ? "Canceled" : "Expired";

  return (
    <article className={`resident-guest-card resident-guest-${state}`}>
      <div className="resident-guest-heading">
        <div>
          <h3>{code.label || "Guest"}</h3>
          <p className={`resident-code-status resident-code-status-${state}`}><span aria-hidden="true" />{stateText}</p>
        </div>
        <p className="resident-small-pin" aria-label={`Gate code ${code.pin.split("").join(" ")}`}>{spacedPin(code.pin)}</p>
      </div>
      <p className="resident-code-timing">{codeTiming(code, state)}</p>
      <div className="resident-code-usage"><span><strong>{codeUsage(code)}</strong><small>{codeLastUsed(code)}</small></span><UsageBars values={code.weeklyUses} /></div>
      <div className="resident-card-actions">
        <button type="button" onClick={() => onCopy(code)}><Copy aria-hidden="true" />{copied ? "Copied" : "Copy"}</button>
        <button type="button" onClick={() => onShare(code)}><Share2 aria-hidden="true" />Share</button>
        {onCancel ? <button className="resident-cancel-link" type="button" onClick={() => onCancel(code)}>Cancel</button> : null}
      </div>
    </article>
  );
}

function GuestCodeSummaryCard({ code, onOpen }: { code: GuestCode; onOpen: () => void }) {
  return <button className="resident-guest-summary-card" type="button" onClick={onOpen}>
    <span><strong>{code.label || "Guest"}</strong><small>{codeUsage(code)} · {codeLastUsed(code)}</small></span>
    <b aria-label={`Gate code ${code.pin.split("").join(" ")}`}>{spacedPin(code.pin)}</b>
    <ChevronRight aria-hidden="true" />
  </button>;
}

function CameraSnapshot({
  camera,
  label,
  revision,
  configured,
}: {
  camera: CameraView;
  label: string;
  revision: number;
  configured: boolean;
}) {
  if (!configured) return null;

  return <CameraSnapshotImage key={`${camera}-${revision}`} camera={camera} label={label} revision={revision} />;
}

function CameraSnapshotImage({ camera, label, revision }: { camera: CameraView; label: string; revision: number }) {
  const [available, setAvailable] = useState(true);

  if (!available) return <em className="resident-camera-unavailable">Camera unavailable</em>;

  // This same-origin image request carries the resident's session cookie; Next's image optimizer cannot.
  // eslint-disable-next-line @next/next/no-img-element
  return <img className="resident-camera-image" src={`/api/cameras/${camera}/snapshot?refresh=${revision}`} alt={`Latest ${label.toLowerCase()} camera snapshot`} onError={() => setAvailable(false)} />;
}

export function ResidentHome({
  householdName,
  userName,
  isSystemAdmin,
  camerasConfigured,
  gatePhoneNumber,
}: {
  householdName: string;
  userName: string;
  isSystemAdmin: boolean;
  camerasConfigured: boolean;
  gatePhoneNumber: string;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("gate");
  const [guestCodes, setGuestCodes] = useState<GuestCode[]>([]);
  const [permanentCodes, setPermanentCodes] = useState<PermanentCode[]>([]);
  const [ready, setReady] = useState(false);
  const [gateState, setGateState] = useState<GateState>("unknown");
  const [gateOpening, setGateOpening] = useState(false);
  const [gateError, setGateError] = useState("");
  const [cameraUpdatedAt, setCameraUpdatedAt] = useState(() => new Date());
  const [cameraRefreshing, setCameraRefreshing] = useState(false);
  const [cameraRevision, setCameraRevision] = useState(0);
  const [expandedCamera, setExpandedCamera] = useState<CameraView | null>(null);
  const [party, setParty] = useState<PartyMode | null>(null);
  const [partyCanEnd, setPartyCanEnd] = useState(false);
  const [partyPending, setPartyPending] = useState(false);
  const [partyLoadError, setPartyLoadError] = useState("");
  const [partyDialogOpen, setPartyDialogOpen] = useState(false);
  const [partyStartChoice, setPartyStartChoice] = useState<"now" | "later">("now");
  const [partyStartTime, setPartyStartTime] = useState(() => gateyTimeInputValue(new Date(Date.now() + 30 * 60_000)));
  const [partyEndTime, setPartyEndTime] = useState(() => gateyTimeInputValue(defaultPartyEnd()));
  const [partyError, setPartyError] = useState("");
  const [now, setNow] = useState(() => Date.now());

  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState<Duration>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [createdCode, setCreatedCode] = useState<GuestCode | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GuestCode | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [error, setError] = useState("");

  const [codeDialog, setCodeDialog] = useState<"household" | "person" | null>(null);
  const [codeTargetId, setCodeTargetId] = useState("");
  const [codeName, setCodeName] = useState("");
  const [codePin, setCodePin] = useState("");
  const [codeError, setCodeError] = useState("");
  const [previewNotice, setPreviewNotice] = useState("");
  const [showInstallCard, setShowInstallCard] = useState(shouldShowInstallCard);

  const [passwordDialogOpen, setPasswordDialogOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [passwordSuccess, setPasswordSuccess] = useState("");
  const [passwordPending, setPasswordPending] = useState(false);

  useEffect(() => {
    fetch("/api/gate-codes")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your gate codes.");
        return response.json() as Promise<{ codes: GateCodeResponse[] }>;
      })
      .then(({ codes }) => {
        setGuestCodes(codes.filter((code) => code.kind === "temporary"));
        setPermanentCodes(codes.filter((code) => code.kind !== "temporary" && code.state === "active").map((code) => ({ ...code, kind: code.kind === "home" ? "household" : "person" })));
      })
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load your gate codes."))
      .finally(() => setReady(true));
  }, []);

  const refreshGate = useCallback(async () => {
    const response = await fetch("/api/gate", { cache: "no-store" });
    const payload = await response.json() as { state?: GateState; error?: string };
    if (!response.ok || !payload.state) throw new Error(payload.error || "Gate status is unavailable.");
    setGateState(payload.state);
    setGateError("");
  }, []);

  useEffect(() => {
    const fetchInitialStatus = window.setTimeout(() => {
      void refreshGate().catch((caught) => setGateError(caught instanceof Error ? caught.message : "Gate status is unavailable."));
    }, 0);
    const timer = window.setInterval(() => {
      void refreshGate().catch((caught) => setGateError(caught instanceof Error ? caught.message : "Gate status is unavailable."));
    }, 5_000);
    return () => {
      window.clearTimeout(fetchInitialStatus);
      window.clearInterval(timer);
    };
  }, [refreshGate]);

  const refreshParty = useCallback(async () => {
    const response = await fetch("/api/party-mode", { cache: "no-store" });
    const payload = await response.json() as { party?: PartyMode | null; canEnd?: boolean; error?: string };
    if (!response.ok) throw new Error(payload.error || "Party mode is unavailable.");
    setParty(payload.party || null);
    setPartyCanEnd(Boolean(payload.canEnd));
    setPartyLoadError("");
  }, []);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void refreshParty().catch((caught) => setPartyLoadError(caught instanceof Error ? caught.message : "Party mode is unavailable."));
    }, 0);
    const timer = window.setInterval(() => {
      void refreshParty().catch((caught) => setPartyLoadError(caught instanceof Error ? caught.message : "Party mode is unavailable."));
    }, 15_000);
    return () => {
      window.clearTimeout(initialFetch);
      window.clearInterval(timer);
    };
  }, [refreshParty]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    function hideAfterInstall() {
      setShowInstallCard(false);
    }

    window.addEventListener("appinstalled", hideAfterInstall);
    return () => window.removeEventListener("appinstalled", hideAfterInstall);
  }, []);

  const grouped = useMemo(() => {
    const active: GuestCode[] = [];
    const upcoming: GuestCode[] = [];
    const past: GuestCode[] = [];
    guestCodes.forEach((code) => {
      const state = getState(code);
      if (state === "active") active.push(code);
      else if (state === "upcoming") upcoming.push(code);
      else past.push(code);
    });
    return { active, upcoming, past };
  }, [guestCodes]);

  const householdCode = permanentCodes.find((code) => code.kind === "household");
  const personalCodes = permanentCodes.filter((code) => code.kind === "person");
  const currentPartyPhase = partyPhase(party);

  function refreshCameras() {
    if (cameraRefreshing) return;
    setCameraRefreshing(true);
    setCameraRevision((revision) => revision + 1);
    window.setTimeout(() => {
      setCameraUpdatedAt(new Date());
      setCameraRefreshing(false);
    }, 700);
  }

  async function openGate() {
    if (gateState !== "closed" || gateOpening) return;
    setGateOpening(true);
    setGateError("");
    try {
      const response = await fetch("/api/gate", { method: "POST" });
      const payload = await response.json() as { state?: GateState; error?: string };
      if (!response.ok || !payload.state) throw new Error(payload.error || "Gate could not be opened. Try again.");
      setGateState(payload.state);
      window.setTimeout(() => void refreshGate().catch((caught) => setGateError(caught instanceof Error ? caught.message : "Gate status is unavailable.")), 1_200);
    } catch (caught) {
      setGateError(caught instanceof Error ? caught.message : "Gate could not be opened. Try again.");
    } finally {
      setGateOpening(false);
    }
  }

  function openPartyDialog() {
    const later = new Date(Date.now() + 30 * 60_000);
    setPartyStartChoice("now");
    setPartyStartTime(gateyTimeInputValue(later));
    setPartyEndTime(gateyTimeInputValue(defaultPartyEnd()));
    setPartyError("");
    setPartyDialogOpen(true);
  }

  async function saveParty(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const startsAt = partyStartChoice === "now" ? new Date() : dateFromGateyTimeInput(partyStartTime);
    const endsAt = dateFromGateyTimeInput(partyEndTime);
    if (partyStartChoice === "later" && startsAt <= new Date()) {
      setPartyError("Choose a start time later today.");
      return;
    }
    if (endsAt <= startsAt) {
      setPartyError("The closing time must be after the starting time.");
      return;
    }
    setPartyPending(true);
    setPartyError("");
    try {
      const response = await fetch("/api/party-mode", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }) });
      const payload = await response.json() as { party?: PartyMode | null; canEnd?: boolean; error?: string };
      if (!response.ok || !payload.party) throw new Error(payload.error || "Party mode could not be enabled. Try again.");
      setParty(payload.party);
      setPartyCanEnd(Boolean(payload.canEnd));
      setNow(Date.now());
      setPartyDialogOpen(false);
    } catch (caught) {
      setPartyError(caught instanceof Error ? caught.message : "Party mode could not be enabled. Try again.");
    } finally {
      setPartyPending(false);
    }
  }

  async function endParty() {
    if (partyPending) return;
    setPartyPending(true);
    setPartyLoadError("");
    try {
      const response = await fetch("/api/party-mode", { method: "DELETE" });
      const payload = await response.json() as { party?: PartyMode | null; error?: string };
      if (!response.ok) throw new Error(payload.error || "Party mode could not be ended. Try again.");
      setParty(null);
      setPartyCanEnd(false);
      setNow(Date.now());
    } catch (caught) {
      setPartyLoadError(caught instanceof Error ? caught.message : "Party mode could not be ended. Try again.");
    } finally {
      setPartyPending(false);
    }
  }

  function openCreate() {
    const current = new Date();
    setLabel("");
    setDuration("today");
    setCustomStart(gateyDateTimeInputValue(current));
    setCustomEnd(gateyDateTimeInputValue(gateyEndOfDay(current)));
    setError("");
    setScreen("create");
  }

  function dismissInstallCard() {
    setShowInstallCard(false);
    try {
      localStorage.setItem(INSTALL_CARD_DISMISSED_KEY, "true");
    } catch {
      // The card still stays dismissed for this page view when storage is unavailable.
    }
  }

  async function createCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const current = new Date();
    let startsAt = current;
    let endsAt = gateyEndOfDay(current);

    if (duration === "week") endsAt = gateyEndOfDay(current, 6);
    if (duration === "custom") {
      startsAt = dateFromGateyDateTimeInput(customStart);
      endsAt = dateFromGateyDateTimeInput(customEnd);
      if (!customStart || !customEnd || Number.isNaN(startsAt.valueOf()) || Number.isNaN(endsAt.valueOf())) {
        setError("Choose both a start and end time.");
        return;
      }
      if (endsAt <= startsAt) {
        setError("The end time needs to be after the start time.");
        return;
      }
    }

    try {
      const response = await fetch("/api/gate-codes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "Guest", kind: "temporary", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }),
      });
      const result = await response.json() as { code?: GuestCode; error?: string };
      if (!response.ok || !result.code) throw new Error(result.error || "Could not create the guest code.");
      setGuestCodes((currentCodes) => [result.code!, ...currentCodes]);
      setCreatedCode(result.code);
      setScreen("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the code.");
    }
  }

  async function copyCode(code: GuestCode | PermanentCode) {
    await navigator.clipboard.writeText(code.pin);
    setCopiedId(code.id);
  }

  async function shareCode(code: GuestCode) {
    const message = `${code.label}'s Bennett Valley Gate code is ${spacedPin(code.pin)}. ${codeTiming(code, getState(code))}.`;
    if (navigator.share) {
      try {
        await navigator.share({ title: "Bennett Valley Gate code", text: message });
      } catch {
        // The share sheet was dismissed.
      }
    } else {
      await navigator.clipboard.writeText(message);
      setCopiedId(code.id);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    try {
      const response = await fetch(`/api/gate-codes/${cancelTarget.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not cancel the guest code.");
      setGuestCodes((current) => current.map((code) => code.id === cancelTarget.id ? { ...code, revokedAt: new Date().toISOString() } : code));
      setCancelTarget(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel the guest code.");
      setCancelTarget(null);
    }
  }

  function openHouseCodeDialog() {
    setCodeDialog("household");
    setCodeTargetId(householdCode?.id || "");
    setCodeName(`${householdName} gate code`);
    setCodePin(householdCode?.pin || "");
    setCodeError("");
  }

  function openPersonCodeDialog() {
    setCodeDialog("person");
    setCodeTargetId("");
    setCodeName("");
    setCodePin("");
    setCodeError("");
  }

  async function savePermanentCode(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (codeDialog === "person" && !codeName.trim()) {
      setCodeError("Enter the person’s name.");
      return;
    }
    if (!/^\d{4,6}$/.test(codePin)) {
      setCodeError("Use 4 to 6 numbers.");
      return;
    }
    if (permanentCodes.some((code) => code.pin === codePin && code.id !== codeTargetId)) {
      setCodeError("That code is already being used. Please choose another.");
      return;
    }
    try {
      if (codeDialog === "household" && codeTargetId) {
        const response = await fetch(`/api/gate-codes/${codeTargetId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: `${householdName} gate code`, pin: codePin }) });
        const result = await response.json() as { code?: PermanentCode; error?: string };
        if (!response.ok || !result.code) throw new Error(result.error || "Could not change the home code.");
        setPermanentCodes((current) => current.map((code) => code.id === codeTargetId ? { ...result.code!, kind: "household" } : code));
      } else {
        const isHome = codeDialog === "household";
        const response = await fetch("/api/gate-codes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ label: isHome ? `${householdName} gate code` : codeName.trim(), pin: codePin, kind: isHome ? "home" : "ongoing" }) });
        const result = await response.json() as { code?: PermanentCode; error?: string };
        if (!response.ok || !result.code) throw new Error(result.error || "Could not save this gate code.");
        setPermanentCodes((current) => [...current, { ...result.code!, kind: isHome ? "household" : "person" }]);
      }
      setPreviewNotice(codeDialog === "household" ? "Home gate code saved." : `${codeName.trim()} was added.`);
      setCodeDialog(null);
    } catch (caught) {
      setCodeError(caught instanceof Error ? caught.message : "Could not save this gate code.");
    }
  }

  async function signOut() {
    await authClient.signOut();
    router.replace("/sign-in");
    router.refresh();
  }

  function openPasswordDialog() {
    setCurrentPassword("");
    setNewPassword("");
    setPasswordConfirmation("");
    setPasswordError("");
    setPasswordSuccess("");
    setPasswordDialogOpen(true);
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPasswordError("");
    setPasswordSuccess("");
    if (newPassword.length < 8) {
      setPasswordError("Your new password must be at least 8 characters.");
      return;
    }
    if (newPassword !== passwordConfirmation) {
      setPasswordError("Your new password and confirmation do not match.");
      return;
    }

    setPasswordPending(true);
    try {
      const result = await authClient.changePassword({ currentPassword, newPassword, revokeOtherSessions: true });
      if (result.error) {
        setPasswordError(result.error.message || "Could not change your password.");
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setPasswordConfirmation("");
      setPasswordSuccess("Password changed. Your other devices have been signed out.");
    } catch {
      setPasswordError("Could not change your password. Check your connection and try again.");
    } finally {
      setPasswordPending(false);
    }
  }

  function renderFlowHeader(title: string, backTo: Screen) {
    return (
      <header className="resident-flow-header">
        <button type="button" onClick={() => setScreen(backTo)} aria-label={`Back to ${backTo}`}><ArrowLeft aria-hidden="true" /></button>
        <strong>{title}</strong>
        <span />
      </header>
    );
  }

  if (screen === "create") {
    const weekEnd = gateyEndOfDay(new Date(), 6);
    return (
      <main className="resident-shell resident-flow-shell">
        {renderFlowHeader("Create guest code", "codes")}
        <form className="resident-create-form" onSubmit={createCode}>
          <div className="resident-flow-intro"><p className="resident-kicker">New guest</p><h1>Who is this for?</h1><p>A name helps everyone at home recognize the code later.</p></div>
          <label className="resident-field-label" htmlFor="guest-name">Guest name <span>Optional</span></label>
          <input id="guest-name" className="resident-input" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Susan, gardener, delivery…" autoFocus />

          <fieldset className="resident-duration-fieldset">
            <legend>How long should it work?</legend>
            <div className="resident-duration-options">
              <label className={duration === "today" ? "selected" : ""}><input type="radio" name="duration" checked={duration === "today"} onChange={() => setDuration("today")} /><strong>Today</strong><span>Until midnight</span></label>
              <label className={duration === "week" ? "selected" : ""}><input type="radio" name="duration" checked={duration === "week"} onChange={() => setDuration("week")} /><strong>7 days</strong><span>Through {formatInGateyTime(weekEnd, { weekday: "long" })}</span></label>
              <label className={duration === "custom" ? "selected" : ""}><input type="radio" name="duration" checked={duration === "custom"} onChange={() => setDuration("custom")} /><strong>Choose dates</strong><span>Exact times</span></label>
            </div>
          </fieldset>

          {duration === "custom" ? <div className="resident-custom-dates"><label>Starts<input type="datetime-local" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label><label>Ends<input type="datetime-local" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label></div> : null}
          {error ? <p className="resident-form-error" role="alert">{error}</p> : null}
          <button className="resident-primary-button resident-form-submit" type="submit">Create guest code</button>
          <p className="resident-form-note">The code will be created at the gate and saved here for your household.</p>
        </form>
      </main>
    );
  }

  if (screen === "success" && createdCode) {
    return (
      <main className="resident-shell resident-success-shell">
        <div className="resident-success-mark"><Check aria-hidden="true" /></div>
        <p className="resident-kicker">Ready to use</p>
        <h1>{createdCode.label}&apos;s code is ready</h1>
        <p>{codeTiming(createdCode, getState(createdCode))}</p>
        <div className="resident-success-pin" aria-label={`Gate code ${createdCode.pin.split("").join(" ")}`}>{spacedPin(createdCode.pin)}</div>
        <div className="resident-success-actions"><button className="resident-primary-button" type="button" onClick={() => shareCode(createdCode)}><Share2 aria-hidden="true" />Share code</button><button className="resident-secondary-button" type="button" onClick={() => copyCode(createdCode)}><Copy aria-hidden="true" />{copiedId === createdCode.id ? "Copied" : "Copy code"}</button></div>
        <p className="resident-success-note">You can always find this code in Codes.</p>
        <button className="resident-text-button" type="button" onClick={() => setScreen("codes")}>Done</button>
      </main>
    );
  }

  const gateLabel = gateState === "opening" || gateOpening ? "Gate is opening" : gateState === "open" ? "Gate is open" : gateState === "closed" ? "Gate is closed" : "Checking gate…";

  return (
    <main className="resident-shell">
      <header className="resident-topbar">
        <div className="resident-brand"><Image src="/gatey-icon-192.png" alt="" width={48} height={48} priority /><div><p>Gatey</p><h1>{householdName}</h1></div></div>
      </header>

      {previewNotice ? <div className="resident-toast" role="status"><Check aria-hidden="true" /><span>{previewNotice}</span><button type="button" onClick={() => setPreviewNotice("")} aria-label="Dismiss"><X aria-hidden="true" /></button></div> : null}

      {screen === "gate" ? <>
        <section className="resident-section resident-camera-section" aria-label="Gate camera snapshots">
          <div className="resident-camera-grid">
            <button className="resident-camera" type="button" onClick={() => setExpandedCamera("person")} aria-label="Enlarge person camera snapshot"><CameraSnapshot camera="person" label="Person" revision={cameraRevision} configured={camerasConfigured} /><span><Camera aria-hidden="true" />Person</span></button>
            <button className="resident-camera" type="button" onClick={() => setExpandedCamera("road")} aria-label="Enlarge road camera snapshot"><CameraSnapshot camera="road" label="Road" revision={cameraRevision} configured={camerasConfigured} /><span><Camera aria-hidden="true" />Road</span></button>
          </div>
          <div className="resident-camera-meta"><p className="resident-camera-time">Refreshed {formatTime(cameraUpdatedAt)}</p><button className="resident-refresh-button" type="button" onClick={refreshCameras} disabled={cameraRefreshing}><RefreshCw className={cameraRefreshing ? "spinning" : ""} aria-hidden="true" />{cameraRefreshing ? "Refreshing" : "Refresh"}</button></div>
        </section>

        <section className={`resident-gate-control resident-gate-${gateOpening ? "opening" : gateState}`} aria-labelledby="gate-state">
          <p className="resident-gate-state" id="gate-state"><span aria-hidden="true" />{gateLabel}</p>
          <button type="button" className="resident-open-button" onClick={() => void openGate()} disabled={gateState !== "closed" || gateOpening}>
            {gateState === "closed" && !gateOpening ? <LockKeyhole aria-hidden="true" /> : <DoorOpen aria-hidden="true" />}
            <span>{gateState === "closed" && !gateOpening ? "Open gate" : gateState === "unknown" ? "Checking gate…" : gateState === "open" && !gateOpening ? "Gate is open" : "Opening…"}</span>
          </button>
          {gateError ? <p className="resident-gate-error" role="alert">{gateError}</p> : null}
        </section>

        {gatePhoneNumber || currentPartyPhase === "off" ? <div className={`resident-gate-tools${gatePhoneNumber && currentPartyPhase === "off" ? "" : " resident-gate-tools-single"}`}>
          {gatePhoneNumber ? <a className="resident-call-action" href={`tel:${gatePhoneNumber}`} aria-label={`Call Gatey at ${gatePhoneNumber}`}><Phone aria-hidden="true" /><span><small>Call-to-open</small><strong>{formatPhoneNumber(gatePhoneNumber)}</strong></span></a> : null}
          {currentPartyPhase === "off" ? <button className="resident-party-enable" type="button" onClick={openPartyDialog}><PartyPopper aria-hidden="true" /><span><small>Party mode</small><strong>Turn on</strong></span><ChevronRight aria-hidden="true" /></button> : null}
        </div> : null}

        {currentPartyPhase !== "off" ? <section className={`resident-party-card resident-party-${currentPartyPhase}`} aria-labelledby="party-title">
          <div className="resident-feature-icon"><PartyPopper aria-hidden="true" /></div>
          <div className="resident-feature-copy">
            <h2 id="party-title">Party mode</h2>
            {currentPartyPhase === "active" && party ? <><p>{party.householdName === householdName ? `Ends at ${formatTime(party.endsAt)}` : `${party.householdName} has the gate open until ${formatTime(party.endsAt)}`}</p><strong className="resident-countdown">{countdown(party.endsAt, now)}</strong></> : currentPartyPhase === "scheduled" && party ? <p>{party.householdName === householdName ? `Opens at ${formatTime(party.startsAt)} and ends at ${formatTime(party.endsAt)}.` : `${party.householdName} scheduled this until ${formatTime(party.endsAt)}.`}</p> : null}
          </div>
          {partyCanEnd ? <button className="resident-row-action resident-danger-action" type="button" disabled={partyPending} onClick={() => void endParty()}>{partyPending ? "Working…" : currentPartyPhase === "active" ? "End now" : "Cancel"}</button> : <span className="resident-party-in-use">In use</span>}
        </section> : null}
        {partyLoadError ? <p className="resident-party-error" role="status">{partyLoadError}</p> : null}

        <section className="resident-gate-guest-section" aria-labelledby="gate-guest-title">
          <div className="resident-section-title"><div><p className="resident-kicker">Household access</p><h2 id="gate-guest-title">Guest codes</h2></div><button className="resident-add-button" type="button" onClick={openCreate}><Plus aria-hidden="true" />Create</button></div>
          {!ready ? <p className="resident-loading">Finding your guest codes…</p> : grouped.active.length || grouped.upcoming.length ? <div className="resident-guest-summary-list">{[...grouped.active, ...grouped.upcoming].slice(0, 3).map((code) => <GuestCodeSummaryCard key={code.id} code={code} onOpen={() => setScreen("codes")} />)}</div> : <div className="resident-empty-compact"><Clock3 aria-hidden="true" /><span>No active guest codes.</span></div>}
          {grouped.active.length + grouped.upcoming.length > 3 ? <button className="resident-view-all-codes" type="button" onClick={() => setScreen("codes")}>See all guest codes</button> : null}
        </section>

        <button className="resident-code-summary" type="button" onClick={() => setScreen("codes")}>
          <span className="resident-feature-icon"><KeyRound aria-hidden="true" /></span>
          <span><small>Your code</small><strong>{householdName} gate code</strong><b>{householdCode ? spacedPin(householdCode.pin) : "Not set"}</b></span>
          <ChevronRight aria-hidden="true" />
        </button>
      </> : null}

      {screen === "codes" ? <section className="resident-page" aria-labelledby="codes-title">
        <div className="resident-page-heading"><p className="resident-kicker">Household access</p><h1 id="codes-title">Codes</h1><p>Everything your household uses to enter the gate.</p></div>

        <section className="resident-house-code" aria-labelledby="house-code-title">
          <div className="resident-section-title"><div><p className="resident-kicker">Shared by your household</p><h2 id="house-code-title">{householdName} gate code</h2></div><House aria-hidden="true" /></div>
          <p className="resident-large-pin" aria-label={householdCode ? `Gate code ${householdCode.pin.split("").join(" ")}` : "No household gate code"}>{householdCode ? spacedPin(householdCode.pin) : "Not set"}</p>
          {householdCode ? <div className="resident-code-usage resident-house-usage"><span><strong>{codeUsage(householdCode)}</strong><small>{codeLastUsed(householdCode)}</small></span><UsageBars values={householdCode.weeklyUses} /></div> : null}
          <button className="resident-secondary-button" type="button" onClick={openHouseCodeDialog}>{householdCode ? "Change gate code" : "Set gate code"}</button>
        </section>

        <section className="resident-code-section" aria-labelledby="permanent-title">
          <div className="resident-section-title"><div><p className="resident-kicker">Always works</p><h2 id="permanent-title">Ongoing codes</h2></div><button className="resident-add-button" type="button" onClick={openPersonCodeDialog}><Plus aria-hidden="true" />Add code</button></div>
          {personalCodes.length ? <div className="resident-permanent-list">{personalCodes.map((code) => <article key={code.id}><span className="resident-person-mark">{code.label.slice(0, 1).toUpperCase()}</span><div><h3>{code.label}</h3><p>{codeUsage(code)}</p><small>{codeLastUsed(code)}</small></div><UsageBars values={code.weeklyUses} /><strong>{spacedPin(code.pin)}</strong></article>)}</div> : <div className="resident-empty-compact"><UsersRound aria-hidden="true" /><span>No ongoing codes yet.</span></div>}
        </section>

        <section className="resident-code-section" aria-labelledby="guest-title">
          <div className="resident-section-title"><div><p className="resident-kicker">Ends automatically</p><h2 id="guest-title">Guest codes</h2></div><button className="resident-add-button" type="button" onClick={openCreate}><Plus aria-hidden="true" />Create code</button></div>
          {!ready ? <p className="resident-loading">Finding your guest codes…</p> : <>
            {grouped.active.length || grouped.upcoming.length ? <div className="resident-guest-list">{[...grouped.active, ...grouped.upcoming].map((code) => <GuestCodeCard key={code.id} code={code} copied={copiedId === code.id} onCopy={copyCode} onShare={shareCode} onCancel={setCancelTarget} />)}</div> : <div className="resident-empty-compact"><Clock3 aria-hidden="true" /><span>No active guest codes.</span></div>}
            {grouped.past.length ? <><button className="resident-past-toggle" type="button" onClick={() => setPastOpen((open) => !open)} aria-expanded={pastOpen}><span>Past codes ({grouped.past.length})</span><ChevronDown className={pastOpen ? "rotated" : ""} aria-hidden="true" /></button>{pastOpen ? <div className="resident-guest-list resident-past-list">{grouped.past.map((code) => <GuestCodeCard key={code.id} code={code} copied={copiedId === code.id} onCopy={copyCode} onShare={shareCode} />)}</div> : null}</> : null}
          </>}
          {error ? <p className="resident-form-error" role="alert">{error}</p> : null}
        </section>
      </section> : null}

      {screen === "more" ? <section className="resident-page" aria-labelledby="more-title">
        <div className="resident-page-heading"><p className="resident-kicker">Gatey</p><h1 id="more-title">More</h1><p>Phone setup and account settings.</p></div>
        {gatePhoneNumber ? <a className="resident-install-card" href={`tel:${gatePhoneNumber}`}><div className="resident-feature-icon"><Phone aria-hidden="true" /></div><div><p className="resident-kicker">Call-to-open</p><h2>{formatPhoneNumber(gatePhoneNumber)}</h2><p>Tap to call from your authorized phone number.</p></div></a> : null}
        {showInstallCard ? <section className="resident-install-card resident-home-screen-card"><div className="resident-feature-icon"><Plus aria-hidden="true" /></div><div><p className="resident-kicker">Faster next time</p><h2>Add Gatey to your home screen</h2><p>On iPhone, tap Share, then “Add to Home Screen.” On Android, open the browser menu and tap “Add to Home screen.”</p></div><button className="resident-install-dismiss" type="button" onClick={dismissInstallCard} aria-label="Dismiss add to home screen suggestion"><X aria-hidden="true" /></button></section> : null}
        <section className="resident-settings-list">
          <div className="resident-settings-person"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>{householdName}</small></div></div>
          <button type="button" onClick={openPasswordDialog}><KeyRound aria-hidden="true" /><span>Change password</span><ChevronRight aria-hidden="true" /></button>
          {isSystemAdmin ? <Link href="/admin"><Settings aria-hidden="true" /><span>Administration</span><ChevronRight aria-hidden="true" /></Link> : null}
          <button type="button" onClick={signOut}><LogOut aria-hidden="true" /><span>Sign out</span><ChevronRight aria-hidden="true" /></button>
        </section>
      </section> : null}

      <nav className="resident-bottom-nav" aria-label="Main navigation">
        <button className={screen === "gate" ? "active" : ""} type="button" onClick={() => setScreen("gate")}><DoorOpen aria-hidden="true" /><span>Gate</span></button>
        <button className={screen === "codes" ? "active" : ""} type="button" onClick={() => setScreen("codes")}><KeyRound aria-hidden="true" /><span>Codes</span></button>
        <button className={screen === "more" ? "active" : ""} type="button" onClick={() => setScreen("more")}><Settings aria-hidden="true" /><span>More</span></button>
      </nav>

      {expandedCamera ? <div className="resident-dialog-backdrop" role="presentation"><section className="resident-dialog resident-camera-dialog" role="dialog" aria-modal="true" aria-labelledby="camera-dialog-title"><div className="resident-dialog-heading"><div><p className="resident-kicker">Camera snapshot</p><h2 id="camera-dialog-title">{expandedCamera === "person" ? "Person at the call box" : "Road-facing camera"}</h2></div><button type="button" onClick={() => setExpandedCamera(null)} aria-label="Close"><X aria-hidden="true" /></button></div><div className={`resident-camera-large resident-camera-${expandedCamera}`}><CameraSnapshot camera={expandedCamera} label={expandedCamera === "person" ? "Person" : "Road"} revision={cameraRevision} configured={camerasConfigured} /></div><div className="resident-camera-dialog-footer"><span>Refreshed {formatTime(cameraUpdatedAt)}</span><button className="resident-secondary-button" type="button" onClick={refreshCameras}><RefreshCw className={cameraRefreshing ? "spinning" : ""} aria-hidden="true" />Refresh</button></div></section></div> : null}

      {partyDialogOpen ? <div className="resident-dialog-backdrop" role="presentation"><section className="resident-dialog" role="dialog" aria-modal="true" aria-labelledby="party-dialog-title"><div className="resident-dialog-heading"><div><p className="resident-kicker">Today only</p><h2 id="party-dialog-title">Set up party mode</h2></div><button type="button" disabled={partyPending} onClick={() => setPartyDialogOpen(false)} aria-label="Close"><X aria-hidden="true" /></button></div><p className="resident-dialog-intro">The gate will stay open so guests can drive in freely.</p><form onSubmit={(event) => void saveParty(event)}><fieldset className="resident-choice-fieldset" disabled={partyPending}><legend>Starts</legend><label className={partyStartChoice === "now" ? "selected" : ""}><input type="radio" name="party-start" checked={partyStartChoice === "now"} onChange={() => setPartyStartChoice("now")} /><strong>Now</strong><span>Open the gate right away</span></label><label className={partyStartChoice === "later" ? "selected" : ""}><input type="radio" name="party-start" checked={partyStartChoice === "later"} onChange={() => setPartyStartChoice("later")} /><strong>Later today</strong><span>Choose a starting time</span></label></fieldset>{partyStartChoice === "later" ? <label className="resident-time-field">Gate opens<input type="time" value={partyStartTime} onChange={(event) => setPartyStartTime(event.target.value)} required disabled={partyPending} /></label> : null}<label className="resident-time-field">Gate closes<input type="time" value={partyEndTime} onChange={(event) => setPartyEndTime(event.target.value)} required disabled={partyPending} /></label>{partyError ? <p className="resident-form-error" role="alert">{partyError}</p> : null}<button className="resident-primary-button" type="submit" disabled={partyPending}>{partyPending ? "Setting up…" : partyStartChoice === "now" ? "Start party mode" : "Schedule party mode"}</button></form></section></div> : null}

      {codeDialog ? <div className="resident-dialog-backdrop" role="presentation"><section className="resident-dialog" role="dialog" aria-modal="true" aria-labelledby="code-dialog-title"><div className="resident-dialog-heading"><div><p className="resident-kicker">Gate code</p><h2 id="code-dialog-title">{codeDialog === "household" ? `${householdCode ? "Change" : "Set"} ${householdName} gate code` : "Add ongoing code"}</h2></div><button type="button" onClick={() => setCodeDialog(null)} aria-label="Close"><X aria-hidden="true" /></button></div><p className="resident-dialog-intro">{codeDialog === "household" ? "Everyone in your household can use this at the keypad." : "Use this for Sarah, a gardener, deliveries, or anyone else who should always be able to enter."}</p><form onSubmit={(event) => void savePermanentCode(event)}>{codeDialog === "person" ? <label className="resident-field-label" htmlFor="permanent-name">What is this for?<input id="permanent-name" className="resident-input" value={codeName} onChange={(event) => setCodeName(event.target.value)} placeholder="For example, Sarah or Gardener" autoFocus /></label> : null}<label className="resident-field-label" htmlFor="permanent-pin">Choose a gate code <span>4–6 numbers</span><input id="permanent-pin" className="resident-input resident-pin-input" value={codePin} onChange={(event) => setCodePin(event.target.value.replace(/\D/g, "").slice(0, 6))} inputMode="numeric" autoComplete="off" placeholder="4826" autoFocus={codeDialog === "household"} /></label>{codeError ? <p className="resident-form-error" role="alert">{codeError}</p> : null}<button className="resident-primary-button" type="submit">{codeDialog === "household" ? "Save gate code" : "Add code"}</button></form></section></div> : null}

      {cancelTarget ? <div className="resident-dialog-backdrop" role="presentation"><section className="resident-dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancel-title"><p className="resident-kicker">Please confirm</p><h2 id="cancel-title">Cancel {cancelTarget.label}&apos;s code?</h2><p className="resident-dialog-intro">The code <strong>{spacedPin(cancelTarget.pin)}</strong> will stop working right away.</p><div className="resident-dialog-actions"><button className="resident-danger-button" type="button" onClick={confirmCancel}>Yes, cancel code</button><button className="resident-secondary-button" type="button" onClick={() => setCancelTarget(null)}>Keep it active</button></div></section></div> : null}

      {passwordDialogOpen ? <div className="resident-dialog-backdrop" role="presentation"><section className="resident-dialog" role="dialog" aria-modal="true" aria-labelledby="password-title"><div className="resident-dialog-heading"><div><p className="resident-kicker">Account security</p><h2 id="password-title">Change password</h2></div><button type="button" onClick={() => !passwordPending && setPasswordDialogOpen(false)} aria-label="Close"><X aria-hidden="true" /></button></div><form className="resident-password-form" onSubmit={changePassword}><label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} required autoFocus /></label><label>New password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={newPassword} onChange={(event) => setNewPassword(event.target.value)} required /></label><label>Confirm new password<input type="password" autoComplete="new-password" minLength={8} maxLength={128} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required /></label>{passwordError ? <p className="resident-form-error" role="alert">{passwordError}</p> : null}{passwordSuccess ? <p className="resident-form-success" role="status">{passwordSuccess}</p> : null}<button className="resident-primary-button" type="submit" disabled={passwordPending}>{passwordPending ? "Changing password…" : "Change password"}</button></form></section></div> : null}
    </main>
  );
}
