import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { TaskState, Task, Notification, TaskCreateRequest } from '../types';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { STORAGE_KEYS } from '../constants/app';
import authService from '../services/authService';

// Mock data for development (will be replaced with real API calls)
const MOCK_NOTIFICATIONS: Notification[] = [
  // HR User notifications (User ID: 1)
  {
    id: '1',
    userId: '1',
    taskId: 'task_1',
    message: 'New task assigned: Review employee performance documents',
    readStatus: false,
    createdAt: '2024-12-19T10:30:00Z',
  },
  {
    id: '2',
    userId: '1',
    taskId: 'task_2',
    message: 'Task status updated: Complete monthly report',
    readStatus: false,
    createdAt: '2024-12-19T09:15:00Z',
  },
  {
    id: '3',
    userId: '1',
    taskId: 'task_3',
    message: 'New urgent task: Prepare meeting materials',
    readStatus: true,
    createdAt: '2024-12-18T16:45:00Z',
  },
  {
    id: '4',
    userId: '1',
    taskId: 'task_4',
    message: 'Task assigned: Update employee handbook policies',
    readStatus: false,
    createdAt: '2024-12-19T08:00:00Z',
  },
  {
    id: '5',
    userId: '1',
    taskId: 'task_5',
    message: 'Reminder: Submit quarterly budget analysis',
    readStatus: true,
    createdAt: '2024-12-17T14:20:00Z',
  },

  // Admin User notifications (User ID: 2)
  {
    id: '6',
    userId: '2',
    taskId: 'task_6',
    message: 'New task assigned: Server maintenance scheduled',
    readStatus: false,
    createdAt: '2024-12-19T11:45:00Z',
  },
  {
    id: '7',
    userId: '2',
    taskId: 'task_7',
    message: 'Task assigned: Update security protocols',
    readStatus: false,
    createdAt: '2024-12-19T09:30:00Z',
  },
  {
    id: '8',
    userId: '2',
    taskId: 'task_8',
    message: 'Urgent: Fix database backup issues',
    readStatus: true,
    createdAt: '2024-12-18T15:20:00Z',
  },
  {
    id: '9',
    userId: '2',
    taskId: 'task_9',
    message: 'Task assigned: Install new software licenses',
    readStatus: false,
    createdAt: '2024-12-18T13:10:00Z',
  },
  {
    id: '10',
    userId: '2',
    taskId: 'task_10',
    message: 'Task completed: Network infrastructure audit',
    readStatus: true,
    createdAt: '2024-12-17T10:30:00Z',
  },

  // Supervisor User notifications (User ID: 3)
  {
    id: '11',
    userId: '3',
    taskId: 'task_11',
    message: 'New task assigned: Team performance review meeting',
    readStatus: false,
    createdAt: '2024-12-19T12:15:00Z',
  },
  {
    id: '12',
    userId: '3',
    taskId: 'task_12',
    message: 'Task assigned: Prepare weekly status report',
    readStatus: false,
    createdAt: '2024-12-19T10:45:00Z',
  },
  {
    id: '13',
    userId: '3',
    taskId: 'task_13',
    message: 'Reminder: Schedule one-on-one meetings',
    readStatus: true,
    createdAt: '2024-12-18T14:30:00Z',
  },
  {
    id: '14',
    userId: '3',
    taskId: 'task_14',
    message: 'Task assigned: Review project timelines',
    readStatus: false,
    createdAt: '2024-12-18T11:20:00Z',
  },
  {
    id: '15',
    userId: '3',
    taskId: 'task_15',
    message: 'Task completed: Employee training session',
    readStatus: true,
    createdAt: '2024-12-17T16:45:00Z',
  },
];

