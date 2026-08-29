import "server-only";

import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { Credential, CredentialState } from "@/lib/credentials";
import { database } from "@/lib/database";
import { credentials, personPins, visitorHouseholds, visitorPins } from "@/lib/schema";

type CredentialRow = Pick<typeof credentials.$inferSelect, "id" | "label" | "pin" | "startsAt" | "endsAt" | "state" | "revokedAt">;

export type HouseholdPermanentCode = {
  id: string;
  label: string;
  pin: string;
};

export type CredentialUsageLookup = {
  id: string;
  controllerVisitorId: string;
  startsAt: string;
  endsAt: string;
};

function mapCredential(row: CredentialRow): Credential {
  const now = Date.now();
  const computedState: CredentialState = row.revokedAt
    ? "revoked"
    : new Date(row.startsAt).getTime() > now
      ? "upcoming"
      : new Date(row.endsAt).getTime() < now
        ? "expired"
        : row.state;
  return {
    id: row.id,
    label: row.label,
    pin: row.pin,
    startsAt: row.startsAt,
    endsAt: row.endsAt,
    state: computedState,
    ...(row.revokedAt ? { revokedAt: row.revokedAt } : {}),
  };
}

export function listCredentials(householdId: string): Credential[] {
  const rows = database.select({
    id: credentials.id,
    label: credentials.label,
    pin: credentials.pin,
    startsAt: credentials.startsAt,
    endsAt: credentials.endsAt,
    state: credentials.state,
    revokedAt: credentials.revokedAt,
  }).from(credentials).where(eq(credentials.householdId, householdId))
    .orderBy(desc(credentials.startsAt), desc(credentials.createdAt)).all();
  return rows.map(mapCredential);
}

export function listCredentialUsageLookups(householdId: string): CredentialUsageLookup[] {
  return database.select({ id: credentials.id, controllerVisitorId: credentials.controllerVisitorId, startsAt: credentials.startsAt, endsAt: credentials.endsAt })
    .from(credentials).where(eq(credentials.householdId, householdId)).all();
}

export function listHouseholdPermanentCodes(householdId: string): HouseholdPermanentCode[] {
  return database.select({ id: personPins.controllerUserId, label: personPins.label, pin: personPins.pin })
    .from(personPins).where(eq(personPins.householdId, householdId))
    .orderBy(asc(personPins.replacedAt), sql`${personPins.label} collate nocase`).all();
}

export function insertCredential(householdId: string, credential: Credential, controllerVisitorId: string) {
  const createdAt = new Date().toISOString();
  database.transaction((tx) => {
    tx.insert(credentials).values({
      id: credential.id,
      householdId,
      label: credential.label,
      pin: credential.pin,
      startsAt: credential.startsAt,
      endsAt: credential.endsAt,
      controllerVisitorId,
      state: credential.state,
      revokedAt: credential.revokedAt ?? null,
      createdAt,
    }).run();
    tx.insert(visitorHouseholds).values({ controllerVisitorId, householdId, assignedAt: createdAt })
      .onConflictDoUpdate({ target: visitorHouseholds.controllerVisitorId, set: { householdId } }).run();
  }, { behavior: "immediate" });
}

export function getControllerVisitorId(householdId: string, id: string): string | undefined {
  return database.select({ controllerVisitorId: credentials.controllerVisitorId }).from(credentials)
    .where(and(eq(credentials.id, id), eq(credentials.householdId, householdId))).get()?.controllerVisitorId;
}

export function managedVisitorIds(): Set<string> {
  const rows = database.select({ controllerVisitorId: credentials.controllerVisitorId }).from(credentials).all();
  return new Set(rows.map((row) => row.controllerVisitorId));
}

export function managedVisitorPins(): Map<string, string> {
  const rows = [
    ...database.select({ id: credentials.controllerVisitorId, pin: credentials.pin }).from(credentials).all(),
    ...database.select({ id: visitorPins.controllerVisitorId, pin: visitorPins.pin }).from(visitorPins).all(),
  ];
  return new Map(rows.map((row) => [row.id, row.pin]));
}

export function saveVisitorPin(input: { householdId: string; visitorId: string; label: string; pin: string }) {
  const replacedAt = new Date().toISOString();
  database.transaction((tx) => {
    const pinValues = { controllerVisitorId: input.visitorId, householdId: input.householdId, label: input.label, pin: input.pin, replacedAt };
    tx.insert(visitorPins).values(pinValues).onConflictDoUpdate({ target: visitorPins.controllerVisitorId, set: pinValues }).run();
    tx.update(credentials).set({ pin: input.pin }).where(and(eq(credentials.controllerVisitorId, input.visitorId), eq(credentials.householdId, input.householdId))).run();
    tx.insert(visitorHouseholds).values({ controllerVisitorId: input.visitorId, householdId: input.householdId, assignedAt: replacedAt })
      .onConflictDoUpdate({ target: visitorHouseholds.controllerVisitorId, set: { householdId: input.householdId } }).run();
  }, { behavior: "immediate" });
}

export function managedPersonPins(): Map<string, string> {
  const rows = database.select({ controllerUserId: personPins.controllerUserId, pin: personPins.pin }).from(personPins).all();
  return new Map(rows.map((row) => [row.controllerUserId, row.pin]));
}

export function savePersonPin(input: { householdId: string; userId: string; label: string; pin: string }) {
  const values = { controllerUserId: input.userId, householdId: input.householdId, label: input.label, pin: input.pin, replacedAt: new Date().toISOString() };
  database.insert(personPins).values(values).onConflictDoUpdate({ target: personPins.controllerUserId, set: values }).run();
}

export function markRevoked(householdId: string, id: string) {
  database.update(credentials).set({ state: "revoked", revokedAt: new Date().toISOString() })
    .where(and(eq(credentials.id, id), eq(credentials.householdId, householdId))).run();
}
