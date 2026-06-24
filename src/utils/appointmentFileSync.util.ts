/** Match patient uploads to a specific appointment by date + time (or sessionId). */

import { Appointment } from '../types';

export interface PatientFileTimeLike {
  id: string;
  dateKey: string;
  sortAt: number;
  sessionId?: string | null;
  queueId?: string | null;
}

export const normalizeEntityId = (id: unknown): string => {
  if (id == null) return '';
  if (typeof id === 'object' && id !== null && '$oid' in (id as object)) {
    return String((id as { $oid: string }).$oid).trim();
  }
  return String(id).trim();
};

export const historyDateKey = (value?: string | null): string => {
  if (!value) return '';
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '';
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const appointmentDateKey = (date?: string | null): string =>
  historyDateKey(date);

const parseAppointmentTimeMinutes = (time?: string | null): number | null => {
  if (!time) return null;
  const m = String(time).trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const fileMinutesOnDay = (sortAt: number): number => {
  if (!sortAt) return 0;
  const d = new Date(sortAt);
  return d.getHours() * 60 + d.getMinutes();
};

const appointmentSortMinutes = (appt: Appointment): number =>
  parseAppointmentTimeMinutes(appt.time) ?? 0;

const resolveFileAppointment = (
  file: PatientFileTimeLike,
  dayAppts: Appointment[],
): Appointment | null => {
  const linkId = normalizeEntityId(file.sessionId || file.queueId);
  if (linkId) {
    const linked = dayAppts.find(a => normalizeEntityId(a._id) === linkId);
    if (linked) return linked;
  }

  const sorted = [...dayAppts].sort(
    (a, b) => appointmentSortMinutes(a) - appointmentSortMinutes(b),
  );
  if (!sorted.length) return null;
  if (sorted.length === 1) return sorted[0];

  const fileMinutes = fileMinutesOnDay(file.sortAt);
  let assigned = sorted[0];
  for (const candidate of sorted) {
    if (appointmentSortMinutes(candidate) <= fileMinutes) {
      assigned = candidate;
    } else {
      break;
    }
  }
  return assigned;
};

export const filesForAppointment = <T extends PatientFileTimeLike>(
  appt: Appointment,
  files: T[],
  allAppointments: Appointment[],
): T[] => {
  const apptId = normalizeEntityId(appt._id);
  const apptKey = appointmentDateKey(appt.date);
  if (!apptId) return [];

  const linked = files.filter(file => {
    const linkId = normalizeEntityId(file.sessionId || file.queueId);
    return linkId && linkId === apptId;
  });
  if (linked.length) {
    return linked.sort((a, b) => a.sortAt - b.sortAt);
  }

  if (!apptKey) return [];

  const dayFiles = files.filter(file => file.dateKey === apptKey);
  if (!dayFiles.length) return [];

  const dayAppts = allAppointments.filter(
    a => appointmentDateKey(a.date) === apptKey,
  );
  if (!dayAppts.length) return [];

  const matched = dayFiles.filter(file => {
    const assigned = resolveFileAppointment(file, dayAppts);
    return assigned != null && normalizeEntityId(assigned._id) === apptId;
  });

  return matched.sort((a, b) => a.sortAt - b.sortAt);
};