const MOCK_TASKS: Task[] = [
  // Tasks assigned TO HR user (User ID: 1)
  {
    id: 'task_1',
    title: 'Review employee performance documents',
    description:
      'Please review and approve the quarterly performance documents for all team members. Pay special attention to goal achievement metrics and development plans.',
    fileUrl: 'https://example.com/documents/performance_q4.pdf',
    createdBy: '2', // Admin user
    assignedTo: '1', // HR user
    department: 'HR',
    status: 'assigned',
    createdAt: '2024-12-19T10:30:00Z',
    updatedAt: '2024-12-19T10:30:00Z',
    dueDate: '2024-12-25T17:00:00Z',
  },
  {
    id: 'task_2',
    title: 'Complete monthly report',
    description:
      'Compile and submit the monthly departmental report including budget analysis, team performance metrics, and upcoming initiatives.',
    fileUrl: 'https://example.com/documents/monthly_report_template.xlsx',
    createdBy: '3', // Supervisor
    assignedTo: '1', // HR user
    department: 'HR',
    status: 'in_progress',
    createdAt: '2024-12-19T09:15:00Z',
    updatedAt: '2024-12-19T14:20:00Z',
    dueDate: '2024-12-22T12:00:00Z',
  },
  {
    id: 'task_3',
    title: 'Update employee handbook policies',
    description:
      'Review and update the employee handbook with new policies regarding remote work, vacation time, and professional development opportunities.',
    fileUrl: 'https://example.com/documents/employee_handbook_v2.docx',
    createdBy: '2', // Admin user
    assignedTo: '1', // HR user
    department: 'HR',
    status: 'assigned',
    createdAt: '2024-12-19T08:00:00Z',
    updatedAt: '2024-12-19T08:00:00Z',
    dueDate: '2024-12-30T17:00:00Z',
  },
  {
    id: 'task_4',
    title: 'Submit quarterly budget analysis',
    description:
      'Prepare and submit the quarterly budget analysis report with recommendations for cost optimization and resource allocation for the next quarter.',
    fileUrl: 'https://example.com/documents/budget_analysis_q4.xlsx',
    createdBy: '3', // Supervisor
    assignedTo: '1', // HR user
    department: 'HR',
    status: 'completed',
    createdAt: '2024-12-17T14:20:00Z',
    updatedAt: '2024-12-19T09:45:00Z',
    dueDate: '2024-12-20T17:00:00Z',
  },
  {
    id: 'task_5',
    title: 'Coordinate employee training sessions',
    description:
      'Organize and coordinate professional development training sessions for all departments. Include scheduling, venue booking, and material preparation.',
    fileUrl: 'https://example.com/documents/training_schedule.pdf',
    createdBy: '2', // Admin user
    assignedTo: '1', // HR user
    department: 'HR',
    status: 'in_progress',
    createdAt: '2024-12-18T11:30:00Z',
    updatedAt: '2024-12-19T13:15:00Z',
    dueDate: '2024-12-28T17:00:00Z',
  },

  // Tasks assigned TO Admin user (User ID: 2)
  {
    id: 'task_6',
    title: 'Server maintenance scheduled',
    description:
      'Perform scheduled maintenance on production servers including security updates, performance optimization, and backup verification.',
    fileUrl: 'https://example.com/documents/server_maintenance_guide.pdf',
    createdBy: '3', // Supervisor
    assignedTo: '2', // Admin user
    department: 'Admin',
    status: 'assigned',
    createdAt: '2024-12-19T11:45:00Z',
    updatedAt: '2024-12-19T11:45:00Z',
    dueDate: '2024-12-21T09:00:00Z',
  },
  {
    id: 'task_7',
    title: 'Update security protocols',
    description:
      'Review and update all security protocols including password policies, access controls, and incident response procedures.',
    fileUrl: 'https://example.com/documents/security_protocols_v3.pdf',
    createdBy: '1', // HR user
    assignedTo: '2', // Admin user
    department: 'Admin',
    status: 'in_progress',
    createdAt: '2024-12-19T09:30:00Z',
    updatedAt: '2024-12-19T15:20:00Z',
    dueDate: '2024-12-24T17:00:00Z',
  },
  {
    id: 'task_8',
    title: 'Fix database backup issues',
    description:
      'Investigate and resolve issues with automated database backups. Ensure all critical data is properly backed up and recovery procedures are tested.',
    fileUrl: 'https://example.com/documents/database_backup_logs.txt',
    createdBy: '3', // Supervisor
    assignedTo: '2', // Admin user
    department: 'Admin',
    status: 'completed',
    createdAt: '2024-12-18T15:20:00Z',
    updatedAt: '2024-12-19T10:30:00Z',
    dueDate: '2024-12-19T17:00:00Z',
  },
  {
    id: 'task_9',
    title: 'Install new software licenses',
    description:
      'Purchase and install new software licenses for development tools, productivity software, and security applications across all workstations.',
    fileUrl: 'https://example.com/documents/software_license_list.xlsx',
    createdBy: '1', // HR user
    assignedTo: '2', // Admin user
    department: 'Admin',
    status: 'assigned',
    createdAt: '2024-12-18T13:10:00Z',
    updatedAt: '2024-12-18T13:10:00Z',
    dueDate: '2024-12-23T17:00:00Z',
  },
  {
    id: 'task_10',
    title: 'Network infrastructure audit',
    description:
      'Conduct comprehensive audit of network infrastructure including switches, routers, firewalls, and wireless access points. Document findings and recommendations.',
    fileUrl: 'https://example.com/documents/network_audit_report.pdf',
    createdBy: '3', // Supervisor
    assignedTo: '2', // Admin user
    department: 'Admin',
    status: 'completed',
    createdAt: '2024-12-17T10:30:00Z',
    updatedAt: '2024-12-18T16:45:00Z',
    dueDate: '2024-12-18T17:00:00Z',
  },

  // Tasks assigned TO Supervisor user (User ID: 3)
  {
    id: 'task_11',
    title: 'Team performance review meeting',
    description:
      'Conduct quarterly team performance review meetings with all direct reports. Prepare evaluation forms and development plans.',
    fileUrl: 'https://example.com/documents/performance_review_template.docx',
    createdBy: '1', // HR user
    assignedTo: '3', // Supervisor
    department: 'Supervisor',
    status: 'assigned',
    createdAt: '2024-12-19T12:15:00Z',
    updatedAt: '2024-12-19T12:15:00Z',
    dueDate: '2024-12-26T17:00:00Z',
  },
  {
    id: 'task_12',
    title: 'Prepare weekly status report',
    description:
      'Compile weekly status report for all team projects including progress updates, blockers, and resource requirements.',
    fileUrl: 'https://example.com/documents/status_report_template.xlsx',
    createdBy: '2', // Admin user
    assignedTo: '3', // Supervisor
    department: 'Supervisor',
    status: 'in_progress',
    createdAt: '2024-12-19T10:45:00Z',
    updatedAt: '2024-12-19T14:30:00Z',
    dueDate: '2024-12-20T17:00:00Z',
  },
  {
    id: 'task_13',
    title: 'Schedule one-on-one meetings',
    description:
      'Schedule and conduct one-on-one meetings with all team members to discuss career development, goals, and any concerns.',
    fileUrl: 'https://example.com/documents/meeting_agenda_template.docx',
    createdBy: '1', // HR user
    assignedTo: '3', // Supervisor
    department: 'Supervisor',
    status: 'completed',
    createdAt: '2024-12-18T14:30:00Z',
    updatedAt: '2024-12-19T11:20:00Z',
    dueDate: '2024-12-19T17:00:00Z',
  },
  {
    id: 'task_14',
    title: 'Review project timelines',
    description:
      'Review all current project timelines and adjust schedules based on resource availability and priority changes. Update project management system.',
    fileUrl: 'https://example.com/documents/project_timeline_review.xlsx',
    createdBy: '2', // Admin user
    assignedTo: '3', // Supervisor
    department: 'Supervisor',
    status: 'assigned',
    createdAt: '2024-12-18T11:20:00Z',
    updatedAt: '2024-12-18T11:20:00Z',
    dueDate: '2024-12-22T17:00:00Z',
  },
  {
    id: 'task_15',
    title: 'Employee training session',
    description:
      'Organize and conduct employee training session on new company policies, safety procedures, and professional development opportunities.',
    fileUrl: 'https://example.com/documents/training_materials.pdf',
    createdBy: '1', // HR user
    assignedTo: '3', // Supervisor
    department: 'Supervisor',
    status: 'completed',
    createdAt: '2024-12-17T16:45:00Z',
    updatedAt: '2024-12-18T14:20:00Z',
    dueDate: '2024-12-18T17:00:00Z',
  },

  // Tasks created BY users (for "My Assigned Tasks" screen)
  // Tasks created by HR user (User ID: 1) - these appear in HR's "My Assigned Tasks"
  {
    id: 'task_16',
    title: 'Implement new payroll system',
    description:
      'Research, evaluate, and implement a new payroll management system to streamline HR processes and improve employee experience.',
    fileUrl: 'https://example.com/documents/payroll_system_specs.pdf',
    createdBy: '1', // HR user (creator)
    assignedTo: '2', // Admin user (assignee)
    department: 'Admin',
    status: 'in_progress',
    createdAt: '2024-12-18T16:45:00Z',
    updatedAt: '2024-12-19T11:30:00Z',
    dueDate: '2024-12-30T17:00:00Z',
  },
  {
    id: 'task_17',
    title: 'Design employee onboarding process',
    description:
      'Create comprehensive onboarding process for new employees including documentation, training schedules, and mentor assignment.',
    fileUrl: 'https://example.com/documents/onboarding_process_draft.docx',
    createdBy: '1', // HR user (creator)
    assignedTo: '3', // Supervisor (assignee)
    department: 'Supervisor',
    status: 'assigned',
    createdAt: '2024-12-19T09:20:00Z',
    updatedAt: '2024-12-19T09:20:00Z',
    dueDate: '2024-12-27T17:00:00Z',
  },

  // Tasks created by Admin user (User ID: 2) - these appear in Admin's "My Assigned Tasks"
  {
    id: 'task_18',
    title: 'Setup backup disaster recovery plan',
    description:
      'Develop comprehensive disaster recovery plan for all IT systems including backup procedures, recovery timelines, and testing protocols.',
    createdBy: '2', // Admin user (creator)
    assignedTo: '1', // HR user (assignee)
    department: 'HR',
    status: 'assigned',
    createdAt: '2024-12-18T14:15:00Z',
    updatedAt: '2024-12-18T14:15:00Z',
    dueDate: '2024-12-29T17:00:00Z',
  },
  {
    id: 'task_19',
    title: 'Upgrade office network equipment',
    description:
      'Plan and execute upgrade of office network equipment including switches, access points, and cabling infrastructure.',
    createdBy: '2', // Admin user (creator)
    assignedTo: '3', // Supervisor (assignee)
    department: 'Supervisor',
    status: 'in_progress',
    createdAt: '2024-12-17T11:30:00Z',
    updatedAt: '2024-12-19T10:15:00Z',
    dueDate: '2024-12-25T17:00:00Z',
  },

  // Tasks created by Supervisor (User ID: 3) - these appear in Supervisor's "My Assigned Tasks"
  {
    id: 'task_20',
    title: 'Conduct team building activities',
    description:
      'Organize and execute team building activities to improve collaboration, communication, and team morale across departments.',
    createdBy: '3', // Supervisor (creator)
    assignedTo: '1', // HR user (assignee)
    department: 'HR',
    status: 'completed',
    createdAt: '2024-12-16T13:45:00Z',
    updatedAt: '2024-12-18T15:30:00Z',
    dueDate: '2024-12-19T17:00:00Z',
  },
  {
    id: 'task_21',
    title: 'Optimize development workflows',
    description:
      'Analyze current development workflows and implement improvements to increase efficiency, reduce bottlenecks, and improve code quality.',
    createdBy: '3', // Supervisor (creator)
    assignedTo: '2', // Admin user (assignee)
    department: 'Admin',
    status: 'assigned',
    createdAt: '2024-12-18T10:20:00Z',
    updatedAt: '2024-12-18T10:20:00Z',
    dueDate: '2024-12-26T17:00:00Z',
  },
];

