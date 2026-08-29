"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import {
  Check,
  X,
} from "lucide-react";
import {
  CameraDialog,
  CancelCodeDialog,
  ExpireCodeDialog,
  GateCodeDialog,
  PartyDialog,
  PasswordDialog,
} from "@/app/resident/dialogs";
import { useCameraSnapshots, useGate, usePartyMode } from "@/app/resident/hooks";
import {
  CodeCreatedScreen,
  CodesScreen,
  CreateCodeScreen,
  GateScreen,
  MoreScreen,
  ResidentNavigation,
} from "@/app/resident/screens";
import {
  codeTiming,
  getState,
  spacedPin,
  type Duration,
  type GateCodeResponse,
  type GuestCode,
  type PermanentCode,
  type Screen,
} from "@/app/resident/model";
import { authClient } from "@/lib/auth-client";
import {
  dateFromGateyDateTimeInput,
  gateyDateTimeInputValue,
  gateyEndOfDay,
} from "@/lib/date-time";

const INSTALL_CARD_DISMISSED_KEY = "gatey.install-card-dismissed";

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

export function ResidentHome({
  householdName,
  userName,
  isSystemAdmin,
  storedPermanentCodes,
  camerasConfigured,
  gatePhoneNumber,
}: {
  householdName: string;
  userName: string;
  isSystemAdmin: boolean;
  storedPermanentCodes: Array<{ id: string; label: string; pin: string }>;
  camerasConfigured: boolean;
  gatePhoneNumber: string;
}) {
  const router = useRouter();
  const [screen, setScreen] = useState<Screen>("gate");
  const [guestCodes, setGuestCodes] = useState<GuestCode[]>([]);
  const [permanentCodes, setPermanentCodes] = useState<PermanentCode[]>(() =>
    storedPermanentCodes.map((code) => ({ ...code, kind: "person" })),
  );
  const [ready, setReady] = useState(false);
  const lastResumeRefresh = useRef(0);
  const {
    state: gateState,
    opening: gateOpening,
    error: gateError,
    refresh: refreshGate,
    open: openGate,
  } = useGate();
  const {
    updatedAt: cameraUpdatedAt,
    refreshing: cameraRefreshing,
    revision: cameraRevision,
    expanded: expandedCamera,
    setExpanded: setExpandedCamera,
    refresh: refreshCameras,
    settled: cameraSettled,
  } = useCameraSnapshots(camerasConfigured);
  const {
    party,
    canEnd: partyCanEnd,
    pending: partyPending,
    loadError: partyLoadError,
    dialogOpen: partyDialogOpen,
    setDialogOpen: setPartyDialogOpen,
    startChoice: partyStartChoice,
    setStartChoice: setPartyStartChoice,
    startTime: partyStartTime,
    setStartTime: setPartyStartTime,
    endTime: partyEndTime,
    setEndTime: setPartyEndTime,
    error: partyError,
    now,
    setNow,
    refresh: refreshParty,
    openDialog: openPartyDialog,
    save: saveParty,
    end: endParty,
  } = usePartyMode();

  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState<Duration>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [createdCode, setCreatedCode] = useState<GuestCode | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GuestCode | null>(null);
  const [expireTarget, setExpireTarget] = useState<PermanentCode | null>(null);
  const [expirePending, setExpirePending] = useState(false);
  const [expireError, setExpireError] = useState("");
  const [pastOpen, setPastOpen] = useState(false);
  const [codesError, setCodesError] = useState("");
  const [createError, setCreateError] = useState("");

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

  const refreshCodes = useCallback(async () => {
    const response = await fetch("/api/gate-codes", { cache: "no-store" });
    if (!response.ok) throw new Error("Could not load your gate codes.");
    const { codes } = await response.json() as { codes: GateCodeResponse[] };
    setGuestCodes(codes.filter((code) => code.kind === "temporary"));
    const managedPermanentCodes: PermanentCode[] = codes
      .filter((code) => code.kind !== "temporary" && code.state === "active")
      .map((code) => ({ ...code, kind: code.kind === "home" ? "household" : "person", managedByGatey: true }));
    const managedPins = new Set(managedPermanentCodes.map((code) => code.pin));
    const existingPersonCodes: PermanentCode[] = storedPermanentCodes
      .filter((code) => !managedPins.has(code.pin))
      .map((code) => ({ ...code, kind: "person" }));
    setPermanentCodes([...managedPermanentCodes, ...existingPersonCodes]);
    setCodesError("");
  }, [storedPermanentCodes]);

  useEffect(() => {
    const initialFetch = window.setTimeout(() => {
      void refreshCodes()
        .catch((caught) => setCodesError(caught instanceof Error ? caught.message : "Could not load your gate codes."))
        .finally(() => setReady(true));
    }, 0);
    return () => window.clearTimeout(initialFetch);
  }, [refreshCodes]);

  useEffect(() => {
    const refreshLiveData = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;

      const currentTime = Date.now();
      // iOS can emit pageshow, visibilitychange, and focus together when restoring
      // an installed web app. Coalesce them into one round of live requests.
      if (currentTime - lastResumeRefresh.current < 1_000) return;
      lastResumeRefresh.current = currentTime;

      setNow(currentTime);
      refreshCameras();
      void refreshCodes().catch((caught) => setCodesError(caught instanceof Error ? caught.message : "Could not load your gate codes."));
      void refreshGate().catch(() => undefined);
      void refreshParty().catch(() => undefined);
      router.refresh();
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") refreshLiveData();
    };

    window.addEventListener("pageshow", refreshLiveData);
    window.addEventListener("focus", refreshLiveData);
    window.addEventListener("online", refreshLiveData);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("pageshow", refreshLiveData);
      window.removeEventListener("focus", refreshLiveData);
      window.removeEventListener("online", refreshLiveData);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [refreshCameras, refreshCodes, refreshGate, refreshParty, router, setNow]);

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
  function openCreate() {
    const current = new Date();
    setLabel("");
    setDuration("today");
    setCustomStart(gateyDateTimeInputValue(current));
    setCustomEnd(gateyDateTimeInputValue(gateyEndOfDay(current)));
    setCreateError("");
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
        setCreateError("Choose both a start and end time.");
        return;
      }
      if (endsAt <= startsAt) {
        setCreateError("The end time needs to be after the start time.");
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
      setCreateError(caught instanceof Error ? caught.message : "Could not create the code.");
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
      setCodesError(caught instanceof Error ? caught.message : "Could not cancel the guest code.");
      setCancelTarget(null);
    }
  }

  async function confirmExpire() {
    if (!expireTarget || expirePending) return;
    setExpirePending(true);
    setExpireError("");
    try {
      const response = await fetch(`/api/gate-codes/${expireTarget.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not expire the ongoing code.");
      setPermanentCodes((current) => current.filter((code) => code.id !== expireTarget.id));
      setPreviewNotice(`${expireTarget.label} was expired.`);
      setExpireTarget(null);
    } catch (caught) {
      setExpireError(caught instanceof Error ? caught.message : "Could not expire the ongoing code.");
    } finally {
      setExpirePending(false);
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
        setPermanentCodes((current) => [...current, { ...result.code!, kind: isHome ? "household" : "person", managedByGatey: true }]);
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

  if (screen === "create") {
    return <CreateCodeScreen label={label} duration={duration} customStart={customStart} customEnd={customEnd} error={createError} onBack={() => setScreen("codes")} onLabelChange={setLabel} onDurationChange={setDuration} onCustomStartChange={setCustomStart} onCustomEndChange={setCustomEnd} onSubmit={createCode} />;
  }

  if (screen === "success" && createdCode) {
    return <CodeCreatedScreen code={createdCode} copied={copiedId === createdCode.id} onShare={() => void shareCode(createdCode)} onCopy={() => void copyCode(createdCode)} onDone={() => setScreen("codes")} />;
  }

  return (
    <main className="resident-shell">
      <header className="resident-topbar">
        <div className="resident-brand"><Image src="/gatey-icon-192.png" alt="" width={48} height={48} priority /><div><p>Gatey</p><h1>{householdName}</h1></div></div>
      </header>

      {previewNotice ? <div className="resident-toast" role="status"><Check aria-hidden="true" /><span>{previewNotice}</span><button type="button" onClick={() => setPreviewNotice("")} aria-label="Dismiss"><X aria-hidden="true" /></button></div> : null}

      {screen === "gate" ? <GateScreen householdName={householdName} gateState={gateState} gateOpening={gateOpening} gateError={gateError} gatePhoneNumber={gatePhoneNumber} party={party} partyCanEnd={partyCanEnd} partyPending={partyPending} partyLoadError={partyLoadError} now={now} grouped={grouped} ready={ready} householdCode={householdCode} camerasConfigured={camerasConfigured} cameraRevision={cameraRevision} cameraUpdatedAt={cameraUpdatedAt} cameraRefreshing={cameraRefreshing} onCameraSettled={cameraSettled} onExpandCamera={setExpandedCamera} onRefreshCameras={refreshCameras} onOpenGate={() => void openGate()} onOpenParty={openPartyDialog} onEndParty={() => void endParty()} onCreateCode={openCreate} onOpenCodes={() => setScreen("codes")} /> : null}

      {screen === "codes" ? <CodesScreen householdName={householdName} householdCode={householdCode} personalCodes={personalCodes} grouped={grouped} ready={ready} copiedId={copiedId} pastOpen={pastOpen} error={codesError} onOpenHouseCode={openHouseCodeDialog} onOpenPersonCode={openPersonCodeDialog} onCreateCode={openCreate} onExpire={(code) => { setExpireError(""); setExpireTarget(code); }} onCopy={(code) => void copyCode(code)} onShare={(code) => void shareCode(code)} onCancel={setCancelTarget} onTogglePast={() => setPastOpen((open) => !open)} /> : null}

      {screen === "more" ? <MoreScreen gatePhoneNumber={gatePhoneNumber} showInstallCard={showInstallCard} userName={userName} householdName={householdName} isSystemAdmin={isSystemAdmin} onDismissInstall={dismissInstallCard} onOpenPassword={openPasswordDialog} onSignOut={() => void signOut()} /> : null}

      <ResidentNavigation screen={screen} onChange={setScreen} />

      {expandedCamera ? <CameraDialog camera={expandedCamera} revision={cameraRevision} configured={camerasConfigured} updatedAt={cameraUpdatedAt} refreshing={cameraRefreshing} onSettled={cameraSettled} onRefresh={refreshCameras} onClose={() => setExpandedCamera(null)} /> : null}

      {partyDialogOpen ? <PartyDialog pending={partyPending} startChoice={partyStartChoice} startTime={partyStartTime} endTime={partyEndTime} error={partyError} onStartChoiceChange={setPartyStartChoice} onStartTimeChange={setPartyStartTime} onEndTimeChange={setPartyEndTime} onSubmit={saveParty} onClose={() => setPartyDialogOpen(false)} /> : null}

      {codeDialog ? <GateCodeDialog mode={codeDialog} householdName={householdName} householdCode={householdCode} name={codeName} pin={codePin} error={codeError} onNameChange={setCodeName} onPinChange={setCodePin} onSubmit={savePermanentCode} onClose={() => setCodeDialog(null)} /> : null}

      {cancelTarget ? <CancelCodeDialog code={cancelTarget} onConfirm={() => void confirmCancel()} onClose={() => setCancelTarget(null)} /> : null}

      {expireTarget ? <ExpireCodeDialog code={expireTarget} pending={expirePending} error={expireError} onConfirm={() => void confirmExpire()} onClose={() => setExpireTarget(null)} /> : null}

      {passwordDialogOpen ? <PasswordDialog currentPassword={currentPassword} newPassword={newPassword} confirmation={passwordConfirmation} pending={passwordPending} error={passwordError} success={passwordSuccess} onCurrentPasswordChange={setCurrentPassword} onNewPasswordChange={setNewPassword} onConfirmationChange={setPasswordConfirmation} onSubmit={changePassword} onClose={() => !passwordPending && setPasswordDialogOpen(false)} /> : null}
    </main>
  );
}
