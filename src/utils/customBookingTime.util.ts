import { parseAppointmentTime } from './appointmentDisplay.util';

/** Format time for API / display (e.g. "5:09 PM"). */
export function formatTimeForApi(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;
  return `${hours}:${String(minutes).padStart(2, '0')} ${period}`;
}

export function formatTimeForDisplay(timeStr: string): string {
  const trimmed = timeStr.trim();
  if (!trimmed) return 'Select time';
  const mins = parseAppointmentTime(trimmed);
  if (mins == null) return trimmed;
  const d = new Date();
  d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
  return formatTimeForApi(d);
}

export function parseTimeStringToDate(timeStr: string, fallbackHour = 9): Date {
  const mins = parseAppointmentTime(timeStr);
  const d = new Date();
  if (mins != null) {
    d.setHours(Math.floor(mins / 60), mins % 60, 0, 0);
    return d;
  }
  d.setHours(fallbackHour, 0, 0, 0);
  return d;
}

export function defaultCustomStartTime(): string {
  const d = new Date();
  d.setHours(9, 0, 0, 0);
  return formatTimeForApi(d);
}