const initialState: TaskState = {
  assignedToMe: [], // Tasks assigned TO current user
  assignedByMe: [], // Tasks assigned BY current user (History)
  inbox: [], // Notifications for current user
  isLoading: false,
  error: null,
  currentTask: null, // Single task for details view
};

// Async thunks for API calls
export const fetchInboxNotifications = createAsyncThunk(
  'tasks/fetchInboxNotifications',
  async (userId: string, { rejectWithValue }) => {
    try {
      // In real implementation: const response = await api.get(`/notifications/inbox/${userId}`);
      // For now, return mock data filtered by user
      const userNotifications = MOCK_NOTIFICATIONS.filter(
        notification => notification.userId === userId,
      );

      // Also get locally created notifications from AsyncStorage
      try {
        const localNotifications = await AsyncStorage.getItem(
          STORAGE_KEYS.LOCAL_NOTIFICATIONS,
        );
        if (localNotifications) {
          const parsedLocalNotifications: Notification[] =
            JSON.parse(localNotifications);
          const userLocalNotifications = parsedLocalNotifications.filter(
            notification => notification.userId === userId,
          );

          // Merge local notifications with mock notifications
          // Put local notifications first (newest first)
          return [...userLocalNotifications, ...userNotifications];
        }
      } catch (storageError) {
        console.error('Failed to load local notifications:', storageError);
        // Continue with just mock notifications if storage fails
      }

      return userNotifications;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to fetch notifications';
      return rejectWithValue(message);
    }
  },
);

