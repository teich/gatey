import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { database } from "@/lib/database";
import { listHouseholds } from "@/lib/households";
import { gateCodes, organization, visitorHouseholds } from "@/lib/schema";

const householdId = randomUUID();
const homeCodeId = randomUUID();
const ongoingCodeId = randomUUID();
const homeVisitorId = randomUUID();
const ongoingVisitorId = randomUUID();

afterEach(() => {
  database.delete(visitorHouseholds).where(eq(visitorHouseholds.householdId, householdId)).run();
  database.delete(gateCodes).where(eq(gateCodes.householdId, householdId)).run();
  database.delete(organization).where(eq(organization.id, householdId)).run();
});

describe("household directory access summaries", () => {
  it("shows the home PIN separately and leaves real visitor passes counted", () => {
    const now = new Date();
    const nowIso = now.toISOString();
    const end = "2040-01-01T00:00:00.000Z";
    database.insert(organization).values({ id: householdId, name: "Managed household", slug: householdId, createdAt: now }).run();
    database.insert(gateCodes).values([
      { id: homeCodeId, householdId, label: "Household code", pin: "2468", kind: "home", startsAt: nowIso, controllerEndsAt: end, controllerVisitorId: homeVisitorId, state: "active", createdAt: nowIso, updatedAt: nowIso },
      { id: ongoingCodeId, householdId, label: "Gardener", pin: "1357", kind: "ongoing", startsAt: nowIso, controllerEndsAt: end, controllerVisitorId: ongoingVisitorId, state: "active", createdAt: nowIso, updatedAt: nowIso },
    ]).run();
    database.insert(visitorHouseholds).values([
      { controllerVisitorId: homeVisitorId, householdId, assignedAt: nowIso },
      { controllerVisitorId: ongoingVisitorId, householdId, assignedAt: nowIso },
    ]).run();

    const household = listHouseholds().find((item) => item.id === householdId);

    expect(household?.gateCode).toEqual({ id: homeCodeId, pin: "2468" });
    expect(household?.visitorCount).toBe(1);
    expect(household?.members).toEqual([]);
  });

  it("enforces one active household code at the database boundary", () => {
    const now = new Date();
    const nowIso = now.toISOString();
    database.insert(organization).values({ id: householdId, name: "Managed household", slug: householdId, createdAt: now }).run();
    database.insert(gateCodes).values({ id: homeCodeId, householdId, label: "Household code", pin: "2468", kind: "home", startsAt: nowIso, controllerEndsAt: "2040-01-01T00:00:00.000Z", controllerVisitorId: homeVisitorId, state: "active", createdAt: nowIso, updatedAt: nowIso }).run();

    expect(() => database.insert(gateCodes).values({ id: ongoingCodeId, householdId, label: "Second household code", pin: "1357", kind: "home", startsAt: nowIso, controllerEndsAt: "2040-01-01T00:00:00.000Z", controllerVisitorId: ongoingVisitorId, state: "active", createdAt: nowIso, updatedAt: nowIso }).run()).toThrow();
  });
});
