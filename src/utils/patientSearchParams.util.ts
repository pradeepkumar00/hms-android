/**
 * Build query params for GET /patient — mirrors web patient-list behaviour.
 * Always use `search` for digit queries so partial mobile (1–10 digits) stays consistent.
 */
export function buildPatientSearchFetchParams(query: string): {
  search?: string;
  name?: string;
  mobileNo?: string;
} {
  const q = query.trim();
  if (!q) return {};

  if (/^\d+$/.test(q)) {
    return { search: q };
  }
  return { name: q, search: q };
}
