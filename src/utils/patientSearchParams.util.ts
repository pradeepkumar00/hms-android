/**
 * Build query params for GET /patient — mirrors web patient-list behaviour.
 * Always use `search` for digit queries so partial mobile (1–10 digits) stays consistent.
 * Cleans spaces and removes '+91' or leading '91' country codes for mobile number searches.
 */
export function buildPatientSearchFetchParams(query: string): {
  search?: string;
  name?: string;
  mobileNo?: string;
} {
  let q = query.trim();
  if (!q) return {};

  // Strip all spaces
  q = q.replace(/\s+/g, '');

  // Remove +91 or leading 91 if it's a 12-digit number starting with 91
  if (q.startsWith('+91')) {
    q = q.slice(3);
  } else if (q.startsWith('91') && q.length === 12) {
    q = q.slice(2);
  }

  if (/^\d+$/.test(q)) {
    return { search: q };
  }
  return { name: query.trim(), search: q };
}
