"use client";

import type { FormEvent } from "react";
import Link from "next/link";
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
  Phone,
  Plus,
  RefreshCw,
  Settings,
  Share2,
  UsersRound,
  X,
} from "lucide-react";
import { CameraSnapshot } from "@/app/resident/camera-snapshot";
import { GuestCodeCard, GuestCodeSummaryCard, UsageBars } from "@/app/resident/code-cards";
import {
  codeLastUsed,
  codeTiming,
  codeUsage,
  countdown,
  formatPhoneNumber,
  formatTime,
  getState,
  spacedPin,
  type CameraView,
  type Duration,
  type GateState,
  type GroupedGuestCodes,
  type GuestCode,
  type PartyMode,
  type PermanentCode,
  type Screen,
} from "@/app/resident/model";
import { formatGateyDateTime, gateyEndOfDay } from "@/lib/date-time";

export function CreateCodeScreen({
  label,
  duration,
  customStart,
  customEnd,
  error,
  onBack,
  onLabelChange,
  onDurationChange,
  onCustomStartChange,
  onCustomEndChange,
  onSubmit,
}: {
  label: string;
  duration: Duration;
  customStart: string;
  customEnd: string;
  error: string;
  onBack: () => void;
  onLabelChange: (value: string) => void;
  onDurationChange: (value: Duration) => void;
  onCustomStartChange: (value: string) => void;
  onCustomEndChange: (value: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const weekEnd = gateyEndOfDay(new Date(), 6);
  return <main className="resident-shell resident-flow-shell">
    <header className="resident-flow-header"><button type="button" onClick={onBack} aria-label="Back to codes"><ArrowLeft aria-hidden="true" /></button><strong>Create guest code</strong><span /></header>
    <form className="resident-create-form" onSubmit={onSubmit}>
      <div className="resident-flow-intro"><p className="resident-kicker">New guest</p><h1>Who is this for?</h1><p>A name helps everyone at home recognize the code later.</p></div>
      <label className="resident-field-label" htmlFor="guest-name">Guest name <span>Optional</span></label>
      <input id="guest-name" className="resident-input" value={label} onChange={(event) => onLabelChange(event.target.value)} placeholder="Susan, gardener, delivery…" autoFocus />
      <fieldset className="resident-duration-fieldset">
        <legend>How long should it work?</legend>
        <div className="resident-duration-options">
          <label className={duration === "today" ? "selected" : ""}><input type="radio" name="duration" checked={duration === "today"} onChange={() => onDurationChange("today")} /><strong>Today</strong><span>Until midnight</span></label>
          <label className={duration === "week" ? "selected" : ""}><input type="radio" name="duration" checked={duration === "week"} onChange={() => onDurationChange("week")} /><strong>7 days</strong><span>Through {formatGateyDateTime(weekEnd, { weekday: "long" })}</span></label>
          <label className={duration === "custom" ? "selected" : ""}><input type="radio" name="duration" checked={duration === "custom"} onChange={() => onDurationChange("custom")} /><strong>Choose dates</strong><span>Exact times</span></label>
        </div>
      </fieldset>
      {duration === "custom" ? <div className="resident-custom-dates"><label>Starts<input type="datetime-local" value={customStart} onChange={(event) => onCustomStartChange(event.target.value)} /></label><label>Ends<input type="datetime-local" value={customEnd} onChange={(event) => onCustomEndChange(event.target.value)} /></label></div> : null}
      {error ? <p className="resident-form-error" role="alert">{error}</p> : null}
      <button className="resident-primary-button resident-form-submit" type="submit">Create guest code</button>
      <p className="resident-form-note">The code will be created at the gate and saved here for your household.</p>
    </form>
  </main>;
}

export function CodeCreatedScreen({ code, copied, onShare, onCopy, onDone }: { code: GuestCode; copied: boolean; onShare: () => void; onCopy: () => void; onDone: () => void }) {
  return <main className="resident-shell resident-success-shell">
    <div className="resident-success-mark"><Check aria-hidden="true" /></div>
    <p className="resident-kicker">Ready to use</p>
    <h1>{code.label}&apos;s code is ready</h1>
    <p>{codeTiming(code, getState(code))}</p>
    <div className="resident-success-pin" aria-label={`Gate code ${code.pin.split("").join(" ")}`}>{spacedPin(code.pin)}</div>
    <div className="resident-success-actions"><button className="resident-primary-button" type="button" onClick={onShare}><Share2 aria-hidden="true" />Share code</button><button className="resident-secondary-button" type="button" onClick={onCopy}><Copy aria-hidden="true" />{copied ? "Copied" : "Copy code"}</button></div>
    <p className="resident-success-note">You can always find this code in Codes.</p>
    <button className="resident-text-button" type="button" onClick={onDone}>Done</button>
  </main>;
}

export function GateScreen({
  householdName,
  gateState,
  gateOpening,
  gateError,
  gatePhoneNumber,
  party,
  partyCanEnd,
  partyPending,
  partyLoadError,
  now,
  grouped,
  ready,
  householdCode,
  camerasConfigured,
  cameraRevision,
  cameraUpdatedAt,
  cameraRefreshing,
  onCameraSettled,
  onExpandCamera,
  onRefreshCameras,
  onOpenGate,
  onOpenParty,
  onEndParty,
  onCreateCode,
  onOpenCodes,
}: {
  householdName: string;
  gateState: GateState;
  gateOpening: boolean;
  gateError: string;
  gatePhoneNumber: string;
  party: PartyMode | null;
  partyCanEnd: boolean;
  partyPending: boolean;
  partyLoadError: string;
  now: number;
  grouped: GroupedGuestCodes;
  ready: boolean;
  householdCode?: PermanentCode;
  camerasConfigured: boolean;
  cameraRevision: number;
  cameraUpdatedAt: Date;
  cameraRefreshing: boolean;
  onCameraSettled: (camera: CameraView, revision: number, loaded: boolean) => void;
  onExpandCamera: (camera: CameraView) => void;
  onRefreshCameras: () => void;
  onOpenGate: () => void;
  onOpenParty: () => void;
  onEndParty: () => void;
  onCreateCode: () => void;
  onOpenCodes: () => void;
}) {
  const phase = party?.state || "off";
  const gateLabel = gateState === "opening" || gateOpening ? "Gate is opening" : gateState === "open" ? "Gate is open" : gateState === "closed" ? "Gate is closed" : "Checking gate…";

  return <>
    <section className="resident-section resident-camera-section" aria-label="Gate camera snapshots">
      <div className="resident-camera-grid">
        <button className="resident-camera" type="button" onClick={() => onExpandCamera("person")} aria-label="Enlarge person camera snapshot"><CameraSnapshot camera="person" label="Person" revision={cameraRevision} configured={camerasConfigured} onSettled={onCameraSettled} /><span><Camera aria-hidden="true" />Person</span></button>
        <button className="resident-camera" type="button" onClick={() => onExpandCamera("road")} aria-label="Enlarge road camera snapshot"><CameraSnapshot camera="road" label="Road" revision={cameraRevision} configured={camerasConfigured} onSettled={onCameraSettled} /><span><Camera aria-hidden="true" />Road</span></button>
      </div>
      <div className="resident-camera-meta"><p className="resident-camera-time">Refreshed {formatTime(cameraUpdatedAt)}</p><button className="resident-refresh-button" type="button" onClick={onRefreshCameras} disabled={cameraRefreshing}><RefreshCw className={cameraRefreshing ? "spinning" : ""} aria-hidden="true" />{cameraRefreshing ? "Refreshing" : "Refresh"}</button></div>
    </section>
    <section className={`resident-gate-control resident-gate-${gateOpening ? "opening" : gateState}`} aria-labelledby="gate-state">
      <p className="resident-gate-state" id="gate-state"><span aria-hidden="true" />{gateLabel}</p>
      <button type="button" className="resident-open-button" onClick={onOpenGate} disabled={gateState !== "closed" || gateOpening}>{gateState === "closed" && !gateOpening ? <LockKeyhole aria-hidden="true" /> : <DoorOpen aria-hidden="true" />}<span>{gateState === "closed" && !gateOpening ? "Open gate" : gateState === "unknown" ? "Checking gate…" : gateState === "open" && !gateOpening ? "Gate is open" : "Opening…"}</span></button>
      {gateError ? <p className="resident-gate-error" role="alert">{gateError}</p> : null}
    </section>
    {gatePhoneNumber || phase === "off" ? <div className={`resident-gate-tools${gatePhoneNumber && phase === "off" ? "" : " resident-gate-tools-single"}`}>
      {gatePhoneNumber ? <a className="resident-call-action" href={`tel:${gatePhoneNumber}`} aria-label={`Call Gatey at ${gatePhoneNumber}`}><Phone aria-hidden="true" /><span><small>Call-to-open</small><strong>{formatPhoneNumber(gatePhoneNumber)}</strong></span></a> : null}
      {phase === "off" ? <button className="resident-party-enable" type="button" onClick={onOpenParty}><PartyPopper aria-hidden="true" /><span><small>Party mode</small><strong>Turn on</strong></span><ChevronRight aria-hidden="true" /></button> : null}
    </div> : null}
    {phase !== "off" ? <section className={`resident-party-card resident-party-${phase}`} aria-labelledby="party-title">
      <div className="resident-feature-icon"><PartyPopper aria-hidden="true" /></div>
      <div className="resident-feature-copy"><h2 id="party-title">Party mode</h2>{phase === "active" && party ? <><p>{party.householdName === householdName ? `Ends at ${formatTime(party.endsAt)}` : `${party.householdName} has the gate open until ${formatTime(party.endsAt)}`}</p><strong className="resident-countdown">{countdown(party.endsAt, now)}</strong></> : phase === "scheduled" && party ? <p>{party.householdName === householdName ? `Opens at ${formatTime(party.startsAt)} and ends at ${formatTime(party.endsAt)}.` : `${party.householdName} scheduled this until ${formatTime(party.endsAt)}.`}</p> : null}</div>
      {partyCanEnd ? <button className="resident-row-action resident-danger-action" type="button" disabled={partyPending} onClick={onEndParty}>{partyPending ? "Working…" : phase === "active" ? "End now" : "Cancel"}</button> : <span className="resident-party-in-use">In use</span>}
    </section> : null}
    {partyLoadError ? <p className="resident-party-error" role="status">{partyLoadError}</p> : null}
    <section className="resident-gate-guest-section" aria-labelledby="gate-guest-title">
      <div className="resident-section-title"><div><p className="resident-kicker">Household access</p><h2 id="gate-guest-title">Guest codes</h2></div><button className="resident-add-button" type="button" onClick={onCreateCode}><Plus aria-hidden="true" />Create</button></div>
      {!ready ? <p className="resident-loading">Finding your guest codes…</p> : grouped.active.length || grouped.upcoming.length ? <div className="resident-guest-summary-list">{[...grouped.active, ...grouped.upcoming].slice(0, 3).map((code) => <GuestCodeSummaryCard key={code.id} code={code} onOpen={onOpenCodes} />)}</div> : <div className="resident-empty-compact"><Clock3 aria-hidden="true" /><span>No active guest codes.</span></div>}
      {grouped.active.length + grouped.upcoming.length > 3 ? <button className="resident-view-all-codes" type="button" onClick={onOpenCodes}>See all guest codes</button> : null}
    </section>
    <button className="resident-code-summary" type="button" onClick={onOpenCodes}><span className="resident-feature-icon"><KeyRound aria-hidden="true" /></span><span><small>Your code</small><strong>{householdName} gate code</strong><b>{householdCode ? spacedPin(householdCode.pin) : "Not set"}</b></span><ChevronRight aria-hidden="true" /></button>
  </>;
}

export function CodesScreen({ householdName, householdCode, personalCodes, grouped, ready, copiedId, pastOpen, error, onOpenHouseCode, onOpenPersonCode, onCreateCode, onExpire, onCopy, onShare, onCancel, onTogglePast }: {
  householdName: string;
  householdCode?: PermanentCode;
  personalCodes: PermanentCode[];
  grouped: GroupedGuestCodes;
  ready: boolean;
  copiedId: string | null;
  pastOpen: boolean;
  error: string;
  onOpenHouseCode: () => void;
  onOpenPersonCode: () => void;
  onCreateCode: () => void;
  onExpire: (code: PermanentCode) => void;
  onCopy: (code: GuestCode | PermanentCode) => void;
  onShare: (code: GuestCode) => void;
  onCancel: (code: GuestCode) => void;
  onTogglePast: () => void;
}) {
  return <section className="resident-page" aria-labelledby="codes-title">
    <div className="resident-page-heading"><p className="resident-kicker">Household access</p><h1 id="codes-title">Codes</h1><p>Everything your household uses to enter the gate.</p></div>
    <section className="resident-house-code" aria-labelledby="house-code-title">
      <div className="resident-section-title"><div><p className="resident-kicker">Shared by your household</p><h2 id="house-code-title">{householdName} gate code</h2></div><House aria-hidden="true" /></div>
      <p className="resident-large-pin" aria-label={householdCode ? `Gate code ${householdCode.pin.split("").join(" ")}` : "No household gate code"}>{householdCode ? spacedPin(householdCode.pin) : "Not set"}</p>
      {householdCode ? <div className="resident-code-usage resident-house-usage"><span><strong>{codeUsage(householdCode)}</strong><small>{codeLastUsed(householdCode)}</small></span><UsageBars values={householdCode.weeklyUses} /></div> : null}
      <button className="resident-secondary-button" type="button" onClick={onOpenHouseCode}>{householdCode ? "Change gate code" : "Set gate code"}</button>
    </section>
    <section className="resident-code-section" aria-labelledby="permanent-title">
      <div className="resident-section-title"><div><p className="resident-kicker">Always works</p><h2 id="permanent-title">Ongoing codes</h2></div><button className="resident-add-button" type="button" onClick={onOpenPersonCode}><Plus aria-hidden="true" />Add code</button></div>
      {personalCodes.length ? <div className="resident-permanent-list">{personalCodes.map((code) => <article key={code.id}><span className="resident-person-mark">{code.label.slice(0, 1).toUpperCase()}</span><div><h3>{code.label}</h3><p>{codeUsage(code)}</p><small>{codeLastUsed(code)}</small></div><UsageBars values={code.weeklyUses} /><strong>{spacedPin(code.pin)}</strong>{code.managedByGatey ? <button className="resident-expire-code" type="button" aria-label={`Expire ${code.label}`} onClick={() => onExpire(code)}>Expire</button> : null}</article>)}</div> : <div className="resident-empty-compact"><UsersRound aria-hidden="true" /><span>No ongoing codes yet.</span></div>}
    </section>
    <section className="resident-code-section" aria-labelledby="guest-title">
      <div className="resident-section-title"><div><p className="resident-kicker">Ends automatically</p><h2 id="guest-title">Guest codes</h2></div><button className="resident-add-button" type="button" onClick={onCreateCode}><Plus aria-hidden="true" />Create code</button></div>
      {!ready ? <p className="resident-loading">Finding your guest codes…</p> : <>{grouped.active.length || grouped.upcoming.length ? <div className="resident-guest-list">{[...grouped.active, ...grouped.upcoming].map((code) => <GuestCodeCard key={code.id} code={code} copied={copiedId === code.id} onCopy={onCopy} onShare={onShare} onCancel={onCancel} />)}</div> : <div className="resident-empty-compact"><Clock3 aria-hidden="true" /><span>No active guest codes.</span></div>}{grouped.past.length ? <><button className="resident-past-toggle" type="button" onClick={onTogglePast} aria-expanded={pastOpen}><span>Past codes ({grouped.past.length})</span><ChevronDown className={pastOpen ? "rotated" : ""} aria-hidden="true" /></button>{pastOpen ? <div className="resident-guest-list resident-past-list">{grouped.past.map((code) => <GuestCodeCard key={code.id} code={code} copied={copiedId === code.id} onCopy={onCopy} onShare={onShare} />)}</div> : null}</> : null}</>}
      {error ? <p className="resident-form-error" role="alert">{error}</p> : null}
    </section>
  </section>;
}

export function MoreScreen({ gatePhoneNumber, showInstallCard, userName, householdName, isSystemAdmin, onDismissInstall, onOpenPassword, onSignOut }: { gatePhoneNumber: string; showInstallCard: boolean; userName: string; householdName: string; isSystemAdmin: boolean; onDismissInstall: () => void; onOpenPassword: () => void; onSignOut: () => void }) {
  return <section className="resident-page" aria-labelledby="more-title">
    <div className="resident-page-heading"><p className="resident-kicker">Gatey</p><h1 id="more-title">More</h1><p>Phone setup and account settings.</p></div>
    {gatePhoneNumber ? <a className="resident-install-card" href={`tel:${gatePhoneNumber}`}><div className="resident-feature-icon"><Phone aria-hidden="true" /></div><div><p className="resident-kicker">Call-to-open</p><h2>{formatPhoneNumber(gatePhoneNumber)}</h2><p>Tap to call from your authorized phone number.</p></div></a> : null}
    {showInstallCard ? <section className="resident-install-card resident-home-screen-card"><div className="resident-feature-icon"><Plus aria-hidden="true" /></div><div><p className="resident-kicker">Faster next time</p><h2>Add Gatey to your home screen</h2><p>On iPhone, tap Share, then “Add to Home Screen.” On Android, open the browser menu and tap “Add to Home screen.”</p></div><button className="resident-install-dismiss" type="button" onClick={onDismissInstall} aria-label="Dismiss add to home screen suggestion"><X aria-hidden="true" /></button></section> : null}
    <section className="resident-settings-list"><div className="resident-settings-person"><span>{userName.slice(0, 1).toUpperCase()}</span><div><strong>{userName}</strong><small>{householdName}</small></div></div><button type="button" onClick={onOpenPassword}><KeyRound aria-hidden="true" /><span>Change password</span><ChevronRight aria-hidden="true" /></button>{isSystemAdmin ? <Link href="/admin"><Settings aria-hidden="true" /><span>Administration</span><ChevronRight aria-hidden="true" /></Link> : null}<button type="button" onClick={onSignOut}><LogOut aria-hidden="true" /><span>Sign out</span><ChevronRight aria-hidden="true" /></button></section>
  </section>;
}

export function ResidentNavigation({ screen, onChange }: { screen: Screen; onChange: (screen: Screen) => void }) {
  return <nav className="resident-bottom-nav" aria-label="Main navigation"><button className={screen === "gate" ? "active" : ""} type="button" onClick={() => onChange("gate")}><DoorOpen aria-hidden="true" /><span>Gate</span></button><button className={screen === "codes" ? "active" : ""} type="button" onClick={() => onChange("codes")}><KeyRound aria-hidden="true" /><span>Codes</span></button><button className={screen === "more" ? "active" : ""} type="button" onClick={() => onChange("more")}><Settings aria-hidden="true" /><span>More</span></button></nav>;
}
