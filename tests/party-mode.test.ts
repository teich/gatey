import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";

const controller = vi.hoisted(() => ({
  holdGateOpenUntil: vi.fn(),
  endGateHoldOpen: vi.fn(),
}));

vi.mock("@/lib/unifi-access", () => controller);
vi.mock("@/lib/audit-log", () => ({ recordAuditEvent: vi.fn() }));

import { database } from "@/lib/database";
import { organization, partyMode as partyModeTable } from "@/lib/schema";
import {
  endPartyMode,
  PartyModeConflictError,
  PartyModeValidationError,
  reconcilePartyMode,
  schedulePartyMode,
} from "@/lib/party-mode";

const NOW = new Date("2026-08-29T19:00:00.000Z"); // Noon in Los Angeles.

function partyInput(startsAt: Date, endsAt: Date, householdId = "home-a") {
  return {
    startsAt,
    endsAt,
    householdId,
    householdName: householdId === "home-a" ? "Home A" : "Home B",
    actorUserId: `user-${householdId}`,
    actorName: "Test Resident",
  };
}

function storedState() {
  return database.select({ state: partyModeTable.state }).from(partyModeTable)
    .where(eq(partyModeTable.id, 1)).get()?.state;
}

describe("party-mode state machine", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    controller.holdGateOpenUntil.mockReset().mockResolvedValue(undefined);
    controller.endGateHoldOpen.mockReset().mockResolvedValue(undefined);
    const globalParty = globalThis as typeof globalThis & { gateyPartyTimer?: ReturnType<typeof setTimeout> };
    if (globalParty.gateyPartyTimer) clearTimeout(globalParty.gateyPartyTimer);
    delete globalParty.gateyPartyTimer;
    database.delete(partyModeTable).run();
    for (const [id, name] of [["home-a", "Home A"], ["home-b", "Home B"]]) {
      database.insert(organization).values({ id, name, slug: id, createdAt: NOW })
        .onConflictDoNothing().run();
    }
  });

  afterEach(() => {
    const globalParty = globalThis as typeof globalThis & { gateyPartyTimer?: ReturnType<typeof setTimeout> };
    if (globalParty.gateyPartyTimer) clearTimeout(globalParty.gateyPartyTimer);
    delete globalParty.gateyPartyTimer;
    vi.useRealTimers();
  });

  it("keeps a future request scheduled without contacting the controller", async () => {
    const party = await schedulePartyMode(partyInput(
      new Date(NOW.getTime() + 60_000),
      new Date(NOW.getTime() + 3_600_000),
    ));

    expect(party?.state).toBe("scheduled");
    expect(storedState()).toBe("scheduled");
    expect(controller.holdGateOpenUntil).not.toHaveBeenCalled();
  });

  it("starts a due schedule exactly once across repeated reconciliation", async () => {
    await schedulePartyMode(partyInput(
      new Date(NOW.getTime() + 60_000),
      new Date(NOW.getTime() + 3_600_000),
    ));
    database.update(partyModeTable).set({ startsAt: new Date(NOW.getTime() - 1_000).toISOString() })
      .where(eq(partyModeTable.id, 1)).run();

    const first = await reconcilePartyMode();
    const second = await reconcilePartyMode();

    expect(first?.state).toBe("active");
    expect(second?.state).toBe("active");
    expect(controller.holdGateOpenUntil).toHaveBeenCalledTimes(1);
  });

  it("records a failed state when the controller cannot start a due schedule", async () => {
    controller.holdGateOpenUntil.mockRejectedValueOnce(new Error("controller unavailable"));
    await expect(schedulePartyMode(partyInput(
      NOW,
      new Date(NOW.getTime() + 3_600_000),
    ))).rejects.toThrow("UniFi could not hold the gate open");

    expect(storedState()).toBe("failed");
    expect(await reconcilePartyMode()).toBeNull();
  });

  it("rejects past, cross-day, and backwards schedules", async () => {
    await expect(schedulePartyMode(partyInput(
      new Date(NOW.getTime() - 60_000),
      new Date(NOW.getTime() + 60_000),
    ))).rejects.toBeInstanceOf(PartyModeValidationError);
    await expect(schedulePartyMode(partyInput(
      new Date(NOW.getTime() + 60_000),
      new Date("2026-08-30T20:00:00.000Z"),
    ))).rejects.toBeInstanceOf(PartyModeValidationError);
    await expect(schedulePartyMode(partyInput(
      new Date(NOW.getTime() + 120_000),
      new Date(NOW.getTime() + 60_000),
    ))).rejects.toBeInstanceOf(PartyModeValidationError);
  });

  it("does not let a second household replace an unexpired schedule", async () => {
    await schedulePartyMode(partyInput(
      new Date(NOW.getTime() + 60_000),
      new Date(NOW.getTime() + 3_600_000),
    ));

    await expect(schedulePartyMode(partyInput(
      new Date(NOW.getTime() + 120_000),
      new Date(NOW.getTime() + 7_200_000),
      "home-b",
    ))).rejects.toBeInstanceOf(PartyModeConflictError);
    expect(storedState()).toBe("scheduled");
  });

  it("lets the owner cancel a schedule without calling the controller", async () => {
    await schedulePartyMode(partyInput(
      new Date(NOW.getTime() + 60_000),
      new Date(NOW.getTime() + 3_600_000),
    ));

    await endPartyMode({ householdId: "home-a", isSystemAdmin: false });

    expect(storedState()).toBe("cancelled");
    expect(controller.endGateHoldOpen).not.toHaveBeenCalled();
  });

  it("protects another household's active hold but permits an administrator", async () => {
    await schedulePartyMode(partyInput(NOW, new Date(NOW.getTime() + 3_600_000)));

    await expect(endPartyMode({ householdId: "home-b", isSystemAdmin: false }))
      .rejects.toBeInstanceOf(PartyModeConflictError);
    expect(storedState()).toBe("active");

    await endPartyMode({ householdId: "home-b", isSystemAdmin: true });
    expect(storedState()).toBe("cancelled");
    expect(controller.endGateHoldOpen).toHaveBeenCalledOnce();
  });

  it("restores active state when ending the controller hold fails", async () => {
    await schedulePartyMode(partyInput(NOW, new Date(NOW.getTime() + 3_600_000)));
    controller.endGateHoldOpen.mockRejectedValueOnce(new Error("controller unavailable"));

    await expect(endPartyMode({ householdId: "home-a", isSystemAdmin: false }))
      .rejects.toThrow("controller unavailable");
    expect(storedState()).toBe("active");
  });
});
