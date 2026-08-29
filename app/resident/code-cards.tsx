"use client";

import { ChevronRight, Copy, Share2 } from "lucide-react";
import { codeLastUsed, codeTiming, codeUsage, getState, spacedPin, type GuestCode } from "@/app/resident/model";

export function UsageBars({ values = [] }: { values?: number[] }) {
  const max = Math.max(1, ...values);
  return <span className="resident-usage-bars" aria-label="Weekly usage over the last eight weeks">{values.map((value, index) => <i key={index} style={{ height: `${Math.max(12, Math.round((value / max) * 100))}%` }} title={`${value} uses`} />)}</span>;
}

export function GuestCodeCard({
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

export function GuestCodeSummaryCard({ code, onOpen }: { code: GuestCode; onOpen: () => void }) {
  return <button className="resident-guest-summary-card" type="button" onClick={onOpen}>
    <span><strong>{code.label || "Guest"}</strong><small>{codeUsage(code)} · {codeLastUsed(code)}</small></span>
    <b aria-label={`Gate code ${code.pin.split("").join(" ")}`}>{spacedPin(code.pin)}</b>
    <ChevronRight aria-hidden="true" />
  </button>;
}