export const fetchAssignedToMeTasks = createAsyncThunk(
  'tasks/fetchAssignedToMeTasks',
  async (userId: string, { rejectWithValue }) => {
    try {
      // Simulate API call delay
      await new Promise<void>(resolve => setTimeout(resolve, 600));

      // In real implementation: const response = await api.get(`/tasks/assigned-to-me/${userId}`);
      // For now, return mock data filtered by assignedTo
      const assignedToMeTasks = MOCK_TASKS.filter(
        task => task.assignedTo === userId,
      );

      return assignedToMeTasks;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to fetch assigned tasks';
      return rejectWithValue(message);
    }
  },
);

export const fetchAssignedByMeTasks = createAsyncThunk(
  'tasks/fetchAssignedByMeTasks',
  async (userId: string, { rejectWithValue, getState }) => {
    try {
      // Simulate API call delay
      await new Promise<void>(resolve => setTimeout(resolve, 500));

      // In real implementation: const response = await api.get(`/tasks/assigned-by-me/${userId}`);
      // For now, return mock data filtered by createdBy (tasks assigned BY current user)
      const mockAssignedByMeTasks = MOCK_TASKS.filter(
        task => task.createdBy === userId,
      );

      // Get current state to preserve locally created tasks
      const state = getState() as any;
      const currentAssignedByMeTasks = state.tasks.assignedByMe || [];

      // Find locally created tasks (tasks with IDs starting with 'task_' and timestamp)
      const locallyAssignedByMeTasks = currentAssignedByMeTasks.filter(
        (task: Task) =>
          task.id.startsWith('task_') &&
          task.createdBy === userId &&
          !mockAssignedByMeTasks.find(mockTask => mockTask.id === task.id),
      );

      // Merge mock tasks with locally created tasks, with locally created tasks first (newest first)
      const allAssignedByMeTasks = [
        ...locallyAssignedByMeTasks,
        ...mockAssignedByMeTasks,
      ];

      return allAssignedByMeTasks;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to fetch assigned by me tasks';
      return rejectWithValue(message);
    }
  },
);

