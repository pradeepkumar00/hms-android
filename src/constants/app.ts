export const APP_CONFIG = {
  name: 'Hospital Management',
  version: '1.0.0',
  apiTimeout: 30000, // 30 seconds
  tokenRefreshThreshold: 5 * 60 * 1000, // 5 minutes before expiry
} as const;

export const API_ENDPOINTS = {
  // Authentication
  LOGIN: '/auth/login',
  LOGOUT: '/auth/logout',
  USER: '/auth/user',

  // Tasks
  TASKS_ASSIGNED: '/tasks/assigned',
  TASKS_CREATED: '/tasks/created',
  TASKS_CREATE: '/tasks/create',
  TASKS_UPDATE_STATUS: '/tasks/{id}/status',
  TASKS_DETAILS: '/tasks/{id}',

  // Notifications
  NOTIFICATIONS_INBOX: '/notifications/inbox',
  NOTIFICATIONS_SEND: '/notifications/send',

  // Users
  USERS_BY_DEPARTMENT: '/users/department/{dept}',
} as const;

export const DEPARTMENTS = [
  { label: 'HR', value: 'HR' },
  { label: 'Admin', value: 'Admin' },
  { label: 'Supervisor', value: 'Supervisor' },
] as const;

export const TASK_STATUSES = [
  { label: 'New', value: 'new' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'In Progress', value: 'in_progress' },
  { label: 'Completed', value: 'completed' },
] as const;

export const VALIDATION_RULES = {
  mobileNumber: {
    required: 'Mobile number is required',
    pattern: /^(\+91)?[6-9]\d{9}$/,
    patternMessage: 'Please enter a valid Indian mobile number',
    minLength: 10,
    maxLength: 13,
  },
  password: {
    required: 'Password is required',
    minLength: 6,
    minLengthMessage: 'Password must be at least 6 characters',
  },
  title: {
    required: 'Title is required',
    minLength: 3,
    maxLength: 100,
    minLengthMessage: 'Title must be at least 3 characters',
    maxLengthMessage: 'Title must not exceed 100 characters',
  },
  description: {
    required: 'Description is required',
    minLength: 10,
    maxLength: 500,
    minLengthMessage: 'Description must be at least 10 characters',
    maxLengthMessage: 'Description must not exceed 500 characters',
  },
} as const;

export const STORAGE_KEYS = {
  AUTH_TOKEN: '@auth_token',
  USER_DATA: '@user_data',
  ONBOARDING_COMPLETED: '@onboarding_completed',
  NOTIFICATION_SOUND: '@notification_sound',
  CUSTOM_RINGTONE_URI: '@custom_ringtone_uri',
  CUSTOM_RINGTONES: '@custom_ringtones',
  FCM_TOKEN: '@fcm_token', // Legacy - kept for cleanup purposes
  CURRENT_TENANT_ID: '@current_tenant_id', // For topic subscription
  LOCAL_NOTIFICATIONS: '@local_notifications',
  VIBRATION_ENABLED: '@vibration_enabled',
} as const;

// Navigation screens configuration
export const SCREENS = {
  INBOX: 'Inbox',
  ASSIGNED_TASKS: 'AssignedTasks',
  CREATE_TASK: 'CreateTask',
  LOGIN: 'Login',
  MAIN: 'Main',
  NOTIFICATION_SETTINGS: 'NotificationSettings',
} as const;

export const FILE_UPLOAD = {
  maxSizeInMB: 10,
  maxSizeInBytes: 10 * 1024 * 1024,
  allowedTypes: [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain',
  ],
  allowedExtensions: [
    '.jpg',
    '.jpeg',
    '.png',
    '.gif',
    '.pdf',
    '.doc',
    '.docx',
    '.xls',
    '.xlsx',
    '.txt',
  ],
} as const;
