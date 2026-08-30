import { betterAuth } from "better-auth";
import { drizzleAdapter } from "@better-auth/drizzle-adapter/relations-v2";
import { APIError } from "better-auth/api";
import { admin, organization, username } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { and, eq, ne } from "drizzle-orm";
import { database } from "./database.ts";
import * as schema from "./schema.ts";

export const BOOTSTRAP_ADMIN_EMAIL = "oren@teich.net";
export const BOOTSTRAP_ADMIN_USERNAME = "oren";
export const BOOTSTRAP_HOUSEHOLD_ID = "oren-home";

type CreatedUser = {
  id: string;
  email: string;
  username?: string | null;
};

let addBootstrapOwner: (user: CreatedUser) => Promise<void> = async () => undefined;

function householdHasGateyRecords(householdId: string) {
  return Boolean(
    database.select({ id: schema.credentials.id }).from(schema.credentials).where(eq(schema.credentials.householdId, householdId)).limit(1).get()
    ?? database.select({ id: schema.visitorPins.controllerVisitorId }).from(schema.visitorPins).where(eq(schema.visitorPins.householdId, householdId)).limit(1).get()
    ?? database.select({ id: schema.personPins.controllerUserId }).from(schema.personPins).where(eq(schema.personPins.householdId, householdId)).limit(1).get()
    ?? database.select({ id: schema.visitorHouseholds.controllerVisitorId }).from(schema.visitorHouseholds).where(eq(schema.visitorHouseholds.householdId, householdId)).limit(1).get()
    ?? database.select({ id: schema.gateCodes.id }).from(schema.gateCodes).where(eq(schema.gateCodes.householdId, householdId)).limit(1).get(),
  );
}

export const auth = betterAuth({
  database: drizzleAdapter(database, { provider: "sqlite", schema, transaction: true }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 90,
    updateAge: 60 * 60 * 24,
  },
  advanced: {
    database: {
      joins: true,
    },
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await addBootstrapOwner(user as CreatedUser);
        },
      },
    },
  },
  plugins: [
    username({
      displayUsername: false,
      immutableUsername: true,
    }),
    organization({
      allowUserToCreateOrganization: (user) => String(user.role ?? "").split(",").includes("admin"),
      organizationHooks: {
        beforeDeleteOrganization: async ({ organization, user }) => {
          if (organization.id === BOOTSTRAP_HOUSEHOLD_ID) {
            throw APIError.fromStatus("BAD_REQUEST", { message: "The initial Gatey household cannot be deleted." });
          }
          const otherMember = database.select({ id: schema.member.id }).from(schema.member)
            .where(and(eq(schema.member.organizationId, organization.id), ne(schema.member.userId, user.id))).limit(1).get();
          if (otherMember) throw APIError.fromStatus("BAD_REQUEST", { message: "Remove the household's residents before deleting it." });
          if (householdHasGateyRecords(organization.id)) {
            throw APIError.fromStatus("BAD_REQUEST", { message: "This household has Gatey records and cannot be deleted." });
          }
        },
      },
    }),
    admin(),
    nextCookies(),
  ],
});

addBootstrapOwner = async (user) => {
  const isBootstrapAdmin = user.email.toLowerCase() === BOOTSTRAP_ADMIN_EMAIL || user.username?.toLowerCase() === BOOTSTRAP_ADMIN_USERNAME;
  if (!isBootstrapAdmin) return;

  const existing = database.select({ id: schema.member.id }).from(schema.member)
    .where(and(eq(schema.member.userId, user.id), eq(schema.member.organizationId, BOOTSTRAP_HOUSEHOLD_ID))).get();
  if (existing) return;

  await auth.api.addMember({
    body: {
      userId: user.id,
      role: "owner",
      organizationId: BOOTSTRAP_HOUSEHOLD_ID,
    },
  });
};

export type AuthSession = typeof auth.$Infer.Session;