export const reassignTask = createAsyncThunk(
  'tasks/reassignTask',
  async (
    {
      taskId,
      newAssigneeId,
      newDepartment,
      reassignedBy,
    }: {
      taskId: string;
      newAssigneeId: string | null; // null for new tasks
      newDepartment?: string | null;
      reassignedBy: string;
    },
    { rejectWithValue, getState },
  ) => {
    try {
      // Simulate API call delay
      await new Promise<void>(resolve => setTimeout(resolve, 800));

      // In real implementation:
      // const response = await api.put(`/tasks/${taskId}/reassign`, { assignedTo: newAssigneeId, department: newDepartment });

      const state = getState() as any;
      const allTasks = [
        ...state.tasks.assignedToMe,
        ...state.tasks.assignedByMe,
      ];
      const taskToReassign = allTasks.find(task => task.id === taskId);

      if (!taskToReassign) {
        throw new Error('Task not found');
      }

      // Create updated task with new assignment
      const updatedTask: Task = {
        ...taskToReassign,
        assignedTo: newAssigneeId,
        department: newDepartment || taskToReassign.department,
        status: newAssigneeId ? 'assigned' : 'new',
        updatedAt: new Date().toISOString(),
        assignmentHistory: [
          ...(taskToReassign.assignmentHistory || []),
          {
            assignedFrom: taskToReassign.assignedTo || 'new',
            assignedTo: newAssigneeId || 'new',
            assignedBy: reassignedBy,
            assignmentDate: new Date().toISOString(),
            statusChange: `Reassigned from ${
              taskToReassign.assignedTo || 'new'
            } to ${newAssigneeId || 'new'}`,
          },
        ],
      };

      return { taskId, updatedTask };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to reassign task';
      return rejectWithValue(message);
    }
  },
);

