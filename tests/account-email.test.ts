import { describe, expect, it } from "vitest";
import {
  isManagedAccountEmail,
  managedAccountEmail,
  optionalAccountEmail,
  visibleAccountEmail,
} from "@/lib/account-email";

describe("managed resident email identities", () => {
  it("creates a reserved unique identity from the username", () => {
    expect(managedAccountEmail("Marianella.Jane")).toBe("marianella.jane@users.gatey.invalid");
    expect(isManagedAccountEmail("marianella.jane@users.gatey.invalid")).toBe(true);
  });

  it("hides internal identities from administrator-facing data", () => {
    expect(visibleAccountEmail("marianella.jane@users.gatey.invalid")).toBeNull();
    expect(visibleAccountEmail("jane@example.com")).toBe("jane@example.com");
  });

  it("accepts an omitted email but validates a supplied one", () => {
    expect(optionalAccountEmail("  ")).toBeNull();
    expect(optionalAccountEmail(undefined)).toBeNull();
    expect(optionalAccountEmail(" JANE@EXAMPLE.COM ")).toBe("jane@example.com");
    expect(() => optionalAccountEmail("not-an-email")).toThrow("Enter a valid email address");
  });
});
