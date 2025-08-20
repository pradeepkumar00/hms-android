// Authentication Types
export interface User {
  id: string;
  name: string;
  email: string;
  mobileNumber: string;
  department: 'HR' | 'Admin' | 'Supervisor';
  role: string;
  createdAt: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  mobileNumber: string;
  password: string;
}

export interface LoginResponse {
  user: User;
  token: string;
}

// Task Types
export interface Task {
  id: string;
  title: string;
  description: string;
  fileUrl?: string;
  createdBy: string;
  assignedTo: string;
  department: 'HR' | 'Admin' | 'Supervisor';
  status: 'Assigned' | 'In Progress' | 'Completed';
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
}

export interface TaskState {
  assignedTasks: Task[];
  createdTasks: Task[];
  inbox: Notification[];
  isLoading: boolean;
  error: string | null;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  taskId: string;
  message: string;
  readStatus: boolean;
  createdAt: string;
}

// Navigation Types
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  TaskDetails: { taskId: string; readonly?: boolean };
  Inbox: undefined;
  AssignedTasks: undefined;
  CreateTask: undefined;
  NotificationSettings: undefined;
};

// UI Types
export interface UIState {
  loading: boolean;
  error: string | null;
  theme: 'light' | 'dark';
}

// Settings Types
export type NotificationSoundOption = {
  id: string; // unique identifier used for channel/sound reference
  title: string; // user-facing label
  platformFileName?: string; // iOS file name with extension, Android raw name without extension
};

export interface SettingsState {
  notificationSoundId: string | null; // selected sound id
  vibrationEnabled: boolean; // whether vibration is enabled for notifications
}

// Root State
export interface RootState {
  auth: AuthState;
  tasks: TaskState;
  ui: UIState;
  settings: SettingsState;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Form Validation Types
export interface ValidationError {
  field: string;
  message: string;
}

export interface FormState {
  isValid: boolean;
  errors: ValidationError[];
  isDirty: boolean;
}
