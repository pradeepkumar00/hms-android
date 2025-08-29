// Authentication Types
export interface User {
  id: string;
  _id?: string; // API uses _id
  name: string;
  email: string;
  mobileNumber?: string;
  mobileNo?: string; // API uses mobileNo
  department: 'HR' | 'Admin' | 'Supervisor'; // Internal department mapping
  role: string; // Editor, Viewer, etc. - from API
  createdAt: string;
  tenantId: string; // Required for topic subscriptions
  status?: string;
  type: string;
}

export interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  tokenValidated: boolean;
  isLoading: boolean;
  error: string | null;
}

export interface LoginCredentials {
  email: string;
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
  createdByName?: string; // Name of task creator
  assignedTo?: string | null; // Nullable for new tasks
  assignedToName?: string; // Name of assigned user
  status: 'new' | 'assigned' | 'progress' | 'completed';
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  assignmentHistory?: AssignmentHistory[];
}

// Task Creation API Request
export interface TaskCreateRequest {
  title: string;
  description: string;
  status: 'new' | 'assigned' | 'progress' | 'completed';
  assignedTo?: string; // ObjectId
  asssinedToName?: string; // Note: typo in API field name
  assignedBy: string; // ObjectId
  assignedByName: string;
  dueDate: string; // ISO date string
}

export interface AssignmentHistory {
  assignedFrom?: string;
  assignedTo: string;
  assignedBy: string;
  assignmentDate: string;
  statusChange: string;
}

export interface TaskState {
  assignedToMe: Task[]; // Tasks assigned TO current user
  assignedByMe: Task[]; // Tasks assigned BY current user (History)
  createdTasks: Task[]; // Tasks created BY current user (new requirements)
  inbox: Notification[];
  isLoading: boolean;
  error: string | null;
  currentTask: Task | null; // Single task for details view
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  taskId: string;
  message: string;
  readStatus: boolean;
  createdAt: string;
  // Enhanced fields for better notification display
  taskTitle?: string;
  assignedTo?: string;
  assignedToName?: string;
  createdBy?: string;
  createdByName?: string;
  department?: string;
}

// Navigation Types
export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  TaskDetails: { taskId: string; readonly?: boolean };
  Inbox: undefined;
  AssignedTasks: undefined; // Tasks created BY current user
  History: undefined; // Tasks assigned to others BY current user
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
