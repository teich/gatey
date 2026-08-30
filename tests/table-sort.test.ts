import { describe, expect, it } from "vitest";
import { compareTableValues } from "@/lib/table-sort";

describe("table sorting", () => {
  it("sorts numbers numerically", () => {
    expect(compareTableValues(2, 10)).toBeLessThan(0);
  });

  it("sorts text case-insensitively with natural number ordering", () => {
    expect(compareTableValues("House 2", "house 10")).toBeLessThan(0);
  });

  it("places missing values after populated values", () => {
    expect(compareTableValues(undefined, "Assigned")).toBeGreaterThan(0);
    expect(compareTableValues(null, undefined)).toBe(0);
  });
});
