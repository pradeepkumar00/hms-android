/** "Female / 25 Years" — matches OPD header formatting. */
export function formatGenderAge(
  source?: { gender?: string | null; age?: number | string | null } | null,
): string {
  const parts = [
    source?.gender?.trim(),
    source?.age != null && String(source.age).trim() !== ''
      ? `${String(source.age).trim()} Years`
      : null,
  ].filter(Boolean) as string[];
  return parts.length ? parts.join(' / ') : '—';
}

export function formatAddress(
  source?: { address?: string | null } | null,
): string {
  const addr = String(source?.address || '').trim();
  return addr || '—';
}
