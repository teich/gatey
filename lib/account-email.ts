export const MANAGED_ACCOUNT_EMAIL_DOMAIN = "users.gatey.invalid";

export function managedAccountEmail(identifier: string) {
  const localPart = identifier.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "-") || "resident";
  return `${localPart}@${MANAGED_ACCOUNT_EMAIL_DOMAIN}`;
}

export function isManagedAccountEmail(email: string) {
  return email.toLowerCase().endsWith(`@${MANAGED_ACCOUNT_EMAIL_DOMAIN}`);
}

export function visibleAccountEmail(email: string): string | null {
  return isManagedAccountEmail(email) ? null : email;
}

export function optionalAccountEmail(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") throw new Error("Email must be text.");
  const email = value.trim().toLowerCase();
  if (!email) return null;
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("Enter a valid email address or leave it blank.");
  }
  return email;
}
