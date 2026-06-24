import type { Appointment } from '../types';

/** Default visit length (minutes) when booking in custom mode. */
export const DEFAULT_CUSTOM_BOOKING_DURATION_MINUTES = 15;

/** Parse "4:00 PM" / "16:00" into minutes from midnight. */
export function parseAppointmentTime(time?: string | null): number | null {
  if (!time) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

export function formatAppointmentListTime(time?: string | null): string {
  const mins = parseAppointmentTime(time);
  if (mins == null) return time?.trim() || '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h < 12 ? 'am' : 'pm';
  let displayH = h % 12;
  if (displayH === 0) displayH = 12;
  return `${displayH}:${String(m).padStart(2, '0')} ${period}`;
}

export function hasAppointmentStartTime(appt: Appointment | null | undefined): boolean {
  return parseAppointmentTime(appt?.time) != null;
}

/** Calendar list: start time (+ duration) for custom/slot; token for queue-only. */
export function getAppointmentVisitDisplay(appt: Appointment): string {
  if (hasAppointmentStartTime(appt)) {
    const timeLabel = formatAppointmentListTime(appt.time);
    const dur = Number(appt.duration);
    if (Number.isFinite(dur) && dur > 0) {
      return `${timeLabel} · ${dur}m`;
    }
    return timeLabel;
  }
  if (appt.tokenCount != null && Number(appt.tokenCount) > 0) {
    return `T${appt.tokenCount}`;
  }
  return '—';
}

export function shouldShowAppointmentToken(appt: Appointment): boolean {
  return (
    !hasAppointmentStartTime(appt) &&
    appt.tokenCount != null &&
    Number(appt.tokenCount) > 0 &&
    (appt.appointmentType === 'TOKEN' || appt.appointmentType !== 'SLOT')
  );
}