export const fetchTaskById = createAsyncThunk(
  'tasks/fetchTaskById',
  async (taskId: string, { rejectWithValue, getState }) => {
    try {
      // Simulate API call delay
      await new Promise<void>(resolve => setTimeout(resolve, 300));

      // In real implementation: const response = await api.get(`/tasks/${taskId}`);

      // First check if the task exists in current state (locally created tasks)
      const state = getState() as any;
      const allTasks = [
        ...state.tasks.assignedTasks,
        ...state.tasks.createdTasks,
        ...MOCK_TASKS,
      ];

      const task = allTasks.find(t => t.id === taskId);

      if (!task) {
        return rejectWithValue(`Task with ID ${taskId} not found`);
      }

      return task;
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to fetch task details';
      return rejectWithValue(message);
    }
  },
);

export const updateTaskStatus = createAsyncThunk(
  'tasks/updateTaskStatus',
  async (
    {
      taskId,
      status,
    }: { taskId: string; status: 'Assigned' | 'In Progress' | 'Completed' },
    { rejectWithValue },
  ) => {
    try {
      // Simulate API call delay
      await new Promise<void>(resolve => setTimeout(resolve, 400));

      // In real implementation:
      // const response = await api.put(`/tasks/${taskId}/status`, { status });

      // For now, simulate successful update
      return { taskId, status, updatedAt: new Date().toISOString() };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to update task status';
      return rejectWithValue(message);
    }
  },
);

export const markNotificationAsRead = createAsyncThunk(
  'tasks/markNotificationAsRead',
  async (notificationId: string, { rejectWithValue }) => {
    try {
      // Simulate API call delay
      await new Promise<void>(resolve => setTimeout(resolve, 200));

      // In real implementation:
      // const response = await api.put(`/notifications/${notificationId}/read`);

      return notificationId;
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to mark notification as read';
      return rejectWithValue(message);
    }
  },
);

