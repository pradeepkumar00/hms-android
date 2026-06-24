import { User } from '../types';

export type AppUser = Pick<User, 'type' | 'route'> | null | undefined;

/** Add Patient is available to every role (no counter-desk restriction in the APK). */
export const canAddPatient = (_user?: AppUser): boolean => true;

/** Only doctor and admin may create or edit treatment plans. */
export const canManageTreatmentPlan = (user: AppUser): boolean => {
  const role = String(user?.type || '').toLowerCase();
  return role === 'admin' || role === 'doctor';
};

/** Only admin may delete uploaded patient files. */
export const canDeleteUpload = (user: AppUser): boolean => {
  return String(user?.type || '').toLowerCase() === 'admin';
};

/**
 * Web queue desk hides add-patient for prescription-only users.
 * The APK has no counter desk; this helper exists for parity if needed later.
 */
export const hasPrescriptionOnlyAccess = (user: AppUser): boolean => {
  return Boolean(user?.route?.includes('prescription'));
};
