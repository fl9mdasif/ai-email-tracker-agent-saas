/** Pure check: is this email on the comma-separated list? Case-insensitive; an empty list matches nobody. */
export function isSuperAdminEmail(email: string | null | undefined, list: string | undefined): boolean {
  if (!email || !list) return false;
  const wanted = email.trim().toLowerCase();
  return list
    .split(",")
    .map((entry) => entry.trim().toLowerCase())
    .filter(Boolean)
    .includes(wanted);
}
