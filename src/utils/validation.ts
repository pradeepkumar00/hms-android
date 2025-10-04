import { VALIDATION_RULES } from '../constants/app';
import { ValidationError } from '../types';

export const validateEmail = (email: string): ValidationError | null => {
  if (!email || email.trim() === '') {
    return {
      field: 'email',
      message: 'Email is required',
    };
  }

  const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailPattern.test(email.trim())) {
    return {
      field: 'email',
      message: 'Please enter a valid email address',
    };
  }

  return null;
};

export const validateMobileNumber = (
  mobileNumber: string,
): ValidationError | null => {
  if (!mobileNumber || mobileNumber.trim() === '') {
    return {
      field: 'mobileNumber',
      message: VALIDATION_RULES.mobileNumber.required,
    };
  }

  // Remove spaces and special characters except +
  const cleanNumber = mobileNumber.replace(/[\s-()]/g, '');

  // Check pattern
  if (!VALIDATION_RULES.mobileNumber.pattern.test(cleanNumber)) {
    return {
      field: 'mobileNumber',
      message: VALIDATION_RULES.mobileNumber.patternMessage,
    };
  }

  return null;
};

export const validatePassword = (password: string): ValidationError | null => {
  if (!password || password.trim() === '') {
    return {
      field: 'password',
      message: VALIDATION_RULES.password.required,
    };
  }

  if (password.length < VALIDATION_RULES.password.minLength) {
    return {
      field: 'password',
      message: VALIDATION_RULES.password.minLengthMessage,
    };
  }

  return null;
};

export const validateTitle = (title: string): ValidationError | null => {
  if (!title || title.trim() === '') {
    return {
      field: 'title',
      message: VALIDATION_RULES.title.required,
    };
  }

  if (title.length < VALIDATION_RULES.title.minLength) {
    return {
      field: 'title',
      message: VALIDATION_RULES.title.minLengthMessage,
    };
  }

  if (title.length > VALIDATION_RULES.title.maxLength) {
    return {
      field: 'title',
      message: VALIDATION_RULES.title.maxLengthMessage,
    };
  }

  return null;
};

export const validateDescription = (
  description: string,
): ValidationError | null => {
  if (!description || description.trim() === '') {
    return {
      field: 'description',
      message: VALIDATION_RULES.description.required,
    };
  }

  if (description.length < VALIDATION_RULES.description.minLength) {
    return {
      field: 'description',
      message: VALIDATION_RULES.description.minLengthMessage,
    };
  }

  if (description.length > VALIDATION_RULES.description.maxLength) {
    return {
      field: 'description',
      message: VALIDATION_RULES.description.maxLengthMessage,
    };
  }

  return null;
};

export const validateLoginForm = (
  email: string,
  password: string,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  const emailError = validateEmail(email);
  if (emailError) errors.push(emailError);

  const passwordError = validatePassword(password);
  if (passwordError) errors.push(passwordError);

  return errors;
};

export const formatMobileNumber = (mobileNumber: string): string => {
  // Remove all non-digit characters
  const digits = mobileNumber.replace(/\D/g, '');

  // If starts with 91 and has 12 digits total, add +
  if (digits.length === 12 && digits.startsWith('91')) {
    return `+${digits}`;
  }

  // If has 10 digits, add +91
  if (digits.length === 10) {
    return `+91${digits}`;
  }

  return mobileNumber;
};

export const getFormattedMobileDisplay = (mobileNumber: string): string => {
  const formatted = formatMobileNumber(mobileNumber);
  // Format as +91 XXXXX XXXXX
  if (formatted.startsWith('+91')) {
    const number = formatted.substring(3);
    return `+91 ${number.substring(0, 5)} ${number.substring(5)}`;
  }
  return formatted;
};

export const validateTimeline = (timeline: Date): ValidationError | null => {
  const now = new Date();

  if (timeline <= now) {
    return {
      field: 'timeline',
      message: 'Timeline must be in the future',
    };
  }

  return null;
};

export const validateTaskForm = (
  title: string,
  description: string,
  selectedUsers: Array<{ id: string; name: string }>,
  timeline: Date,
): ValidationError[] => {
  const errors: ValidationError[] = [];

  const titleError = validateTitle(title);
  if (titleError) errors.push(titleError);

  const descriptionError = validateDescription(description);
  if (descriptionError) errors.push(descriptionError);

  // Validate at least one user is selected for multi-user assignment
  if (!selectedUsers || selectedUsers.length === 0) {
    errors.push({
      field: 'users',
      message: 'At least one user must be selected',
    });
  }

  const timelineError = validateTimeline(timeline);
  if (timelineError) errors.push(timelineError);

  return errors;
};