export const createTask = createAsyncThunk(
  'tasks/createTask',
  async (
    taskData: {
      title: string;
      description: string;
      department: string;
      assignedTo: string | null;
      assignedToName?: string;
      fileUrl?: string;
      timeline: string;
      createdBy: string;
      createdByName: string;
      tenantId: string;
    },
    { rejectWithValue, getState },
  ) => {
    try {
      // Get auth token from state
      const state = getState() as any;
      const token = state.auth.token;
      const AsyncStorage = await import(
        '@react-native-async-storage/async-storage'
      );
      const { STORAGE_KEYS } = await import('../constants/app');

      if (!token) {
        throw new Error('No authentication token available');
      }

      // Prepare API request data according to the curl request format
      const apiTaskData: any = {
        title: taskData.title,
        description: taskData.description,
        dueDate: taskData.timeline.split('T')[0], // Format as YYYY-MM-DD
        status: 'new', // Always set status to 'new' as per requirement
        tenantId: taskData.tenantId,
        createdBy: taskData.createdBy,
        createdByName: taskData.createdByName,
      };

      // Add assigned user info if provided
      if (taskData.assignedTo && taskData.assignedToName) {
        apiTaskData.assignedTo = taskData.assignedTo;
        apiTaskData.assignedToName = taskData.assignedToName;
        apiTaskData.status = 'assigned';
      }

      // Add notification payload for backend to send FCM topic notifications
      const notificationPayload = {
        title: taskData.title,
        assignedToName: taskData.assignedToName || null,
      };
      apiTaskData.notificationPayload = notificationPayload;

      // Call real API
      const response = await authService.createTask(apiTaskData, token);
      console.log('Task created successfully:', response);

      // Map API response to our Task interface
      const newTask: Task = {
        id: response._id || response.id || `task_${Date.now()}`,
        title: apiTaskData.title,
        description: apiTaskData.description,
        fileUrl: taskData.fileUrl,
        createdBy: taskData.createdBy,
        assignedTo: taskData.assignedTo,
        department: taskData.department,
        status:
          apiTaskData.status === 'progress'
            ? 'in_progress'
            : (apiTaskData.status as
                | 'new'
                | 'assigned'
                | 'in_progress'
                | 'completed'),
        createdAt: response.createdAt || new Date().toISOString(),
        updatedAt: response.updatedAt || new Date().toISOString(),
        dueDate: taskData.timeline,
      };

      // Create notifications for all users
      const currentState = getState() as any;
      const allUsers = [
        { id: '1', name: 'John Doe', department: 'HR' },
        { id: '2', name: 'Jane Smith', department: 'Admin' },
        { id: '3', name: 'Mike Johnson', department: 'Supervisor' },
      ];

      // Find assigned user and creator names
      const assignedUser = allUsers.find(
        user => user.id === newTask.assignedTo,
      );
      const creatorUser = allUsers.find(user => user.id === newTask.createdBy);

      const notifications: Notification[] = allUsers.map(user => ({
        id: `notif_${Date.now()}_${user.id}`,
        userId: user.id,
        taskId: newTask.id,
        message: newTask.assignedTo
          ? `New task "${newTask.title}" assigned to ${
              assignedUser?.name || 'Unknown'
            } by ${creatorUser?.name || 'Unknown'}`
          : `New unassigned task "${newTask.title}" created by ${
              creatorUser?.name || 'Unknown'
            }`,
        readStatus: false,
        createdAt: new Date().toISOString(),
        // Enhanced fields
        taskTitle: newTask.title,
        assignedTo: newTask.assignedTo ?? undefined,
        assignedToName: assignedUser?.name,
        createdBy: newTask.createdBy,
        createdByName: creatorUser?.name,
        department: newTask.department ?? undefined,
      }));

      // Store notifications in AsyncStorage
      try {
        const existingNotifications = await AsyncStorage.default.getItem(
          STORAGE_KEYS.LOCAL_NOTIFICATIONS,
        );
        const currentNotifications = existingNotifications
          ? JSON.parse(existingNotifications)
          : [];
        const updatedNotifications = [
          ...currentNotifications,
          ...notifications,
        ];
        await AsyncStorage.default.setItem(
          STORAGE_KEYS.LOCAL_NOTIFICATIONS,
          JSON.stringify(updatedNotifications),
        );
      } catch (error) {
        console.error('Failed to store notifications:', error);
      }

      return { task: newTask, notifications };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Failed to create task';
      return rejectWithValue(message);
    }
  },
);

