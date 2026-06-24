export interface SlotUser {
  editStatus?: string;
  status?: string;
  patientName?: string;
  name?: string;
  mobileNo?: string;
}

export interface BookableSlot {
  _id: string;
  startTime: string;
  endTime?: string;
  duration?: number;
  isDisable?: boolean;
  tokenCount?: number;
  user?: SlotUser;
}

/** Admin/counter: open slot if not disabled and not actively booked. */
export function isSlotSelectable(
  slot: BookableSlot | null | undefined,
): boolean {
  if (!slot || slot.isDisable) return false;
  if (!slot.user) return true;
  const u = slot.user;
  if (u.editStatus === 'cancelled' || u.status === 'absent') return true;
  return false;
}

/** Merge queue entries into slots by tokenCount (same as web book-appointment). */
export function mergeQueueIntoSlots(
  slots: BookableSlot[],
  queue: unknown[],
): BookableSlot[] {
  const queueList = Array.isArray(queue) ? queue : [];
  return slots.map(slot => {
    const queueSlot = queueList.find(
      (q: any) => Number(q?.tokenCount) === Number(slot.tokenCount),
    );
    if (queueSlot) {
      return { ...slot, user: queueSlot as SlotUser };
    }
    return slot;
  });
}

export const SLOT_AVAILABLE_COLOR = '#90EE90';
export const SLOT_BOOKED_COLOR = '#EE9092';
export const SLOT_BORDER_COLOR = '#374151';
