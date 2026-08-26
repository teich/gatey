export type CredentialState = "active" | "upcoming" | "expired" | "revoked";

export type Credential = {
  id: string;
  label: string;
  pin: string;
  startsAt: string;
  endsAt: string;
  state: CredentialState;
  revokedAt?: string;
};
