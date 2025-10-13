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
  _id?: string; // API uses _id
  tenantId: string;
  title: string;
  description: string;
  fileUrl?: string;
  createdBy: string;
  createdByName?: string; // Name of task creator
  assignedTo?: string | null; // First user ID (backward compatibility)
  assignedToName?: string; // Name of first assigned user
  assignedBy?: string; // User ID who assigned the task
  assignedByName?: string; // Name of user who assigned the task
  user?: Array<{ id?: string; name?: string; _id?: string }>; // Multiple assigned users from API
  assignedUsers?: Array<{ id: string; name: string }>; // NEW: Multiple assignees
  status: 'new' | 'assigned' | 'progress' | 'completed';
  createdAt: string;
  updatedAt: string;
  dueDate?: string;
  assignmentHistory?: AssignmentHistory[];
  // Parent-Child Task Hierarchy (Phase 10)
  parentTaskId?: string; // ID of parent task if this is a child task
  childTasks?: Task[]; // Array of immediate child tasks
  hasChildren?: boolean; // Flag indicating if task has children
  // Task History (Phase 10 - History Tab)
  taskHistory?: TaskHistoryEntry[]; // Array of status change history entries
  priority?: string;
  parentTask?: Task | null;
}

// Task History Entry Type (Phase 10 - History Tab)
export interface TaskHistoryEntry {
  status?: string; // Status value ('new', 'assigned', 'progress', 'completed')
  changedBy: string; // User ID who made the change
  changedByName: string; // Name of user who made the change
  changedAt: string; // ISO timestamp of when change occurred
  _id: string; // Unique identifier for history entry
}

// Task Creation API Request
export interface TaskCreateRequest {
  title: string;
  description: string;
  status: 'new' | 'assigned';
  assignedTo?: string; // First user ObjectId
  assignedToName?: string; // Name of assigned user
  users?: Array<{ id: string; name: string }>; // NEW: Multiple assignees
  dueDate: string; // ISO date string (YYYY-MM-DD format)
  tenantId?: string;
  createdBy?: string;
  createdByName?: string;
  parentTaskId?: string; // Parent task ID for child tasks (Phase 10)
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
  CreateTask: { parentTaskId?: string }; // Optional parentTaskId for creating child tasks (Phase 10)
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

// Task Hierarchy API Response (Phase 10)
export interface TaskHierarchyResponse {
  task: Task;
  childTask: Task[]; // Array of immediate child tasks
  parentTask: Task | null; // Parent task or null
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
