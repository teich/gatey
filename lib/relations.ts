import { defineRelations } from "drizzle-orm";
import * as schema from "./schema.ts";

export const relations = defineRelations(schema, (r) => ({
  user: {
    sessions: r.many.session(),
    accounts: r.many.account(),
    memberships: r.many.member(),
    invitations: r.many.invitation(),
    personLink: r.one.unifiPersonLinks(),
    phoneNumbers: r.many.userPhoneNumbers(),
  },
  session: {
    user: r.one.user({ from: r.session.userId, to: r.user.id }),
  },
  account: {
    user: r.one.user({ from: r.account.userId, to: r.user.id }),
  },
  organization: {
    members: r.many.member(),
    invitations: r.many.invitation(),
    visitorAssignments: r.many.visitorHouseholds(),
    gateCodes: r.many.gateCodes(),
  },
  member: {
    organization: r.one.organization({ from: r.member.organizationId, to: r.organization.id }),
    user: r.one.user({ from: r.member.userId, to: r.user.id }),
  },
  invitation: {
    organization: r.one.organization({ from: r.invitation.organizationId, to: r.organization.id }),
    inviter: r.one.user({ from: r.invitation.inviterId, to: r.user.id }),
  },
  unifiPersonLinks: {
    user: r.one.user({ from: r.unifiPersonLinks.userId, to: r.user.id }),
  },
  visitorHouseholds: {
    organization: r.one.organization({ from: r.visitorHouseholds.householdId, to: r.organization.id }),
  },
  gateCodes: {
    organization: r.one.organization({ from: r.gateCodes.householdId, to: r.organization.id }),
  },
  userPhoneNumbers: {
    user: r.one.user({ from: r.userPhoneNumbers.userId, to: r.user.id }),
  },
}));
