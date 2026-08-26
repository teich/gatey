import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { admin, organization, username } from "better-auth/plugins";
import { nextCookies } from "better-auth/next-js";
import { database } from "./database.ts";

export const BOOTSTRAP_ADMIN_EMAIL = "oren@teich.net";
export const BOOTSTRAP_ADMIN_USERNAME = "oren";
export const BOOTSTRAP_HOUSEHOLD_ID = "oren-home";

type CreatedUser = {
  id: string;
  email: string;
  username?: string | null;
};

let addBootstrapOwner: (user: CreatedUser) => Promise<void> = async () => undefined;

function hasGateyRecords(householdId: string) {
  const row = database.prepare(`
    SELECT EXISTS(
      SELECT 1 FROM credentials WHERE household_id = ?
      UNION ALL SELECT 1 FROM visitor_pins WHERE household_id = ?
      UNION ALL SELECT 1 FROM person_pins WHERE household_id = ?
    ) AS hasRecords
  `).get(householdId, householdId, householdId) as { hasRecords: number };
  return Boolean(row.hasRecords);
}

export const auth = betterAuth({
  database,
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
          const otherMember = database.prepare("SELECT 1 FROM member WHERE organizationId = ? AND userId != ? LIMIT 1").get(organization.id, user.id);
          if (otherMember) throw APIError.fromStatus("BAD_REQUEST", { message: "Remove the household's residents before deleting it." });
          if (hasGateyRecords(organization.id)) {
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

  const existing = database.prepare("SELECT 1 FROM member WHERE userId = ? AND organizationId = ?").get(user.id, BOOTSTRAP_HOUSEHOLD_ID);
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
