import { sql } from "drizzle-orm";
import { check, index, integer, snakeCase, text, uniqueIndex } from "drizzle-orm/sqlite-core";

const table = snakeCase.table;
const timestamp = () => integer({ mode: "timestamp_ms" });

export const user = table("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull(),
  emailVerified: integer({ mode: "boolean" }).notNull(),
  image: text(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
  username: text(),
  role: text(),
  banned: integer({ mode: "boolean" }),
  banReason: text(),
  banExpires: timestamp(),
}, (t) => [
  uniqueIndex("user_email_uidx").on(t.email),
  uniqueIndex("user_username_uidx").on(t.username),
]);

export const session = table("session", {
  id: text().primaryKey(),
  expiresAt: timestamp().notNull(),
  token: text().notNull(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
  ipAddress: text(),
  userAgent: text(),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  activeOrganizationId: text(),
  impersonatedBy: text(),
}, (t) => [
  uniqueIndex("session_token_uidx").on(t.token),
  index("session_user_id_idx").on(t.userId),
]);

export const account = table("account", {
  id: text().primaryKey(),
  issuer: text().notNull(),
  accountId: text().notNull(),
  providerId: text().notNull(),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text(),
  refreshToken: text(),
  idToken: text(),
  accessTokenExpiresAt: timestamp(),
  refreshTokenExpiresAt: timestamp(),
  scope: text(),
  password: text(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
}, (t) => [
  index("account_user_id_idx").on(t.userId),
  uniqueIndex("account_issuer_account_id_uidx").on(t.issuer, t.accountId),
]);

export const verification = table("verification", {
  id: text().primaryKey(),
  identifier: text().notNull(),
  value: text().notNull(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().notNull(),
  updatedAt: timestamp().notNull(),
}, (t) => [index("verification_identifier_idx").on(t.identifier)]);

export const organization = table("organization", {
  id: text().primaryKey(),
  name: text().notNull(),
  slug: text().notNull(),
  logo: text(),
  createdAt: timestamp().notNull(),
  metadata: text(),
}, (t) => [uniqueIndex("organization_slug_uidx").on(t.slug)]);

export const member = table("member", {
  id: text().primaryKey(),
  organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  role: text().notNull(),
  createdAt: timestamp().notNull(),
}, (t) => [
  index("member_organization_id_idx").on(t.organizationId),
  index("member_user_id_idx").on(t.userId),
]);

export const invitation = table("invitation", {
  id: text().primaryKey(),
  organizationId: text().notNull().references(() => organization.id, { onDelete: "cascade" }),
  email: text().notNull(),
  role: text(),
  status: text().notNull(),
  expiresAt: timestamp().notNull(),
  createdAt: timestamp().notNull(),
  inviterId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
}, (t) => [
  index("invitation_organization_id_idx").on(t.organizationId),
  index("invitation_email_idx").on(t.email),
]);

export const credentials = table("credentials", {
  id: text().primaryKey(),
  householdId: text().notNull().references(() => organization.id, { onDelete: "restrict" }),
  label: text().notNull(),
  pin: text().notNull(),
  startsAt: text().notNull(),
  endsAt: text().notNull(),
  controllerVisitorId: text().notNull(),
  state: text({ enum: ["active", "upcoming", "expired", "revoked"] }).notNull().default("active"),
  revokedAt: text(),
  createdAt: text().notNull(),
}, (t) => [
  uniqueIndex("credentials_controller_visitor_id_uidx").on(t.controllerVisitorId),
  index("credentials_household_state_end_idx").on(t.householdId, t.state, t.endsAt),
]);

export const personPins = table("person_pins", {
  controllerUserId: text().primaryKey(),
  householdId: text().notNull().references(() => organization.id, { onDelete: "restrict" }),
  label: text().notNull(),
  pin: text().notNull(),
  replacedAt: text().notNull(),
}, (t) => [index("person_pins_household_idx").on(t.householdId)]);

export const visitorPins = table("visitor_pins", {
  controllerVisitorId: text().primaryKey(),
  householdId: text().notNull().references(() => organization.id, { onDelete: "restrict" }),
  label: text().notNull(),
  pin: text().notNull(),
  replacedAt: text().notNull(),
}, (t) => [index("visitor_pins_household_idx").on(t.householdId)]);

export const unifiPersonLinks = table("unifi_person_links", {
  controllerUserId: text().primaryKey(),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  linkedAt: text().notNull(),
}, (t) => [uniqueIndex("unifi_person_links_user_uidx").on(t.userId)]);

export const visitorHouseholds = table("visitor_households", {
  controllerVisitorId: text().primaryKey(),
  householdId: text().notNull().references(() => organization.id, { onDelete: "restrict" }),
  assignedAt: text().notNull(),
}, (t) => [index("visitor_households_household_idx").on(t.householdId)]);

export const auditEvents = table("audit_events", {
  id: text().primaryKey(),
  occurredAt: text().notNull(),
  actorUserId: text().notNull(),
  actorName: text().notNull(),
  householdId: text(),
  householdName: text(),
  action: text().notNull(),
  outcome: text({ enum: ["succeeded", "failed"] }).notNull(),
  details: text({ mode: "json" }).$type<Record<string, string | null>>().notNull().default({}),
}, (t) => [
  check("audit_events_outcome_check", sql`${t.outcome} in ('succeeded', 'failed')`),
  index("audit_events_occurred_at_idx").on(t.occurredAt),
  index("audit_events_household_occurred_at_idx").on(t.householdId, t.occurredAt),
]);

export const partyMode = table("party_mode", {
  id: integer().primaryKey(),
  state: text({ enum: ["scheduled", "starting", "active", "failed", "ended", "cancelled"] }).notNull(),
  startsAt: text().notNull(),
  endsAt: text().notNull(),
  householdId: text().notNull().references(() => organization.id, { onDelete: "restrict" }),
  householdName: text().notNull(),
  actorUserId: text().notNull(),
  actorName: text().notNull(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
}, (t) => [
  check("party_mode_singleton_check", sql`${t.id} = 1`),
  index("party_mode_state_end_idx").on(t.state, t.endsAt),
]);

export const gateCodes = table("gate_codes", {
  id: text().primaryKey(),
  householdId: text().notNull().references(() => organization.id, { onDelete: "restrict" }),
  label: text().notNull(),
  pin: text().notNull(),
  kind: text({ enum: ["home", "ongoing", "temporary"] }).notNull(),
  startsAt: text().notNull(),
  endsAt: text(),
  controllerEndsAt: text().notNull(),
  controllerVisitorId: text().notNull(),
  state: text({ enum: ["active", "disabled"] }).notNull().default("active"),
  disabledAt: text(),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
}, (t) => [
  check("gate_codes_kind_check", sql`${t.kind} in ('home', 'ongoing', 'temporary')`),
  check("gate_codes_state_check", sql`${t.state} in ('active', 'disabled')`),
  uniqueIndex("gate_codes_controller_visitor_id_uidx").on(t.controllerVisitorId),
  index("gate_codes_household_state_kind_idx").on(t.householdId, t.state, t.kind),
]);

export const userPhoneNumbers = table("user_phone_numbers", {
  id: text().primaryKey(),
  userId: text().notNull().references(() => user.id, { onDelete: "cascade" }),
  phoneE164: text("phone_e164").notNull(),
  label: text().notNull().default("Mobile"),
  notes: text().notNull().default(""),
  enabled: integer({ mode: "boolean" }).notNull().default(true),
  canOpen: integer({ mode: "boolean" }).notNull().default(true),
  canHoldOpen: integer({ mode: "boolean" }).notNull().default(false),
  createdAt: text().notNull(),
  updatedAt: text().notNull(),
}, (t) => [
  uniqueIndex("user_phone_numbers_phone_e164_uidx").on(t.phoneE164),
  index("user_phone_numbers_user_idx").on(t.userId),
]);

export const twilioActionAttempts = table("twilio_action_attempts", {
  id: text().primaryKey(),
  callSid: text().notNull(),
  action: text({ enum: ["open", "hold_open"] }).notNull(),
  callerE164: text("caller_e164").notNull(),
  actorUserId: text().notNull(),
  actorName: text().notNull(),
  householdId: text().notNull(),
  householdName: text().notNull(),
  status: text({ enum: ["pending", "succeeded", "failed", "unknown"] }).notNull(),
  requestedAt: text().notNull(),
  completedAt: text(),
  detail: text().notNull().default(""),
}, (t) => [
  check("twilio_action_attempts_action_check", sql`${t.action} in ('open', 'hold_open')`),
  check("twilio_action_attempts_status_check", sql`${t.status} in ('pending', 'succeeded', 'failed', 'unknown')`),
  uniqueIndex("twilio_action_attempts_call_action_uidx").on(t.callSid, t.action),
  index("twilio_action_attempts_requested_idx").on(t.requestedAt),
]);

export const twilioEvents = table("twilio_events", {
  id: text().primaryKey(),
  occurredAt: text().notNull(),
  callSid: text().notNull().default(""),
  callerE164: text("caller_e164").notNull().default(""),
  event: text().notNull(),
  detail: text().notNull().default(""),
  actorUserId: text(),
  householdId: text(),
}, (t) => [
  index("twilio_events_occurred_idx").on(t.occurredAt),
  index("twilio_events_call_idx").on(t.callSid, t.occurredAt),
]);

export const unifiServiceAccounts = table("unifi_service_accounts", {
  controllerUserId: text().primaryKey(),
  label: text().notNull(),
  markedAt: text().notNull(),
  markedByUserId: text().notNull(),
  markedByName: text().notNull(),
}, (t) => [index("unifi_service_accounts_marked_at_idx").on(t.markedAt)]);

export const unifiAccessEvents = table("unifi_access_events", {
  id: text().primaryKey(),
  occurredAt: text().notNull(),
  actorControllerId: text(),
  actorType: text().notNull().default(""),
  actorDisplayName: text().notNull().default(""),
  credentialProvider: text().notNull().default(""),
  eventType: text().notNull(),
  result: text().notNull().default(""),
  displayMessage: text().notNull().default(""),
  reason: text().notNull().default(""),
  doorId: text().notNull(),
  doorName: text().notNull().default(""),
  activityResourceId: text(),
  receivedAt: text().notNull(),
}, (t) => [
  index("unifi_access_events_occurred_idx").on(t.occurredAt),
  index("unifi_access_events_actor_occurred_idx").on(t.actorControllerId, t.occurredAt),
  index("unifi_access_events_result_occurred_idx").on(t.result, t.occurredAt),
]);

export const unifiActorLinks = table("unifi_actor_links", {
  controllerActorId: text().primaryKey(),
  actorType: text().notNull(),
  subjectType: text({ enum: ["gate_code", "credential", "person", "visitor"] }).notNull(),
  subjectId: text().notNull(),
  householdId: text().references(() => organization.id, { onDelete: "restrict" }),
  label: text().notNull().default(""),
  role: text({ enum: ["current", "legacy", "assigned"] }).notNull().default("current"),
  linkedAt: text().notNull(),
  retiredAt: text(),
}, (t) => [
  index("unifi_actor_links_subject_idx").on(t.subjectType, t.subjectId),
  index("unifi_actor_links_household_idx").on(t.householdId),
]);

export const unifiAccessSyncState = table("unifi_access_sync_state", {
  id: integer().primaryKey(),
  state: text({ enum: ["idle", "running", "succeeded", "failed"] }).notNull().default("idle"),
  coverageStartsAt: text(),
  completeThrough: text(),
  lastStartedAt: text(),
  lastSucceededAt: text(),
  lastError: text().notNull().default(""),
  updatedAt: text().notNull(),
}, (t) => [check("unifi_access_sync_state_singleton_check", sql`${t.id} = 1`)]);
