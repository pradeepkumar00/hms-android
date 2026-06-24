/** Match web `detailLabel` — queue `details` rows use mixed field names. */
export function detailLabel(item: Record<string, unknown> | null | undefined): string {
  if (!item) return 'Treatment';
  const label = String(
    item.treatmentDesc ??
      item.serviceName ??
      item.desc ??
      item.name ??
      item.title ??
      'Treatment',
  ).trim();
  return label || 'Treatment';
}

export interface AppointmentTreatmentItem {
  treatmentDesc: string;
  date?: string;
}

/** Linked treatments from queue.details (and legacy aliases). */
export function extractAppointmentTreatments(
  appt: Record<string, unknown> | null | undefined,
): AppointmentTreatmentItem[] {
  if (!appt) return [];

  const rawLists = [
    appt.details,
    appt.treatments,
    appt.treatmentDetails,
    appt.followupDetails,
    appt.linkedTreatments,
  ].filter((list): list is unknown[] => Array.isArray(list) && list.length > 0);

  const raw = rawLists[0] ?? [];
  return raw
    .map((item: any) => ({
      treatmentDesc: detailLabel(item),
      date: item?.date ? String(item.date) : appt.date ? String(appt.date) : undefined,
    }))
    .filter(item => item.treatmentDesc.length > 0);
}
