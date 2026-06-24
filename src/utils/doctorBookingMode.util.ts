export type DoctorBookingMode = 'SLOT' | 'QUEUE' | 'CUSTOM';

/** Default visit length (minutes) for custom booking when staff does not change it. */
export const DEFAULT_CUSTOM_BOOKING_DURATION_MINUTES = 15;

export function getDoctorBookingMode(doctor: any): DoctorBookingMode {
  if (!doctor) return 'QUEUE';
  const raw = String(doctor.bookingMode || '').toUpperCase();
  if (raw === 'SLOT' || raw === 'QUEUE' || raw === 'CUSTOM') {
    return raw as DoctorBookingMode;
  }
  return 'QUEUE';
}

export function isSlotBookingMode(doctor: any): boolean {
  return getDoctorBookingMode(doctor) === 'SLOT';
}

export function isCustomBookingMode(doctor: any): boolean {
  return getDoctorBookingMode(doctor) === 'CUSTOM';
}

export function isQueueBookingMode(doctor: any): boolean {
  return getDoctorBookingMode(doctor) === 'QUEUE';
}

export function resolveCustomBookingDuration(profile: any): number {
  const n = Number(profile?.customBookingDuration);
  if (Number.isFinite(n) && n > 0) return Math.round(n);
  return DEFAULT_CUSTOM_BOOKING_DURATION_MINUTES;
}