const taskSlice = createSlice({
  name: 'tasks',
  initialState,
  reducers: {
    clearTaskError: state => {
      state.error = null;
    },
    // Optimistic update for task status (immediate UI feedback)
    updateTaskStatusOptimistic: (
      state,
      action: PayloadAction<{
        taskId: string;
        status: 'new' | 'assigned' | 'in_progress' | 'completed';
      }>,
    ) => {
      const { taskId, status } = action.payload;
      // Try to find and update in assigned to me tasks first
      let task = state.assignedToMe.find(task => task.id === taskId);
      if (task) {
        task.status = status;
        task.updatedAt = new Date().toISOString();
      } else {
        // If not found in assigned to me tasks, try assigned by me tasks
        task = state.assignedByMe.find(task => task.id === taskId);
        if (task) {
          task.status = status;
          task.updatedAt = new Date().toISOString();
        }
      }
    },
    // Mark notification as read optimistically
    markNotificationAsReadOptimistic: (
      state,
      action: PayloadAction<string>,
    ) => {
      const notification = state.inbox.find(n => n.id === action.payload);
      if (notification) {
        notification.readStatus = true;
      }
    },
  },
  extraReducers: builder => {
    // Fetch inbox notifications
    builder
      .addCase(fetchInboxNotifications.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        fetchInboxNotifications.fulfilled,
        (state, action: PayloadAction<Notification[]>) => {
          state.isLoading = false;
          state.inbox = action.payload;
          state.error = null;
        },
      )
      .addCase(fetchInboxNotifications.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })

      // Fetch assigned to me tasks
      .addCase(fetchAssignedToMeTasks.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        fetchAssignedToMeTasks.fulfilled,
        (state, action: PayloadAction<Task[]>) => {
          state.isLoading = false;
          state.assignedToMe = action.payload;
          state.error = null;
        },
      )
      .addCase(fetchAssignedToMeTasks.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })

      // Fetch assigned by me tasks
      .addCase(fetchAssignedByMeTasks.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        fetchAssignedByMeTasks.fulfilled,
        (state, action: PayloadAction<Task[]>) => {
          state.isLoading = false;
          state.assignedByMe = action.payload;
          state.error = null;
        },
      )
      .addCase(fetchAssignedByMeTasks.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })

      // Update task status
      .addCase(updateTaskStatus.pending, state => {
        // Keep optimistic update, don't show loading for better UX
      })
      .addCase(
        updateTaskStatus.fulfilled,
        (
          state,
          action: PayloadAction<{
            taskId: string;
            status: string;
            updatedAt: string;
          }>,
        ) => {
          const { taskId, status, updatedAt } = action.payload;
          // Try to find and update in assigned to me tasks first
          let task = state.assignedToMe.find(task => task.id === taskId);
          if (task) {
            task.status = status as
              | 'new'
              | 'assigned'
              | 'in_progress'
              | 'completed';
            task.updatedAt = updatedAt;
          } else {
            // If not found in assigned to me tasks, try assigned by me tasks
            task = state.assignedByMe.find(task => task.id === taskId);
            if (task) {
              task.status = status as
                | 'new'
                | 'assigned'
                | 'in_progress'
                | 'completed';
              task.updatedAt = updatedAt;
            }
          }
          state.error = null;
        },
      )
      .addCase(updateTaskStatus.rejected, (state, action) => {
        state.error = action.payload as string;
        // Note: In real app, you might want to revert optimistic update here
      })

      // Mark notification as read
      .addCase(
        markNotificationAsRead.fulfilled,
        (state, action: PayloadAction<string>) => {
          const notification = state.inbox.find(n => n.id === action.payload);
          if (notification) {
            notification.readStatus = true;
          }
        },
      )
      .addCase(markNotificationAsRead.rejected, (state, action) => {
        state.error = action.payload as string;
      })

      // Create task
      .addCase(createTask.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        createTask.fulfilled,
        (
          state,
          action: PayloadAction<{ task: Task; notifications: Notification[] }>,
        ) => {
          state.isLoading = false;
          // Add the new task to assigned by me tasks (since current user created/assigned it)
          state.assignedByMe.push(action.payload.task);
          // Note: Notifications are stored in AsyncStorage and will be loaded by fetchInboxNotifications
          // We don't add them directly to the Redux state to avoid the refresh override issue
          state.error = null;
        },
      )
      .addCase(createTask.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      })

      // Fetch task by ID
      .addCase(fetchTaskById.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        fetchTaskById.fulfilled,
        (state, action: PayloadAction<Task>) => {
          state.isLoading = false;
          state.currentTask = action.payload;
          state.error = null;
        },
      )
      .addCase(fetchTaskById.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
        state.currentTask = null;
      })

      // Reassign task
      .addCase(reassignTask.pending, state => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(
        reassignTask.fulfilled,
        (
          state,
          action: PayloadAction<{ taskId: string; updatedTask: Task }>,
        ) => {
          state.isLoading = false;
          const { taskId, updatedTask } = action.payload;

          // Update in assigned to me tasks if found
          const assignedToMeTaskIndex = state.assignedToMe.findIndex(
            task => task.id === taskId,
          );
          if (assignedToMeTaskIndex !== -1) {
            state.assignedToMe[assignedToMeTaskIndex] = updatedTask;
          }

          // Update in assigned by me tasks if found
          const assignedByMeTaskIndex = state.assignedByMe.findIndex(
            task => task.id === taskId,
          );
          if (assignedByMeTaskIndex !== -1) {
            state.assignedByMe[assignedByMeTaskIndex] = updatedTask;
          }

          // Update current task if it's the same
          if (state.currentTask && state.currentTask.id === taskId) {
            state.currentTask = updatedTask;
          }

          state.error = null;
        },
      )
      .addCase(reassignTask.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;
      });
  },
});

export const {
  clearTaskError,
  updateTaskStatusOptimistic,
  markNotificationAsReadOptimistic,
} = taskSlice.actions;

export default taskSlice.reducer;
