import "server-only";

import { randomBytes } from "node:crypto";

export function createTemporaryPassword() {
  return randomBytes(18).toString("base64url");
}

export function buildWelcomeMessage(input: { householdName: string; name: string; email?: string | null; username: string; password: string }) {
  const origin = process.env.BETTER_AUTH_URL || "http://localhost:3000";
  const emailLine = input.email ? `\nEmail: ${input.email}` : "";
  return `Hi ${input.name},\n\nYou now have access to Gatey for ${input.householdName}.\n\nSign in: ${origin}/sign-in\nUsername: ${input.username}${emailLine}\nTemporary password: ${input.password}\n\nYou can create, view, and cancel your household's guest gate codes. If you need help or a password reset, reply to this email.`;
}
