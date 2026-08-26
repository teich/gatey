"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type Duration = "today" | "week" | "custom";
type CodeState = "active" | "upcoming" | "expired" | "revoked";

type GuestCode = {
  id: string;
  label: string;
  pin: string;
  startsAt: string;
  endsAt: string;
  revokedAt?: string;
};

function endOfDay(date: Date) {
  const result = new Date(date);
  result.setHours(23, 59, 59, 999);
  return result;
}

function getState(code: GuestCode, now = new Date()): CodeState {
  if (code.revokedAt) return "revoked";
  if (new Date(code.startsAt) > now) return "upcoming";
  if (new Date(code.endsAt) < now) return "expired";
  return "active";
}

function spacedPin(pin: string) {
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

function formatDateTime(value: string, includeYear = false) {
  const date = new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: includeYear ? "numeric" : undefined,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function codeTiming(code: GuestCode, state: CodeState) {
  if (state === "revoked") return `Canceled ${formatDateTime(code.revokedAt!, true)}`;
  if (state === "expired") return `Ended ${formatDateTime(code.endsAt, true)}`;
  if (state === "upcoming") return `Starts ${formatDateTime(code.startsAt, true)}`;

  const end = new Date(code.endsAt);
  const today = new Date();
  const sameDay = end.toDateString() === today.toDateString();
  return sameDay
    ? `Until tonight at ${new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(end)}`
    : `Until ${formatDateTime(code.endsAt, end.getFullYear() !== today.getFullYear())}`;
}

function toLocalInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function CodeCard({
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
    <article className={`code-card ${state}`}>
      <div className="code-card-top">
        <div>
          <h3>{code.label || "Guest"}</h3>
          <p className={`status ${state}`}><span aria-hidden="true" /> {stateText}</p>
        </div>
      </div>
      <p className="pin" aria-label={`Gate code ${code.pin.split("").join(" ")}`}>{spacedPin(code.pin)}</p>
      <p className="timing">{codeTiming(code, state)}</p>
      <div className="card-actions">
        <button className="soft-button" type="button" onClick={() => onCopy(code)}>{copied ? "Copied!" : "Copy"}</button>
        <button className="soft-button" type="button" onClick={() => onShare(code)}>Share</button>
        {onCancel && <button className="text-button danger" type="button" onClick={() => onCancel(code)}>Cancel code</button>}
      </div>
    </article>
  );
}

export default function Home() {
  const [codes, setCodes] = useState<GuestCode[]>([]);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<"home" | "create" | "success">("home");
  const [label, setLabel] = useState("");
  const [duration, setDuration] = useState<Duration>("today");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [createdCode, setCreatedCode] = useState<GuestCode | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<GuestCode | null>(null);
  const [pastOpen, setPastOpen] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/credentials")
      .then(async (response) => {
        if (!response.ok) throw new Error("Could not load your guest codes.");
        return response.json() as Promise<{ credentials: GuestCode[] }>;
      })
      .then(({ credentials }) => setCodes(credentials))
      .catch((caught) => setError(caught instanceof Error ? caught.message : "Could not load your guest codes."))
      .finally(() => setReady(true));
  }, []);

  const grouped = useMemo(() => {
    const active: GuestCode[] = [];
    const upcoming: GuestCode[] = [];
    const past: GuestCode[] = [];
    codes.forEach((code) => {
      const state = getState(code);
      if (state === "active") active.push(code);
      else if (state === "upcoming") upcoming.push(code);
      else past.push(code);
    });
    return { active, upcoming, past };
  }, [codes]);

  function openCreate() {
    const now = new Date();
    setLabel("");
    setDuration("today");
    setCustomStart(toLocalInputValue(now));
    setCustomEnd(toLocalInputValue(endOfDay(now)));
    setError("");
    setView("create");
  }

  async function createCode(event: FormEvent) {
    event.preventDefault();
    const now = new Date();
    let startsAt = now;
    let endsAt = endOfDay(now);

    if (duration === "week") endsAt = endOfDay(new Date(now.getFullYear(), now.getMonth(), now.getDate() + 6));
    if (duration === "custom") {
      startsAt = new Date(customStart);
      endsAt = new Date(customEnd);
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
      const response = await fetch("/api/credentials", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim() || "Guest", startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() }),
      });
      const result = await response.json() as { credential?: GuestCode; error?: string };
      if (!response.ok || !result.credential) throw new Error(result.error || "Could not create the guest code.");
      const code = result.credential;
      setCodes((current) => [code, ...current]);
      setCreatedCode(code);
      setView("success");
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not create the code.");
    }
  }

  async function copyCode(code: GuestCode) {
    await navigator.clipboard.writeText(code.pin);
    setCopiedId(code.id);
  }

  async function shareCode(code: GuestCode) {
    const message = `${code.label}'s Bennett Valley Gate code is ${spacedPin(code.pin)}. ${codeTiming(code, getState(code))}.`;
    if (navigator.share) {
      try { await navigator.share({ title: "Bennett Valley Gate code", text: message }); } catch { /* The share sheet was dismissed. */ }
    } else {
      await navigator.clipboard.writeText(message);
      setCopiedId(code.id);
    }
  }

  async function confirmCancel() {
    if (!cancelTarget) return;
    try {
      const response = await fetch(`/api/credentials/${cancelTarget.id}`, { method: "DELETE" });
      const result = await response.json() as { error?: string };
      if (!response.ok) throw new Error(result.error || "Could not cancel the guest code.");
      setCodes((current) => current.map((code) => code.id === cancelTarget.id ? { ...code, revokedAt: new Date().toISOString() } : code));
      setCancelTarget(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not cancel the guest code.");
      setCancelTarget(null);
    }
  }

  const now = new Date();
  const greeting = now.getHours() < 12 ? "Good morning" : now.getHours() < 18 ? "Good afternoon" : "Good evening";
  const today = new Intl.DateTimeFormat(undefined, { weekday: "long", month: "long", day: "numeric" }).format(now);

  if (view === "create") {
    return (
      <main className="app-shell flow-shell">
        <header className="flow-header"><button className="back-button" type="button" onClick={() => setView("home")} aria-label="Back to home">←</button><p>Create guest code</p><span /></header>
        <form className="create-form" onSubmit={createCode}>
          <div className="flow-intro"><p className="eyebrow">New guest</p><h1>Who is this for?</h1><p>A name helps everyone at home remember the code.</p></div>
          <label className="field-label" htmlFor="guest-name">Guest name <span>Optional</span></label>
          <input id="guest-name" className="text-input" value={label} onChange={(event) => setLabel(event.target.value)} placeholder="Susan, gardener, delivery…" autoFocus />

          <fieldset className="duration-fieldset">
            <legend>How long should it work?</legend>
            <div className="duration-options">
              <label className={duration === "today" ? "selected" : ""}><input type="radio" name="duration" value="today" checked={duration === "today"} onChange={() => setDuration("today")} /><strong>Today</strong><span>Until 11:59 PM</span></label>
              <label className={duration === "week" ? "selected" : ""}><input type="radio" name="duration" value="week" checked={duration === "week"} onChange={() => setDuration("week")} /><strong>7 days</strong><span>Through next Tuesday</span></label>
              <label className={duration === "custom" ? "selected" : ""}><input type="radio" name="duration" value="custom" checked={duration === "custom"} onChange={() => setDuration("custom")} /><strong>Choose dates</strong><span>Pick exact times</span></label>
            </div>
          </fieldset>

          {duration === "custom" && (
            <div className="custom-dates">
              <label>Starts<input type="datetime-local" value={customStart} onChange={(event) => setCustomStart(event.target.value)} /></label>
              <label>Ends<input type="datetime-local" value={customEnd} onChange={(event) => setCustomEnd(event.target.value)} /></label>
            </div>
          )}
          {error && <p className="form-error" role="alert">{error}</p>}
          <button className="primary-action form-submit" type="submit">Create code</button>
          <p className="demo-note">This code is created in UniFi and can be found here again later.</p>
        </form>
      </main>
    );
  }

  if (view === "success" && createdCode) {
    return (
      <main className="app-shell success-shell">
        <div className="success-mark" aria-hidden="true">✓</div>
        <p className="eyebrow">Ready to use</p>
        <h1>{createdCode.label}&apos;s code is ready.</h1>
        <p className="success-subtitle">{codeTiming(createdCode, getState(createdCode))}</p>
        <div className="success-code"><p className="pin" aria-label={`Gate code ${createdCode.pin.split("").join(" ")}`}>{spacedPin(createdCode.pin)}</p></div>
        <div className="success-actions">
          <button className="primary-action" type="button" onClick={() => shareCode(createdCode)}>Share code</button>
          <button className="secondary-action" type="button" onClick={() => copyCode(createdCode)}>{copiedId === createdCode.id ? "Code copied!" : "Copy code"}</button>
        </div>
        <p className="reassurance">You can always find this code on the home screen.</p>
        <button className="text-button done-button" type="button" onClick={() => setView("home")}>Done</button>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar"><div><p className="eyebrow">Home</p><h1>Bennett Valley Gate</h1></div><a className="admin-link" href="/admin">Admin</a></header>
      <section className="welcome" aria-labelledby="welcome-title"><p className="eyebrow">{today}</p><h2 id="welcome-title">{greeting}, Oren.</h2><p>Who are we welcoming today?</p><button className="primary-action" type="button" onClick={openCreate}><span aria-hidden="true">＋</span>Create guest code</button></section>

      {!ready ? <p className="loading">Finding your codes…</p> : (
        <>
          <section className="code-section" aria-labelledby="active-heading">
            <div className="section-heading"><h2 id="active-heading">Active codes</h2><span className="count">{grouped.active.length}</span></div>
            {grouped.active.length ? grouped.active.map((code) => <CodeCard key={code.id} code={code} copied={copiedId === code.id} onCopy={copyCode} onShare={shareCode} onCancel={setCancelTarget} />) : <div className="empty-state"><p>No active codes</p><span>Create one when someone&apos;s on the way.</span></div>}
          </section>

          {grouped.upcoming.length > 0 && <section className="code-section upcoming-section" aria-labelledby="upcoming-heading"><div className="section-heading"><h2 id="upcoming-heading">Upcoming</h2><span className="count">{grouped.upcoming.length}</span></div>{grouped.upcoming.map((code) => <CodeCard key={code.id} code={code} copied={copiedId === code.id} onCopy={copyCode} onShare={shareCode} onCancel={setCancelTarget} />)}</section>}

          {grouped.past.length > 0 && <section className="past-section"><button className="past-codes" type="button" onClick={() => setPastOpen((open) => !open)} aria-expanded={pastOpen}><span>Past codes <small>{grouped.past.length}</small></span><span aria-hidden="true">{pastOpen ? "⌃" : "⌄"}</span></button>{pastOpen && <div className="past-list">{grouped.past.map((code) => <CodeCard key={code.id} code={code} copied={copiedId === code.id} onCopy={copyCode} onShare={shareCode} />)}</div>}</section>}
        </>
      )}

      {cancelTarget && <div className="dialog-backdrop" role="presentation"><div className="dialog" role="alertdialog" aria-modal="true" aria-labelledby="cancel-title"><p className="eyebrow">Please confirm</p><h2 id="cancel-title">Cancel {cancelTarget.label}&apos;s code?</h2><p>The code <strong>{spacedPin(cancelTarget.pin)}</strong> will stop working right away.</p><div className="dialog-actions"><button className="danger-button" type="button" onClick={confirmCancel}>Yes, cancel code</button><button className="secondary-action" type="button" onClick={() => setCancelTarget(null)}>Keep it active</button></div></div></div>}
    </main>
  );
}
