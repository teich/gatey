export const GATEY_LOCALE = "en-US";
export const GATEY_TIME_ZONE = "America/Los_Angeles";

type DateValue = string | number | Date;

function asDate(value: DateValue) {
  return value instanceof Date ? value : new Date(value);
}

function gateyParts(value: DateValue) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GATEY_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(asDate(value));
  const part = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((item) => item.type === type)?.value || 0);
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour"),
    minute: part("minute"),
    second: part("second"),
  };
}

export function formatGateyDateTime(value: DateValue, options: Intl.DateTimeFormatOptions) {
  return new Intl.DateTimeFormat(GATEY_LOCALE, {
    ...options,
    timeZone: GATEY_TIME_ZONE,
  }).format(asDate(value));
}

export function gateyDateKey(value: DateValue) {
  const { year, month, day } = gateyParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function shiftGateyDateKey(value: DateValue, days: number) {
  const [year, month, day] = gateyDateKey(value).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function gateyYear(value: DateValue) {
  return Number(formatGateyDateTime(value, { year: "numeric" }));
}

export function gateyDateTimeInputValue(value: DateValue) {
  const { year, month, day, hour, minute } = gateyParts(value);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function gateyTimeInputValue(value: DateValue) {
  const { hour, minute } = gateyParts(value);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export function dateFromGateyDateTimeInput(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return new Date(Number.NaN);
  const [, year, month, day, hour, minute] = match.map(Number);
  const targetWallTime = Date.UTC(year, month - 1, day, hour, minute);
  let instant = targetWallTime;
  for (let iteration = 0; iteration < 3; iteration += 1) {
    const actual = gateyParts(instant);
    const actualWallTime = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute);
    instant += targetWallTime - actualWallTime;
  }
  const result = new Date(instant);
  return gateyDateTimeInputValue(result) === value ? result : new Date(Number.NaN);
}

export function dateFromGateyTimeInput(value: string, reference: DateValue = new Date()) {
  return dateFromGateyDateTimeInput(`${gateyDateKey(reference)}T${value}`);
}

export function gateyEndOfDay(reference: DateValue = new Date(), dayOffset = 0) {
  return dateFromGateyDateTimeInput(`${shiftGateyDateKey(reference, dayOffset)}T23:59`);
}
