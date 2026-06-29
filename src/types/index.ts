// Authentication Types
export interface User {
  id: string;
  _id?: string; // API uses _id
  name: string;
  email: string;
  mobileNumber?: string;
  mobileNo?: string; // API uses mobileNo
  department: 'HR' | 'Admin' | 'Supervisor'; // Internal department mapping
  role?: string; // Editor, Viewer, etc. - from API (optional)
  createdAt: string;
  tenantId: string; // Required for topic subscriptions
  status?: string;
  type: string;
  departmentId?: string; // Department ID from API
  doctorCode?: string | null; // Doctor code from API (can be null)
  isTokenAssignable?: boolean; // Token assignability flag
  subCategory?: string; // User subcategory
  currentToken?: string; // Current token value
  child?: {
    totalChild: number;
  };
  route?: string[]; // User routes/permissions
  consultFees?: number; // Consultation fees
  bookingMode?: string;
  updatedAt?: string; // Last update timestamp
  __v?: number; // Version key
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
  // Comments
  comment?: TaskComment[]; // Array of comments on the task
}

// Task History Entry Type (Phase 10 - History Tab)
export interface TaskHistoryEntry {
  status?: string; // Status value ('new', 'assigned', 'progress', 'completed')
  changedBy: string; // User ID who made the change
  changedByName: string; // Name of user who made the change
  changedAt: string; // ISO timestamp of when change occurred
  _id: string; // Unique identifier for history entry
}

// Comment Type (for task comments)
export interface TaskComment {
  _id: string; // Unique identifier for the comment
  comment: string; // The comment text
  commentedBy: string; // User ID who made the comment
  commentedByName: string; // Name of user who made the comment
  commentedAt: string; // ISO timestamp of when comment was created
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

// Patient Types
export interface Patient {
  _id: string;
  id?: string;
  name: string;
  mobileNo?: string;
  uhid?: string | null;
  gender?: string;
  age?: number;
  address?: string;
  type?: string;
  admitType?: string | null;
}

export interface PatientListResult {
  patients: Patient[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  hasMore: boolean;
}

export interface RegisFieldOption {
  label: string;
  value: string;
}

export interface RegisField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'email' | 'select' | 'date' | 'textarea' | 'doctor';
  required: boolean;
  placeholder?: string;
  options?: RegisFieldOption[];
  defaultValue?: string;
  visible?: boolean;
}

// Appointment Types (Calendar)
export interface Appointment {
  _id: string;
  patientId?: string | null;
  patientName: string;
  mobileNo?: string;
  gender?: string | null;
  age?: number | string | null;
  address?: string | null;
  doctorId?: string;
  doctorName?: string;
  doctorCode?: string;
  doctorColor?: string | null;
  date: string; // YYYY-MM-DD
  time?: string | null; // e.g. "4:00 PM"
  duration?: number | null;
  appointmentType?: string; // SLOT | TOKEN
  visitType?: string; // NORMAL, etc.
  tokenCount?: number;
  status?: string; // waiting, etc.
  editStatus?: string;
  source?: string | null;
  confirmationStatus?: string; // pending | confirmed
  isArrived?: boolean;
  tenantId?: string;
  expenseAmount?: number;
  paidAmount?: number;
  pendingAmount?: number;
  discount?: number;
  doctorFee?: number;
  refId?: string | null;
  uhid?: string | null;
  isPaymentDone?: boolean;
  remark?: string;
  reason?: string;
  details?: Array<{
    treatmentDesc?: string;
    treatmentName?: string;
    name?: string;
    title?: string;
    reason?: string;
    date?: string;
    manageServiceId?: string;
    expenseAmount?: number;
  }>;
  treatments?: Array<{
    treatmentDesc?: string;
    treatmentName?: string;
    name?: string;
    reason?: string;
    date?: string;
  }>;
}

// Notification Types
export interface Notification {
  id: string;
  userId: string;
  taskId: string;
  message: string;
  readStatus: boolean;
  createdAt: string;
  updatedAt?: string;
  // Enhanced fields for better notification display
  taskTitle?: string;
  assignedTo?: string;
  assignedToName?: string;
  createdBy?: string;
  createdByName?: string;
  department?: string;
  // Additional fields from API response
  type?: string; // 'updated', 'created', etc.
  status?: string; // 'progress', 'completed', 'assigned', etc.
  user?: Array<{ id: string; name: string }>; // Array of assigned users
}

// Navigation Types
export type RootStackParamList = {
  Login: undefined;
  Home: undefined; // Landing screen with menu tiles
  AllTasks: undefined;
  TaskDetails: { taskId: string; readonly?: boolean };
  Inbox: undefined;
  AssignedTasks: undefined; // Tasks created BY current user
  History: undefined; // Tasks assigned to others BY current user
  CreateTask: { parentTaskId?: string }; // Optional parentTaskId for creating child tasks (Phase 10)
  NotificationSettings: undefined;
  Calendar: { selectedAppointment?: Appointment } | undefined; // Calendar view of tasks by due date
  TaskList: {
    status?: 'today' | 'new' | 'assigned' | 'progress' | 'completed' | 'withdraw';
    type?: 'created' | 'assigned';
    title: string;
  }; // Generic task list screen with filters
  OPD: {
    appointment?: Appointment;
    patient?: any;
    openFollowup?: boolean;
    openUpload?: 'prescription' | 'procedure' | 'lab';
    openTreatmentPlan?: boolean;
    followupLinkedTreatments?: Array<{ treatmentDesc: string; date?: string }>;
  };
  PatientList: undefined;
  AddPatient: {
    patientData?: Record<string, unknown>;
    bookingMode?: 'appointment';
    presetDoctorId?: string;
    presetDate?: string;
  } | undefined;
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

export interface AppDataState {
  config: Record<string, unknown> | null;
  manageServices: Array<Record<string, unknown>>;
  isLoading: boolean;
  isLoaded: boolean;
  error: string | null;
  loadedAt: string | null;
}

// Root State
export interface RootState {
  auth: AuthState;
  tasks: TaskState;
  ui: UIState;
  settings: SettingsState;
  appData: AppDataState;
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
