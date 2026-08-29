import { describe, expect, it } from "vitest";
import {
  dateFromGateyDateTimeInput,
  gateyDateKey,
  gateyDateTimeInputValue,
  gateyEndOfDay,
  shiftGateyDateKey,
} from "@/lib/date-time";

describe("Gatey date and time conversion", () => {
  it("uses the Los Angeles calendar day rather than the process time zone", () => {
    expect(gateyDateKey("2026-08-30T05:30:00.000Z")).toBe("2026-08-29");
  });

  it("round-trips an ordinary local wall time", () => {
    const date = dateFromGateyDateTimeInput("2026-08-29T18:45");

    expect(date.toISOString()).toBe("2026-08-30T01:45:00.000Z");
    expect(gateyDateTimeInputValue(date)).toBe("2026-08-29T18:45");
  });

  it("rejects the nonexistent hour during spring-forward", () => {
    expect(dateFromGateyDateTimeInput("2026-03-08T02:30").valueOf()).toBeNaN();
  });

  it("chooses a valid occurrence of an ambiguous fall-back time", () => {
    const date = dateFromGateyDateTimeInput("2026-11-01T01:30");

    expect(date.valueOf()).not.toBeNaN();
    expect(gateyDateTimeInputValue(date)).toBe("2026-11-01T01:30");
  });

  it.each([
    "not-a-date",
    "2026-02-30T10:00",
    "2026-08-29T24:00",
    "2026-08-29T12:60",
  ])("rejects invalid input %s", (value) => {
    expect(dateFromGateyDateTimeInput(value).valueOf()).toBeNaN();
  });

  it("shifts calendar dates across month and year boundaries", () => {
    expect(shiftGateyDateKey("2026-12-31T20:00:00-08:00", 1)).toBe("2027-01-01");
    expect(shiftGateyDateKey("2026-03-08T12:00:00-07:00", -1)).toBe("2026-03-07");
  });

  it("computes end of day on the requested local date", () => {
    expect(gateyEndOfDay("2026-08-29T12:00:00-07:00").toISOString()).toBe("2026-08-30T06:59:00.000Z");
  });
});
