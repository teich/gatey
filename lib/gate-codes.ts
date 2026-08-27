import "server-only";

import { randomUUID } from "node:crypto";
import { database } from "@/lib/database";

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

type GateCodeRow = {
  id: string;
  label: string;
  pin: string;
  kind: GateCodeKind;
  starts_at: string;
  ends_at: string | null;
  controller_ends_at: string;
  controller_visitor_id: string;
  state: GateCodeState;
  disabled_at: string | null;
};

function mapGateCode(row: GateCodeRow): GateCode {
  return {
    id: row.id,
    label: row.label,
    pin: row.pin,
    kind: row.kind,
    startsAt: row.starts_at,
    ...(row.ends_at ? { endsAt: row.ends_at } : {}),
    controllerEndsAt: row.controller_ends_at,
    controllerVisitorId: row.controller_visitor_id,
    state: row.state,
    ...(row.disabled_at ? { disabledAt: row.disabled_at } : {}),
  };
}

export function listGateCodes(householdId: string): GateCode[] {
  const rows = database.prepare(`
    SELECT id, label, pin, kind, starts_at, ends_at, controller_ends_at,
      controller_visitor_id, state, disabled_at
    FROM gate_codes
    WHERE household_id = ?
    ORDER BY CASE kind WHEN 'home' THEN 0 WHEN 'ongoing' THEN 1 ELSE 2 END, label COLLATE NOCASE
  `).all(householdId) as GateCodeRow[];
  return rows.map(mapGateCode);
}

export function managedGateyVisitorIds(): Set<string> {
  const rows = database.prepare("SELECT controller_visitor_id FROM gate_codes WHERE state = 'active'").all() as Array<{ controller_visitor_id: string }>;
  return new Set(rows.map((row) => row.controller_visitor_id));
}

export function findGateCode(householdId: string, id: string): GateCode | undefined {
  const row = database.prepare(`
    SELECT id, label, pin, kind, starts_at, ends_at, controller_ends_at,
      controller_visitor_id, state, disabled_at
    FROM gate_codes WHERE household_id = ? AND id = ?
  `).get(householdId, id) as GateCodeRow | undefined;
  return row ? mapGateCode(row) : undefined;
}

export function hasGateCodePin(pin: string, exceptId?: string): boolean {
  const row = database.prepare("SELECT 1 FROM gate_codes WHERE pin = ? AND state = 'active' AND id != ? LIMIT 1").get(pin, exceptId || "") as object | undefined;
  return Boolean(row);
}

export function hasHomeCode(householdId: string, exceptId?: string): boolean {
  const row = database.prepare("SELECT 1 FROM gate_codes WHERE household_id = ? AND kind = 'home' AND state = 'active' AND id != ? LIMIT 1").get(householdId, exceptId || "") as object | undefined;
  return Boolean(row);
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
}) {
  const id = input.id || randomUUID();
  const now = new Date().toISOString();
  database.exec("BEGIN IMMEDIATE");
  try {
  database.prepare(`
    INSERT INTO gate_codes (
      id, household_id, label, pin, kind, starts_at, ends_at, controller_ends_at,
      controller_visitor_id, state, disabled_at, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', NULL, ?, ?)
  `).run(id, input.householdId, input.label, input.pin, input.kind, input.startsAt, input.endsAt ?? null, input.controllerEndsAt, input.controllerVisitorId, now, now);
  database.prepare(`
    INSERT INTO visitor_households (controller_visitor_id, household_id, assigned_at)
    VALUES (?, ?, ?)
    ON CONFLICT(controller_visitor_id) DO UPDATE SET household_id = excluded.household_id, assigned_at = excluded.assigned_at
  `).run(input.controllerVisitorId, input.householdId, now);
  database.exec("COMMIT");
  return id;
  } catch (error) {
    database.exec("ROLLBACK");
    throw error;
  }
}

export function updateGateCode(input: { householdId: string; id: string; label?: string; pin?: string }) {
  const existing = findGateCode(input.householdId, input.id);
  if (!existing) return undefined;
  database.prepare("UPDATE gate_codes SET label = ?, pin = ?, updated_at = ? WHERE id = ? AND household_id = ?").run(input.label ?? existing.label, input.pin ?? existing.pin, new Date().toISOString(), input.id, input.householdId);
  return findGateCode(input.householdId, input.id);
}

export function disableGateCode(householdId: string, id: string) {
  database.prepare("UPDATE gate_codes SET state = 'disabled', disabled_at = ?, updated_at = ? WHERE id = ? AND household_id = ?").run(new Date().toISOString(), new Date().toISOString(), id, householdId);
}
