export interface CustomBookingDurationOption {
  value: number;
  label: string;
}

/** Allowed visit durations for custom booking (APK). */
export const CUSTOM_BOOKING_DURATION_OPTIONS: CustomBookingDurationOption[] = [
  { value: 5, label: '5 minutes' },
  { value: 10, label: '10 minutes' },
  { value: 15, label: '15 minutes' },
  { value: 20, label: '20 minutes' },
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 60, label: '1 hour' },
  { value: 90, label: '1 hour 30 minutes' },
  { value: 120, label: '2 hours' },
  { value: 150, label: '2 hours 30 minutes' },
  { value: 180, label: '3 hours' },
  { value: 210, label: '3 hours 30 minutes' },
  { value: 240, label: '4 hours' },
  { value: 270, label: '4 hours 30 minutes' },
  { value: 300, label: '5 hours' },
];

export function getCustomBookingDurationLabel(minutes: number | string): string {
  const n = Number(minutes);
  const match = CUSTOM_BOOKING_DURATION_OPTIONS.find(o => o.value === n);
  return match?.label ?? `${n} minutes`;
}

/** Snap doctor default (or free-form) minutes to the nearest allowed option. */
export function snapCustomBookingDuration(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) {
    return CUSTOM_BOOKING_DURATION_OPTIONS[2]?.value ?? 15;
  }
  const exact = CUSTOM_BOOKING_DURATION_OPTIONS.find(o => o.value === minutes);
  if (exact) return exact.value;
  return CUSTOM_BOOKING_DURATION_OPTIONS.reduce((best, opt) =>
    Math.abs(opt.value - minutes) < Math.abs(best.value - minutes) ? opt : best,
  ).value;
}
