// Boolean settings accept the same spellings everywhere so a flag never means
// "on" for one feature and "off" for another.
export function envFlag(name: string): boolean {
  return ["1", "true", "yes"].includes((process.env[name] || "").trim().toLowerCase());
}
