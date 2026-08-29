import {
  formatGateyDateTime,
  gateyDateKey,
  gateyEndOfDay,
  gateyYear,
  shiftGateyDateKey,
} from "@/lib/date-time";

export type Duration = "today" | "week" | "custom";
export type CodeState = "active" | "upcoming" | "expired" | "revoked";
export type Screen = "gate" | "codes" | "more" | "create" | "success";
export type GateState = "closed" | "opening" | "open" | "unknown";
export type CameraView = "person" | "road";
export type CameraRefresh = { revision: number; pending: Set<CameraView>; loaded: boolean; refreshing: boolean };

export const CAMERA_VIEWS: CameraView[] = ["person", "road"];

export type GuestCode = {
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

export type PermanentCode = {
  id: string;
  label: string;
  pin: string;
  kind: "household" | "person";
  managedByGatey?: boolean;
  lastUsedAt?: string;
  lastUseKnown?: boolean;
  useCount?: number;
  usageWindowDays?: number;
  weeklyUses?: number[];
};

export type GateCodeResponse = GuestCode & {
  kind: "home" | "ongoing" | "temporary";
  state: "active" | "disabled";
  controllerEndsAt: string;
};

export type PartyMode = {
  state: "scheduled" | "active";
  startsAt: string;
  endsAt: string;
  householdId: string;
  householdName: string;
};

export type GroupedGuestCodes = {
  active: GuestCode[];
  upcoming: GuestCode[];
  past: GuestCode[];
};

export function getState(code: GuestCode, now = new Date()): CodeState {
  if (code.revokedAt) return "revoked";
  if (new Date(code.startsAt) > now) return "upcoming";
  if (new Date(code.endsAt) < now) return "expired";
  return "active";
}

export function spacedPin(pin: string) {
  if (pin.length <= 4) return pin.split("").join(" ");
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

export function formatDateTime(value: string, includeYear = false) {
  return formatGateyDateTime(value, {
    month: "short",
    day: "numeric",
    ...(includeYear ? { year: "numeric" } : {}),
    hour: "numeric",
    minute: "2-digit",
  });
}

export function formatTime(value: string | Date) {
  return formatGateyDateTime(value, { hour: "numeric", minute: "2-digit" });
}

export function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value;
}

export function codeTiming(code: GuestCode, state: CodeState) {
  if (state === "revoked") return `Canceled ${formatDateTime(code.revokedAt!, true)}`;
  if (state === "expired") return `Ended ${formatDateTime(code.endsAt, true)}`;
  if (state === "upcoming") return `Starts ${formatDateTime(code.startsAt, true)}`;

  const today = new Date();
  return gateyDateKey(code.endsAt) === gateyDateKey(today)
    ? `Works until ${formatTime(code.endsAt)} today`
    : `Works until ${formatDateTime(code.endsAt, gateyYear(code.endsAt) !== gateyYear(today))}`;
}

export function codeLastUsed(code: Pick<GuestCode, "lastUsedAt" | "lastUseKnown">) {
  if (code.lastUseKnown === false) return "Last use unavailable";
  if (!code.lastUsedAt) return "Not used yet";
  const today = new Date();
  if (gateyDateKey(code.lastUsedAt) === gateyDateKey(today)) return `Used today at ${formatTime(code.lastUsedAt)}`;
  if (gateyDateKey(code.lastUsedAt) === shiftGateyDateKey(today, -1)) return `Used yesterday at ${formatTime(code.lastUsedAt)}`;
  return `Used ${formatDateTime(code.lastUsedAt, gateyYear(code.lastUsedAt) !== gateyYear(today))}`;
}

export function codeUsage(code: Pick<GuestCode, "useCount" | "usageWindowDays" | "lastUseKnown">) {
  if (code.lastUseKnown === false) return "Usage history is syncing";
  const count = code.useCount || 0;
  const days = code.usageWindowDays || 90;
  return `${count} successful ${count === 1 ? "use" : "uses"} in ${days} days`;
}

export function defaultPartyEnd() {
  const now = Date.now();
  const nextHalfHour = Math.ceil(now / (30 * 60_000)) * 30 * 60_000;
  const result = new Date(nextHalfHour + 3 * 60 * 60_000);
  const end = gateyEndOfDay(now);
  return result > end ? end : result;
}

export function partyPhase(party: PartyMode | null) {
  return party?.state || "off";
}

export function countdown(until: string, now: number) {
  const minutes = Math.max(0, Math.ceil((new Date(until).getTime() - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!hours) return `${remainingMinutes} min remaining`;
  if (!remainingMinutes) return `${hours} ${hours === 1 ? "hour" : "hours"} remaining`;
  return `${hours} hr ${remainingMinutes} min remaining`;
}
