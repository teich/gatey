import "server-only";

import { randomUUID } from "node:crypto";
import { and, eq, ne, sql } from "drizzle-orm";
import { database } from "@/lib/database";
import { gateCodes, unifiActorLinks, visitorHouseholds } from "@/lib/schema";

export type GateCodeKind = "home" | "ongoing" | "temporary";
export type GateCodeState = "active" | "disabled";

export type GateCode = {
  id: string;
  label: string;
  pin: string;
  kind: GateCodeKind;
  startsAt: string;
  endsAt?: string;
  controllerEndsAt: string;
  controllerVisitorId: string;
  state: GateCodeState;
  disabledAt?: string;
};

function mapGateCode(row: typeof gateCodes.$inferSelect): GateCode {
  return {
    id: row.id,
    label: row.label,
    pin: row.pin,
    kind: row.kind,
    startsAt: row.startsAt,
    ...(row.endsAt ? { endsAt: row.endsAt } : {}),
    controllerEndsAt: row.controllerEndsAt,
    controllerVisitorId: row.controllerVisitorId,
    state: row.state,
    ...(row.disabledAt ? { disabledAt: row.disabledAt } : {}),
  };
}

export function listGateCodes(householdId: string): GateCode[] {
  const rows = database.select().from(gateCodes).where(eq(gateCodes.householdId, householdId))
    .orderBy(sql`case ${gateCodes.kind} when 'home' then 0 when 'ongoing' then 1 else 2 end`, sql`${gateCodes.label} collate nocase`).all();
  return rows.map(mapGateCode);
}

export function managedGateyVisitorIds(): Set<string> {
  const rows = database.select({ controllerVisitorId: gateCodes.controllerVisitorId }).from(gateCodes).where(eq(gateCodes.state, "active")).all();
  return new Set(rows.map((row) => row.controllerVisitorId));
}

export function findGateCode(householdId: string, id: string): GateCode | undefined {
  const row = database.select().from(gateCodes).where(and(eq(gateCodes.householdId, householdId), eq(gateCodes.id, id))).get();
  return row ? mapGateCode(row) : undefined;
}

export function findHomeCode(householdId: string): GateCode | undefined {
  const row = database.select().from(gateCodes).where(and(
    eq(gateCodes.householdId, householdId),
    eq(gateCodes.kind, "home"),
    eq(gateCodes.state, "active"),
  )).get();
  return row ? mapGateCode(row) : undefined;
}

export function hasGateCodePin(pin: string, exceptId?: string): boolean {
  return Boolean(database.select({ id: gateCodes.id }).from(gateCodes)
    .where(and(eq(gateCodes.pin, pin), eq(gateCodes.state, "active"), ne(gateCodes.id, exceptId || ""))).limit(1).get());
}

export function hasHomeCode(householdId: string, exceptId?: string): boolean {
  return Boolean(database.select({ id: gateCodes.id }).from(gateCodes)
    .where(and(eq(gateCodes.householdId, householdId), eq(gateCodes.kind, "home"), eq(gateCodes.state, "active"), ne(gateCodes.id, exceptId || ""))).limit(1).get());
}

export function saveGateCode(input: {
  id?: string;
  householdId: string;
  label: string;
  pin: string;
  kind: GateCodeKind;
  startsAt: string;
  endsAt?: string;
  controllerEndsAt: string;
  controllerVisitorId: string;
  legacyControllerVisitorIds?: string[];
}) {
  const id = input.id || randomUUID();
  const now = new Date().toISOString();
  database.transaction((tx) => {
    tx.insert(gateCodes).values({
      id,
      householdId: input.householdId,
      label: input.label,
      pin: input.pin,
      kind: input.kind,
      startsAt: input.startsAt,
      endsAt: input.endsAt ?? null,
      controllerEndsAt: input.controllerEndsAt,
      controllerVisitorId: input.controllerVisitorId,
      state: "active",
      disabledAt: null,
      createdAt: now,
      updatedAt: now,
    }).run();
    tx.insert(visitorHouseholds).values({ controllerVisitorId: input.controllerVisitorId, householdId: input.householdId, assignedAt: now })
      .onConflictDoUpdate({ target: visitorHouseholds.controllerVisitorId, set: { householdId: input.householdId, assignedAt: now } }).run();
    const actors = [
      { controllerActorId: input.controllerVisitorId, role: "current" as const, retiredAt: null },
      ...(input.legacyControllerVisitorIds || [])
        .filter((controllerActorId) => controllerActorId !== input.controllerVisitorId)
        .map((controllerActorId) => ({ controllerActorId, role: "legacy" as const, retiredAt: now })),
    ];
    for (const actor of actors) {
      const values = {
        ...actor,
        actorType: "visitor",
        subjectType: "gate_code" as const,
        subjectId: id,
        householdId: input.householdId,
        label: input.label,
        linkedAt: now,
      };
      tx.insert(unifiActorLinks).values(values).onConflictDoUpdate({
        target: unifiActorLinks.controllerActorId,
        set: values,
      }).run();
    }
  }, { behavior: "immediate" });
  return id;
}

export function updateGateCode(input: { householdId: string; id: string; label?: string; pin?: string }) {
  const existing = findGateCode(input.householdId, input.id);
  if (!existing) return undefined;
  database.transaction((tx) => {
    tx.update(gateCodes).set({ label: input.label ?? existing.label, pin: input.pin ?? existing.pin, updatedAt: new Date().toISOString() })
      .where(and(eq(gateCodes.id, input.id), eq(gateCodes.householdId, input.householdId))).run();
    if (input.label !== undefined) {
      tx.update(unifiActorLinks).set({ label: input.label }).where(and(
        eq(unifiActorLinks.subjectType, "gate_code"),
        eq(unifiActorLinks.subjectId, input.id),
        eq(unifiActorLinks.householdId, input.householdId),
      )).run();
    }
  }, { behavior: "immediate" });
  return findGateCode(input.householdId, input.id);
}

export function disableGateCode(householdId: string, id: string) {
  const now = new Date().toISOString();
  database.update(gateCodes).set({ state: "disabled", disabledAt: now, updatedAt: now })
    .where(and(eq(gateCodes.id, id), eq(gateCodes.householdId, householdId))).run();
}
