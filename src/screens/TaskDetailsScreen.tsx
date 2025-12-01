import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Linking,
  Modal,
  FlatList,
  TextInput,
  StatusBar,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Picker } from '@react-native-picker/picker';

// Import images for Assigned To and Status
const UserIcon = require('../../assets/images/User.png');
const StatusIcon = require('../../assets/images/Status.png');
import {
  useAppDispatch,
  useAppSelector,
  selectCurrentUser,
  selectAuthToken,
  selectAssignedTasks,
  selectCreatedTasks,
  selectCurrentTask,
  selectTasksLoading,
  selectTasksError,
} from '../store';
import {
  updateTaskStatus,
  updateTaskStatusOptimistic,
  updateTaskStatusReal,
  clearTaskError,
  fetchAssignedToMeTasks,
  fetchAssignedByMeTasks,
  fetchTaskById,
  fetchCreatedTasks,
  fetchTaskWithHierarchy,
  createChildTask,
} from '../store/taskSlice';
import { theme } from '../constants/theme';
import { Header, TaskTabs } from '../components';
import { TASK_STATUSES } from '../constants/app';
import { Task, User, TaskHistoryEntry } from '../types';
import type { TabType } from '../components/TaskTabs';
import environmentService from '../services/environmentService';
import Icon from 'react-native-vector-icons/MaterialIcons';
import authService from '../services/authService';
import {
  formatDateDDMMYYYY,
  formatDetailedRelativeTime,
  formatDateTime,
} from '../utils/helpers';

interface TaskDetailsScreenProps {
  navigation: any;
  route: {
    params: {
      taskId: string;
      readonly?: boolean;
    };
  };
}

const TaskDetailsScreen: React.FC<TaskDetailsScreenProps> = ({
  navigation,
  route,
}) => {
  // Safely extract route params with comprehensive error handling
  const routeParams = route?.params || {};
  const { taskId, readonly = false } = routeParams;

  // Additional validation for route params to prevent undefined errors
  React.useEffect(() => {
    if (!route) {
      console.error('❌ TaskDetailsScreen: No route object provided');
      return;
    }
    if (!route.params) {
      console.error('❌ TaskDetailsScreen: No route params provided');
      return;
    }
    if (!taskId || typeof taskId !== 'string') {
      console.error('❌ TaskDetailsScreen: Invalid or missing taskId:', {
        taskId,
        routeParams,
      });
      return;
    }
    console.log('✅ TaskDetailsScreen: Valid route params received:', {
      taskId,
      readonly,
    });
  }, [route, routeParams, taskId, readonly]);

  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const token = useAppSelector(selectAuthToken);
  const assignedTasks = useAppSelector(selectAssignedTasks);
  const createdTasks = useAppSelector(selectCreatedTasks);
  const currentTask = useAppSelector(selectCurrentTask);
  const isLoading = useAppSelector(selectTasksLoading);
  const error = useAppSelector(selectTasksError);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [task, setTask] = useState<Task | null>(null);

  // Assignment modal states
  const [showAssignModal, setShowAssignModal] = useState(false);
  // const [departments, setDepartments] = useState<string[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [selectedDepartment, setSelectedDepartment] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<User | null>(null);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Tab and hierarchy states (Phase 10)
  const [activeTab, setActiveTab] = useState<TabType>('details');
  const [parentTask, setParentTask] = useState<Task | null>(null);
  const [childTasks, setChildTasks] = useState<Task[]>([]);

  // Editable fields state
  const [selectedUsers, setSelectedUsers] = useState<
    Array<{ id: string; name: string }>
  >([]);
  const [selectedStatus, setSelectedStatus] = useState<string>('assigned');
  const [editableDescription, setEditableDescription] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [allAvailableUsers, setAllAvailableUsers] = useState<User[]>([]);

  // Comment state
  const [commentText, setCommentText] = useState<string>('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // Multi-select user modal state
  const [showUserSelectModal, setShowUserSelectModal] = useState(false);
  const [tempSelectedUserIds, setTempSelectedUserIds] = useState<string[]>([]);

  // Convert internal task status to display status for API
  const convertToApiStatus = (
    status: 'new' | 'assigned' | 'progress' | 'completed',
  ): 'Assigned' | 'In Progress' | 'Completed' => {
    switch (status) {
      case 'assigned':
        return 'Assigned';
      case 'progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      default:
        return 'Assigned'; // Default fallback
    }
  };

  // Early return if no taskId is provided
  if (!taskId) {
    return (
      <View style={styles.container}>
        <Header title="Task Details" />
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No task ID provided</Text>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Find the task from the store or fetch it
  useEffect(() => {
    console.log(`🔍 TaskDetailsScreen: Looking for task ${taskId}`);

    // First, try to find in assigned tasks
    let foundTask = assignedTasks.find(t => t.id === taskId);
    console.log(`📋 Found in assignedTasks:`, !!foundTask);

    // If not found in assigned tasks, try created tasks
    if (!foundTask) {
      foundTask = createdTasks.find(t => t.id === taskId);
      console.log(`📋 Found in createdTasks:`, !!foundTask);
    }

    // If not found in either, check currentTask from redux (might be from fetchTaskById)
    if (!foundTask && currentTask && currentTask.id === taskId) {
      foundTask = currentTask;
      console.log(`📋 Found in currentTask:`, !!foundTask);
    }

    // ALWAYS fetch with hierarchy to get parent/child relationships (Phase 10)
    console.log(`🔄 Fetching task with hierarchy: ${taskId}`);
    const fetchPromise = dispatch(fetchTaskWithHierarchy(taskId));

    // Debug the dispatch result
    fetchPromise
      .then(result => {
        console.log('🎯 fetchTaskWithHierarchy dispatch RESOLVED:', {
          type: result.type,
          hasParent: !!(result.payload as any).parentTask,
          childrenCount: (result.payload as any).childTasks?.length || 0,
        });

        // Update parent and child tasks from response
        if (result.payload && typeof result.payload === 'object') {
          const payload = result.payload as any;
          setParentTask(payload.parentTask || null);
          setChildTasks(payload.childTasks || []);

          console.log('📊 Hierarchy state updated:', {
            hasParent: !!payload.parentTask,
            childrenCount: payload.childTasks?.length || 0,
          });
        }
      })
      .catch(error => {
        console.log('💥 fetchTaskWithHierarchy dispatch REJECTED:', {
          error: error,
          message: error.message,
        });
      });
  }, [taskId, dispatch]);

  // Update local task state when currentTask changes (from fetchTaskWithHierarchy)
  useEffect(() => {
    if (currentTask && currentTask.id === taskId) {
      console.log(
        `✅ Task loaded from fetchTaskWithHierarchy:`,
        currentTask.title,
      );
      console.log('📝 Comments count:', currentTask.comment?.length || 0);
      setTask(currentTask);

      // Initialize editable fields
      if (currentTask.user && currentTask.user.length > 0) {
        setSelectedUsers(
          currentTask.user.map(u => ({
            id: u.id || u._id || '',
            name: u.name || 'no-name',
          })),
        );
      } else {
        // If no users, show placeholder
        setSelectedUsers([{ id: '', name: 'no-name' }]);
      }

      setSelectedStatus(currentTask.status || 'assigned');
      setEditableDescription(currentTask.description || '');

      // Update parent and child tasks if available in currentTask
      if (currentTask.childTasks) {
        setChildTasks(currentTask.childTasks);
      }
    }
  }, [currentTask, taskId]);

  // Fetch all users for dropdown selection
  useEffect(() => {
    const fetchUsers = async () => {
      if (!token) return;

      try {
        const { users: allUsers } =
          await authService.getAllUsersWithDepartments(token);
        setAllAvailableUsers(allUsers);
      } catch (error) {
        console.error('Failed to fetch users:', error);
      }
    };

    fetchUsers();
  }, [token]);

  // Handle opening user selection modal
  const handleOpenUserSelect = useCallback(() => {
    setTempSelectedUserIds(selectedUsers.map(u => u.id).filter(id => id));
    setShowUserSelectModal(true);
  }, [selectedUsers]);

  // Handle user selection confirmation
  const handleConfirmUserSelection = useCallback(() => {
    const selected = allAvailableUsers
      .filter(u => tempSelectedUserIds.includes(u.id))
      .map(u => ({ id: u.id, name: u.name }));
    setSelectedUsers(
      selected.length > 0 ? selected : [{ id: '', name: 'no-name' }],
    );
    setShowUserSelectModal(false);
  }, [tempSelectedUserIds, allAvailableUsers]);

  // Toggle user selection
  const toggleUserSelection = useCallback((userId: string) => {
    setTempSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  }, []);

  // Save task updates (users, status, description)
  const handleSaveTask = useCallback(async () => {
    if (!task || !token) return;

    setIsSaving(true);
    try {
      // Prepare update payload matching the API format from curl
      const updatePayload: any = {
        user: selectedUsers
          .filter(u => u.id)
          .map(u => ({ id: u.id, name: u.name })),
        status: selectedStatus,
      };

      console.log('🔄 Updating task:', task.id, updatePayload);

      // Make API call to update task (using environment-configured API URL)
      const apiBaseUrl = environmentService.getApiBaseUrl();
      const response = await fetch(
        `${apiBaseUrl}/task/taskId/${task.id}/update`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(updatePayload),
        },
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const updatedTask = await response.json();
      console.log('✅ Task updated successfully:', updatedTask);

      // Update local task state
      setTask(updatedTask);

      // Show success message
      Alert.alert('Success', 'Task updated successfully!', [{ text: 'OK' }]);

      // Refresh task data
      dispatch(fetchTaskWithHierarchy(task.id));
    } catch (error) {
      console.error('Failed to save task:', error);
      Alert.alert(
        'Save Failed',
        'Failed to save task updates. Please try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setIsSaving(false);
    }
  }, [task, token, selectedUsers, selectedStatus, dispatch]);

  // Submit comment
  const handleSubmitComment = useCallback(async () => {
    if (!task || !token || !commentText.trim()) return;

    setIsSubmittingComment(true);
    try {
      console.log('💬 Submitting comment for task:', task.id);

      // Make API call to add comment (using environment-configured API URL)
      const apiBaseUrl = environmentService.getApiBaseUrl();
      const response = await fetch(
        `${apiBaseUrl}/task/taskId/${task.id}/comment`,
        {
          method: 'POST',
          headers: {
            Accept: 'application/json, text/plain, */*',
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ comment: commentText.trim() }),
        },
      );

      if (!response.ok) {
        throw new Error(`API Error: ${response.status}`);
      }

      const result = await response.json();
      console.log('✅ Comment added successfully:', result);

      // Clear comment input
      setCommentText('');

      // Refresh task data to get updated comments - WAIT for completion
      const refreshResult = await dispatch(
        fetchTaskWithHierarchy(task.id),
      ).unwrap();
      console.log('🔄 Task refreshed with new comment:', refreshResult);

      // Show success message after state is updated
      Alert.alert('Success', 'Comment added successfully!', [{ text: 'OK' }]);
    } catch (error) {
      console.error('Failed to add comment:', error);
      Alert.alert('Failed', 'Failed to add comment. Please try again.', [
        { text: 'OK' },
      ]);
    } finally {
      setIsSubmittingComment(false);
    }
  }, [task, token, commentText, dispatch]);

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      if (error) {
        dispatch(clearTaskError());
      }
    };
  }, [dispatch, error]);

  // Format comment timestamp (DD MMM YYYY, HH:MM AM/PM)
  const formatCommentTime = useCallback((dateString: string) => {
    try {
      const date = new Date(dateString);
      const day = date.getDate();
      const monthNames = [
        'Jan',
        'Feb',
        'Mar',
        'Apr',
        'May',
        'Jun',
        'Jul',
        'Aug',
        'Sep',
        'Oct',
        'Nov',
        'Dec',
      ];
      const month = monthNames[date.getMonth()];
      const year = date.getFullYear();
      let hours = date.getHours();
      const minutes = date.getMinutes().toString().padStart(2, '0');
      const ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      return `${day} ${month} ${year}, ${hours}:${minutes} ${ampm}`;
    } catch {
      return 'Invalid Date';
    }
  }, []);

  // Format dates to match Due Date format (consistent formatting)
  const formatTaskDates = useCallback(
    (createdAt: string, updatedAt: string) => {
      const formatDetailedDate = (dateString: string) => {
        return new Date(dateString).toLocaleDateString('en-US', {
          weekday: 'short',
          year: 'numeric',
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        });
      };

      return {
        createdText: formatDetailedDate(createdAt),
        updatedText: formatDetailedDate(updatedAt),
      };
    },
    [],
  );

  // Get allowed status transitions based on current status and user permissions
  const getAllowedStatusOptions = useCallback(
    (currentStatus: string) => {
      const allStatuses = TASK_STATUSES.map(status => ({
        label: status.label,
        value: status.value,
      }));

      // Check if current user can update this task (assignee OR creator OR any assigned user)
      const isCreator = task && user && task.createdBy === user.id;
      const isAssignee = task && user && task.assignedTo === user.id;
      const isInAssignedUsers =
        task &&
        user &&
        task.user?.some(u => u.id === user.id || u._id === user.id);
      const canUpdateTask = isCreator || isAssignee || isInAssignedUsers;

      // If user cannot update task, return only current status (readonly)
      if (!canUpdateTask) {
        return allStatuses.filter(s => s.value === currentStatus);
      }

      // Define allowed transitions for users with update permissions
      switch (currentStatus) {
        case 'new':
          // From New status, can change to assigned or keep it new
          return allStatuses.filter(
            s => s.value === 'new' || s.value === 'assigned',
          );
        case 'assigned':
          // From Assigned, can stay assigned or move to progress
          return allStatuses.filter(
            s => s.value === 'assigned' || s.value === 'progress',
          );
        case 'progress':
          // From Progress, can stay progress or move to completed
          return allStatuses.filter(
            s => s.value === 'progress' || s.value === 'completed',
          );
        case 'completed':
          // From Completed, can only stay completed (no backwards flow)
          return allStatuses.filter(s => s.value === 'completed');
        default:
          return allStatuses.filter(s => s.value === currentStatus);
      }
    },
    [task, user],
  );

  // Calculate due date status
  const getDueDateStatus = useCallback(
    (dueDate?: string) => {
      if (!dueDate || !task) return null;

      const due = new Date(dueDate);
      const now = new Date();
      const diffInDays = Math.ceil(
        (due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24),
      );

      // For completed tasks, show completion information instead of overdue
      if (task.status === 'completed') {
        const completionDate = task.updatedAt ? new Date(task.updatedAt) : now;
        const daysSinceCompletion = Math.ceil(
          (now.getTime() - completionDate.getTime()) / (1000 * 60 * 60 * 24),
        );

        if (daysSinceCompletion === 0) {
          return {
            text: 'Completed today',
            color: theme.colors.success,
          };
        } else if (daysSinceCompletion === 1) {
          return {
            text: 'Completed yesterday',
            color: theme.colors.success,
          };
        } else {
          return {
            text: `Completed ${daysSinceCompletion} days ago`,
            color: theme.colors.success,
          };
        }
      }

      // For non-completed tasks, show due date status
      if (diffInDays < 0) {
        return {
          text: `Overdue by ${Math.abs(diffInDays)} days`,
          color: theme.colors.error,
        };
      } else if (diffInDays === 0) {
        return { text: 'Due today', color: theme.colors.warning };
      } else if (diffInDays <= 3) {
        return {
          text: `Due in ${diffInDays} days`,
          color: theme.colors.warning,
        };
      } else {
        return {
          text: `Due in ${diffInDays} days`,
          color: theme.colors.success,
        };
      }
    },
    [task],
  );

  // Load users and departments from API
  const loadUsersAndDepartments = useCallback(async () => {
    if (!token) return;

    setLoadingUsers(true);
    try {
      const { users: allUsers } = await authService.getAllUsersWithDepartments(
        token,
      );
      // setDepartments(depts);
      setUsers(allUsers);
      // if (depts.length > 0) {
      //   setSelectedDepartment(depts[0]);
      // }
    } catch (error) {
      console.error('Failed to load users and departments:', error);
      Alert.alert('Error', 'Failed to load users. Please try again.', [
        { text: 'OK' },
      ]);
    } finally {
      setLoadingUsers(false);
    }
  }, [token]);

  // Handle assignment confirmation
  const handleAssignTask = useCallback(async () => {
    if (!task || !selectedUser) return;

    setShowAssignModal(false);
    setIsUpdatingStatus(true);

    try {
      // Convert status for real API call
      await dispatch(
        updateTaskStatusReal({
          taskId: task.id,
          status: 'assigned',
          assignedTo: selectedUser.id,
          assignedToName: selectedUser.name,
        }),
      ).unwrap();

      Alert.alert(
        'Task Assigned',
        `Task has been assigned to ${selectedUser.name}.`,
        [{ text: 'OK' }],
      );

      // Reset selection
      setSelectedUser(null);
      // setSelectedDepartment('');
    } catch (error) {
      console.error('Failed to assign task:', error);
      Alert.alert(
        'Assignment Failed',
        'Failed to assign task. Please try again.',
        [{ text: 'OK' }],
      );
    } finally {
      setIsUpdatingStatus(false);
    }
  }, [task, selectedUser, dispatch]);

  // Handle status update
  const handleStatusUpdate = useCallback(
    async (newStatus: 'new' | 'assigned' | 'progress' | 'completed') => {
      if (!task || readonly) return;

      // Check if current user can update this task (assignee OR creator OR any assigned user)
      const isCreator = user && task.createdBy === user.id;
      const isAssignee = user && task.assignedTo === user.id;
      const isInAssignedUsers =
        user && task.user?.some(u => u.id === user.id || u._id === user.id);
      const canUpdateTask = isCreator || isAssignee || isInAssignedUsers;

      if (!canUpdateTask) {
        Alert.alert(
          'Access Denied',
          'Only the task creator or assigned users can update this task.',
          [{ text: 'OK' }],
        );
        return;
      }

      // Special handling for changing from 'new' to 'assigned'
      if (task.status === 'new' && newStatus === 'assigned') {
        // Check if user is creator (only creator can assign new tasks)
        if (!isCreator) {
          Alert.alert(
            'Access Denied',
            'Only the task creator can assign new tasks.',
            [{ text: 'OK' }],
          );
          return;
        }

        // Show assignment modal for new tasks
        await loadUsersAndDepartments();
        setShowAssignModal(true);
        setIsUpdatingStatus(false);
        return;
      }

      setIsUpdatingStatus(true);

      // Optimistic update for immediate UI feedback
      dispatch(
        updateTaskStatusOptimistic({ taskId: task.id, status: newStatus }),
      );

      try {
        // Convert status for API call (backend expects 'complete' instead of 'completed')
        const apiStatus = newStatus;

        await dispatch(
          updateTaskStatusReal({
            taskId: task.id,
            status: apiStatus as 'new' | 'assigned' | 'progress' | 'completed',
            assignedTo: task.assignedTo || undefined,
            assignedToName: task.assignedToName || undefined,
          }),
        ).unwrap();

        Alert.alert(
          'Status Updated',
          `Task status has been updated to "${
            newStatus.charAt(0).toUpperCase() +
            newStatus.slice(1).replace('_', ' ')
          }".`,
          [{ text: 'OK' }],
        );
      } catch (error) {
        console.error('Failed to update task status:', error);
        Alert.alert(
          'Update Failed',
          'Failed to update task status. Please try again.',
          [{ text: 'OK' }],
        );
      } finally {
        setIsUpdatingStatus(false);
      }
    },
    [task, readonly, dispatch, user],
  );

  // Handle file download
  const handleFileDownload = useCallback(async (fileUrl: string) => {
    try {
      const supported = await Linking.canOpenURL(fileUrl);
      if (supported) {
        await Linking.openURL(fileUrl);
      } else {
        Alert.alert(
          'Cannot Open File',
          'Unable to open this file type on your device.',
          [{ text: 'OK' }],
        );
      }
    } catch (error) {
      console.error('Failed to open file:', error);
      Alert.alert('Error', 'Failed to open the file. Please try again.', [
        { text: 'OK' },
      ]);
    }
  }, []);

  // Handle create child task button click (Phase 10)
  const handleCreateChildTask = useCallback(() => {
    if (!task) return;

    // Check if user can create child task
    const canCreateChild =
      user &&
      (task.createdBy === user.id ||
        task.assignedTo === user.id ||
        task.user?.some(u => u.id === user.id || u._id === user.id));

    if (!canCreateChild) {
      Alert.alert(
        'Access Denied',
        'Only the task creator or assigned users can create child tasks.',
        [{ text: 'OK' }],
      );
      return;
    }

    // Navigate to CreateTask screen with parentTaskId
    navigation.navigate('CreateTask', { parentTaskId: task.id });
  }, [task, user, navigation]);

  // Navigate to parent/child task
  const handleTaskNavigation = useCallback(
    (targetTaskId: string) => {
      navigation.push('TaskDetails', { taskId: targetTaskId });
    },
    [navigation],
  );

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'Assigned':
        return theme.colors.warning;
      case 'In Progress':
        return theme.colors.primary;
      case 'Completed':
        return theme.colors.success;
      default:
        return theme.colors.textSecondary;
    }
  };

  // Get status icon
  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'Assigned':
        return 'assignment';
      case 'In Progress':
        return 'hourglass-empty';
      case 'Completed':
        return 'check-circle';
      default:
        return 'radio-button-unchecked';
    }
  };

  // Show error state if there's an error and no task
  if (error && !task && !isLoading) {
    return (
      <View style={styles.container}>
        <Header
          title="Task Details"
          showNotificationIcon={false}
          showHomeIcon={true}
          onHomePress={() => navigation.navigate('Main')}
        />
        <View style={styles.errorContainer}>
          <Icon name="error" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>Task Not Available</Text>
          <Text style={styles.errorSubtext}>
            {error.includes('not found')
              ? 'This task may have been removed or you may not have permission to view it.'
              : typeof error === 'string'
              ? error
              : 'Unable to load task details. Please check your connection and try again.'}
          </Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => {
              console.log(`🔄 Retrying task fetch for ID: ${taskId}`);
              dispatch(clearTaskError());
              if (taskId) {
                // Try fetching both task lists first, then the specific task
                dispatch(fetchCreatedTasks({}));
                dispatch(fetchTaskById(taskId));
              }
            }}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // Show loading state if no task and loading is in progress
  if (!task) {
    return (
      <View style={styles.container}>
        <Header
          title="Task Details"
          showNotificationIcon={false}
          showHomeIcon={true}
          onHomePress={() => navigation.navigate('Main')}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>
            {isLoading ? 'Loading task details...' : 'Searching for task...'}
          </Text>
          <TouchableOpacity
            style={[styles.backButton, { marginTop: theme.spacing.lg }]}
            onPress={() => navigation.goBack()}
          >
            <Text style={styles.backButtonText}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  const { createdText, updatedText } = formatTaskDates(
    task.createdAt,
    task.updatedAt,
  );
  const dueDateStatus = getDueDateStatus(task.dueDate);

  // Check if current user can edit task status (only assigned user or HR)
  const canEditStatus =
    user && (user.id === task.assignedTo || user.id === task.createdBy);

  // Check if user can create child task (Phase 10)
  const canCreateChild =
    user &&
    (task.createdBy === user.id ||
      task.assignedTo === user.id ||
      task.user?.some(u => u.id === user.id || u._id === user.id));

  return (
    <View style={styles.container}>
      {/* Status Bar Configuration */}
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.secondary}
        translucent={false}
      />

      {/* 1. Purple Header with App Icon and "Task" Title */}
      <SafeAreaView style={styles.cyanHeaderSafeArea} edges={['top']}>
        <View style={styles.cyanHeader}>
          <View style={styles.headerContent}>
            <View style={styles.appIconContainer}>
              <View style={styles.imageContainer}>
                <Image
                  source={require('../../assets/images/app-logo.jpeg')}
                  style={styles.imageIcon}
                  resizeMode="contain"
                />
              </View>
            </View>
            <Text style={styles.headerTitle}>Task</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* 2. Cyan Navigation Bar with Title and Create Child Task Button */}
      <View style={styles.cyanNavBar}>
        <View style={styles.navBarContent}>
          <Icon
            name="arrow-back"
            size={24}
            color={theme.colors.text}
            onPress={() => navigation.goBack()}
          />
          <Text style={styles.navBarTitle}>Title: {task.title}</Text>
        </View>
        {canCreateChild && (
          <TouchableOpacity
            style={styles.createChildTaskButton}
            onPress={handleCreateChildTask}
            activeOpacity={0.7}
          >
            <Text style={styles.createChildTaskButtonText}>
              Create Child Task
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 3. Editable Fields Section: 2 Column Layout */}
      <View style={styles.editableFieldsSection}>
        <View style={styles.twoColumnContainer}>
          {/* Column 1: User Selector and Status stacked vertically */}
          <View style={styles.fieldsColumn}>
            {/* User Selector - Clickable */}
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={handleOpenUserSelect}
              activeOpacity={0.7}
            >
              <Image source={UserIcon} style={styles.fieldIcon} />
              <View style={styles.fieldContent}>
                <Text style={styles.fieldValue} numberOfLines={1}>
                  {selectedUsers.length > 0
                    ? selectedUsers.map(u => u.name).join(', ')
                    : 'Select Users'}
                </Text>
                <Icon
                  name="arrow-drop-down"
                  size={18}
                  color={theme.colors.text}
                  style={styles.dropdownIcon}
                />
              </View>
            </TouchableOpacity>

            {/* Status Dropdown */}
            <View style={styles.fieldRow}>
              <Image source={StatusIcon} style={styles.fieldIcon} />
              <View style={styles.fieldContent}>
                <Picker
                  selectedValue={selectedStatus}
                  style={styles.statusPickerCompact}
                  onValueChange={value => setSelectedStatus(value)}
                >
                  <Picker.Item label="New" value="new" />
                  <Picker.Item label="Assigned" value="assigned" />
                  <Picker.Item label="In Progress" value="progress" />
                  <Picker.Item label="Completed" value="completed" />
                  <Picker.Item label="Withdraw" value="withdrawn" />
                </Picker>
              </View>
            </View>
          </View>

          {/* Column 2: Save Button */}
          <View style={styles.saveButtonColumn}>
            <TouchableOpacity
              style={[styles.saveButton, isSaving && styles.saveButtonDisabled]}
              onPress={handleSaveTask}
              disabled={isSaving}
              activeOpacity={0.7}
            >
              {isSaving ? (
                <ActivityIndicator
                  size="small"
                  color={theme.colors.textInverse}
                />
              ) : (
                <Text style={styles.saveButtonText}>Save</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* 4. Tab Navigation */}
      <TaskTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasParent={!!parentTask}
        childrenCount={childTasks.length}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* 5. Details Tab Content */}
        {activeTab === 'details' && (
          <>
            {/* Description Section - Read-only */}
            <View style={styles.descriptionSection}>
              <Text style={styles.descriptionLabel}>description</Text>
              <View style={styles.descriptionTextArea}>
                <Text style={styles.descriptionReadOnlyText}>
                  {editableDescription || 'No description provided'}
                </Text>
              </View>
            </View>

            {/* Attached Files Section */}
            <View style={styles.attachedFileSection}>
              <Text style={styles.attachedFileTitle}>Attached File</Text>

              {task.fileUrl ? (
                <View style={styles.fileItemRow}>
                  <Icon
                    name="insert-drive-file"
                    size={32}
                    color={theme.colors.fileIcon}
                  />
                  <View style={styles.fileInfo}>
                    <Text style={styles.fileAttachedBy}>attached by</Text>
                    <Text style={styles.fileTimestamp}>18-05-2025 10:00pm</Text>
                  </View>
                </View>
              ) : (
                <Text style={styles.noFilesText}>No files attached</Text>
              )}
            </View>

            {/* Comment Section */}
            <View style={styles.commentSection}>
              <Text style={styles.commentSectionTitle}>Comments</Text>

              {/* Comment Input */}
              <View style={styles.commentInputContainer}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="Add a comment"
                  placeholderTextColor={theme.colors.placeholder}
                  value={commentText}
                  onChangeText={setCommentText}
                  multiline
                  numberOfLines={4}
                  textAlignVertical="top"
                />
                <TouchableOpacity
                  style={[
                    styles.commentSubmitButton,
                    (!commentText.trim() || isSubmittingComment) &&
                      styles.commentSubmitButtonDisabled,
                  ]}
                  onPress={handleSubmitComment}
                  disabled={!commentText.trim() || isSubmittingComment}
                  activeOpacity={0.7}
                >
                  {isSubmittingComment ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.textInverse}
                    />
                  ) : (
                    <Text style={styles.commentSubmitButtonText}>Submit</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Comments List - Only show if comments exist */}
              {task.comment && task.comment.length > 0 && (
                <View style={styles.commentsListContainer}>
                  {/* Show comments in reverse order (newest first) */}
                  {[...task.comment].reverse().map((comment, index) => (
                    <View key={comment._id || index} style={styles.commentItem}>
                      <View style={styles.commentHeader}>
                        <Text style={styles.commentText}>
                          {comment.comment}
                        </Text>
                      </View>
                      <View style={styles.commentMeta}>
                        <Text style={styles.commentUser}>
                          User: {comment.commentedByName}
                        </Text>
                        <Text style={styles.commentSeparator}>|</Text>
                        <Text style={styles.commentDate}>
                          {formatCommentTime(comment.commentedAt)}
                        </Text>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>

            {/* Task Details Card (Optional - for additional info) */}
            <View style={styles.detailsCard}>
              <Text style={styles.sectionTitle}>Task Information</Text>

              {/* Assigned To - Show all assigned users */}
              {(task.assignedToName || (task.user && task.user.length > 0)) && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Assigned To</Text>
                  <View style={styles.assignedUsersContainer}>
                    {task.assignedToName && (
                      <Text style={styles.detailValue}>
                        {task.assignedToName}
                      </Text>
                    )}
                    {task.user && task.user.length > 0 && (
                      <View style={styles.multipleUsersContainer}>
                        {task.user.map((user, index) => (
                          <View
                            key={user._id || user.id || index}
                            style={styles.userChip}
                          >
                            <Icon
                              name="person"
                              size={14}
                              color={theme.colors.primary}
                            />
                            <Text style={styles.userChipText}>
                              {user.name || 'Unknown'}
                            </Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Assigned By */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Assigned By</Text>
                <Text style={styles.detailValue}>
                  {task.assignedByName || task.createdByName || 'Unknown'}
                </Text>
              </View>

              {/* Created */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Created</Text>
                <Text style={styles.detailValue}>{createdText}</Text>
              </View>

              {/* Last Updated */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Last Updated</Text>
                <Text style={styles.detailValue}>{updatedText}</Text>
              </View>

              {/* Due Date */}
              {task.dueDate && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Due Date</Text>
                  <Text style={styles.detailValue}>
                    {new Date(task.dueDate).toLocaleDateString('en-US', {
                      weekday: 'short',
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </Text>
                </View>
              )}

              {/* File Attachment */}
              {task.fileUrl && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Attachment</Text>
                  <TouchableOpacity
                    style={styles.fileButton}
                    onPress={() => handleFileDownload(task.fileUrl!)}
                    activeOpacity={0.7}
                  >
                    <Icon
                      name="attach-file"
                      size={16}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.fileButtonText}>View File</Text>
                    <Icon
                      name="open-in-new"
                      size={14}
                      color={theme.colors.primary}
                    />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Access Restriction Notice for unauthorized users */}
            {!readonly && !canEditStatus && (
              <View style={styles.statusUpdateCard}>
                <View style={styles.restrictionContainer}>
                  <Icon name="lock" size={24} color={theme.colors.warning} />
                  <View style={styles.restrictionTextContainer}>
                    <Text style={styles.restrictionTitle}>
                      Status Update Restricted
                    </Text>
                    <Text style={styles.restrictionSubtitle}>
                      Only the assigned user or creator of the task can update
                      the task status.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            {/* Readonly Notice */}
            {readonly && (
              <View style={styles.readonlyNotice}>
                <Icon
                  name="visibility"
                  size={16}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.readonlyText}>
                  This task is in read-only mode. You cannot modify the status.
                </Text>
              </View>
            )}
          </>
        )}

        {/* History Tab Content (Phase 10) */}
        {activeTab === 'history' && (
          <>
            {(() => {
              // Get status label from value
              const getStatusLabel = (statusValue?: string): string => {
                if (!statusValue) return 'New'; // Default to 'New' if status missing
                const status = TASK_STATUSES.find(s => s.value === statusValue);
                return status ? status.label : 'Unknown';
              };

              // Format time as DD-MM-YYYY HH:MMAM/PM
              const formatHistoryTime = (dateString: string): string => {
                try {
                  const date = new Date(dateString);
                  const day = date.getDate().toString().padStart(2, '0');
                  const month = (date.getMonth() + 1)
                    .toString()
                    .padStart(2, '0');
                  const year = date.getFullYear();
                  let hours = date.getHours();
                  const minutes = date.getMinutes().toString().padStart(2, '0');
                  const ampm = hours >= 12 ? 'PM' : 'AM';
                  hours = hours % 12 || 12;
                  return `${day}-${month}-${year} ${hours}:${minutes}${ampm}`;
                } catch {
                  return 'Invalid Date';
                }
              };

              // Prepare history entries (combine taskHistory + creation entry)
              const historyEntries: Array<TaskHistoryEntry> = [];
              // Add taskHistory entries (reverse chronological order)
              if (task?.taskHistory && task.taskHistory.length > 0) {
                historyEntries.push(...task.taskHistory);
              }

              // Add creation entry at the end (oldest)
              if (task?.createdAt && task?.createdByName) {
                historyEntries.push({
                  status:
                    task.taskHistory?.[task.taskHistory.length - 1]?.status ||
                    task?.status ||
                    'new',
                  changedBy: task.createdBy,
                  changedByName: task.createdByName,
                  changedAt: task.createdAt,
                  _id: 'creation-entry',
                });
              }

              // Reverse to show newest first
              // const historyEntries = [...historyEntries].reverse();

              return historyEntries.length > 0 ? (
                <FlatList
                  data={historyEntries}
                  keyExtractor={(item, index) => item._id || `history-${index}`}
                  contentContainerStyle={styles.historyListContainer}
                  renderItem={({ item, index }) => {
                    const isLast = index === historyEntries.length - 1;
                    const statusLabel = getStatusLabel(item.status);

                    // Get assigned user names for this history entry
                    const assignedUserNames =
                      task?.user?.map(u => u.name).join(', ') || 'Unknown User';

                    return (
                      <View style={styles.historyEntry}>
                        {/* Timeline dot and line */}
                        <View style={styles.timelineContainer}>
                          <View
                            style={[
                              styles.timelineDot,
                              index === 0 && styles.timelineDotCreation,
                            ]}
                          />
                          {!isLast && <View style={styles.timelineLine} />}
                        </View>

                        {/* History entry content */}
                        <View style={styles.historyContent}>
                          {/* User names with icon */}
                          <View style={styles.historyUserRow}>
                            <Icon
                              name="account-circle"
                              size={20}
                              color={theme.colors.primary}
                              style={styles.historyUserIcon}
                            />
                            <Text style={styles.historyUserNames}>
                              {assignedUserNames}
                            </Text>
                          </View>

                          {/* Status */}
                          <Text style={styles.historyStatusLine}>
                            status: {statusLabel}
                          </Text>

                          {/* Separator line */}
                          <View style={styles.historySeparator} />

                          {/* Changed By / Created By */}
                          <Text style={styles.historyChangedBy}>
                            {index === 0 ? 'Created' : 'Changed'} By:{' '}
                            {item.changedByName}
                          </Text>

                          {/* Time */}
                          <Text style={styles.historyTime}>
                            Time: {formatHistoryTime(item.changedAt)}
                          </Text>
                        </View>
                      </View>
                    );
                  }}
                />
              ) : (
                <View style={styles.tabPlaceholder}>
                  <Icon
                    name="history"
                    size={48}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.placeholderText}>
                    No history available
                  </Text>
                  <Text style={styles.placeholderSubtext}>
                    Task history will appear here once changes are made
                  </Text>
                </View>
              );
            })()}
          </>
        )}

        {/* Parent Task Tab Content (Phase 10) */}
        {activeTab === 'parent' && (
          <>
            {parentTask ? (
              <View style={styles.parentTaskContainer}>
                <TouchableOpacity
                  style={styles.parentTaskCard}
                  onPress={() => handleTaskNavigation(parentTask.id)}
                  activeOpacity={0.7}
                >
                  <View style={styles.parentTaskHeader}>
                    <Icon
                      name="arrow-upward"
                      size={24}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.parentTaskLabel}>Parent Task</Text>
                  </View>

                  <Text style={styles.parentTaskTitle}>{parentTask.title}</Text>

                  <View style={styles.parentTaskDetails}>
                    <View style={styles.parentTaskDetailRow}>
                      <Icon
                        name="label"
                        size={16}
                        color={theme.colors.textSecondary}
                      />
                      <Text style={styles.parentTaskDetailText}>
                        Status:{' '}
                        <Text
                          style={[
                            styles.parentTaskStatus,
                            { color: getStatusColor(parentTask.status) },
                          ]}
                        >
                          {parentTask.status}
                        </Text>
                      </Text>
                    </View>

                    {parentTask.assignedToName && (
                      <View style={styles.parentTaskDetailRow}>
                        <Icon
                          name="person"
                          size={16}
                          color={theme.colors.textSecondary}
                        />
                        <Text style={styles.parentTaskDetailText}>
                          Assigned to: {parentTask.assignedToName}
                        </Text>
                      </View>
                    )}

                    {parentTask.dueDate && (
                      <View style={styles.parentTaskDetailRow}>
                        <Icon
                          name="event"
                          size={16}
                          color={theme.colors.textSecondary}
                        />
                        <Text style={styles.parentTaskDetailText}>
                          Due:{' '}
                          {new Date(parentTask.dueDate).toLocaleDateString()}
                        </Text>
                      </View>
                    )}

                    <View style={styles.parentTaskDetailRow}>
                      <Icon
                        name="person-outline"
                        size={16}
                        color={theme.colors.textSecondary}
                      />
                      <Text style={styles.parentTaskDetailText}>
                        Created by: {parentTask.createdByName || 'Unknown'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.parentTaskFooter}>
                    <Text style={styles.parentTaskLink}>
                      Tap to view parent task
                    </Text>
                    <Icon
                      name="arrow-forward"
                      size={20}
                      color={theme.colors.primary}
                    />
                  </View>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.emptyState}>
                <Icon
                  name="layers"
                  size={64}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.emptyStateText}>No parent task</Text>
                <Text style={styles.emptyStateSubtext}>
                  This is a top-level task with no parent
                </Text>
              </View>
            )}
          </>
        )}

        {/* Child Tasks Tab Content (Phase 10) */}
        {activeTab === 'children' && (
          <View style={styles.childTasksContainer}>
            {childTasks.length === 0 ? (
              <View style={styles.emptyState}>
                <Icon
                  name="folder-open"
                  size={64}
                  color={theme.colors.textSecondary}
                />
                <Text style={styles.emptyStateText}>No child tasks yet</Text>
                <Text style={styles.emptyStateSubtext}>
                  Use the "Create Child Task" button above to break down this
                  task into smaller parts
                </Text>
              </View>
            ) : (
              <FlatList
                data={childTasks}
                keyExtractor={item => item.id}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.childTaskCard}
                    onPress={() => handleTaskNavigation(item.id)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.childTaskHeader}>
                      <View style={styles.childTaskTitleContainer}>
                        <Icon
                          name="subdirectory-arrow-right"
                          size={20}
                          color={theme.colors.textSecondary}
                        />
                        <Text style={styles.childTaskTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                      </View>
                      <Icon
                        name="chevron-right"
                        size={24}
                        color={theme.colors.textSecondary}
                      />
                    </View>

                    <View style={styles.childTaskMeta}>
                      <View
                        style={[
                          styles.childTaskStatus,
                          {
                            backgroundColor: getStatusColor(item.status) + '20',
                          },
                        ]}
                      >
                        <Icon
                          name={getStatusIcon(item.status)}
                          size={14}
                          color={getStatusColor(item.status)}
                        />
                        <Text
                          style={[
                            styles.childTaskStatusText,
                            { color: getStatusColor(item.status) },
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>

                      {item.assignedToName && (
                        <View style={styles.childTaskAssignee}>
                          <Icon
                            name="person-outline"
                            size={14}
                            color={theme.colors.textSecondary}
                          />
                          <Text style={styles.childTaskAssigneeText}>
                            {item.assignedToName}
                          </Text>
                        </View>
                      )}
                    </View>

                    {item.dueDate && (
                      <View style={styles.childTaskDueDate}>
                        <Icon
                          name="event"
                          size={14}
                          color={theme.colors.textSecondary}
                        />
                        <Text style={styles.childTaskDueDateText}>
                          Due: {new Date(item.dueDate).toLocaleDateString()}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                )}
                contentContainerStyle={styles.childTasksList}
              />
            )}
          </View>
        )}
      </ScrollView>

      {/* Assignment Modal */}
      <Modal
        visible={showAssignModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowAssignModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Assign Task</Text>
              <TouchableOpacity
                onPress={() => setShowAssignModal(false)}
                style={styles.modalCloseButton}
              >
                <Icon name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            {loadingUsers ? (
              <View style={styles.modalLoading}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.modalLoadingText}>Loading users...</Text>
              </View>
            ) : (
              <View style={styles.modalContent}>
                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerLabel}>User</Text>
                  <View style={styles.statusPickerContainer}>
                    <Picker
                      selectedValue={selectedUser?.id || ''}
                      onValueChange={userId => {
                        const user = users.find(u => u.id === userId);
                        setSelectedUser(user || null);
                      }}
                      style={styles.picker}
                    >
                      <Picker.Item label="Select a user..." value="" />
                      {users.map(user => (
                        <Picker.Item
                          key={user.id}
                          label={user.name}
                          value={user.id}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>

                <View style={styles.modalActions}>
                  <TouchableOpacity
                    onPress={() => setShowAssignModal(false)}
                    style={[styles.modalButton, styles.modalCancelButton]}
                  >
                    <Text style={styles.modalCancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleAssignTask}
                    style={[
                      styles.modalButton,
                      styles.modalAssignButton,
                      !selectedUser && styles.modalButtonDisabled,
                    ]}
                    disabled={!selectedUser}
                  >
                    <Text
                      style={[
                        styles.modalAssignButtonText,
                        !selectedUser && styles.modalButtonTextDisabled,
                      ]}
                    >
                      Assign Task
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          </View>
        </View>
      </Modal>

      {/* Multi-Select User Modal */}
      <Modal
        visible={showUserSelectModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowUserSelectModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Users</Text>
              <TouchableOpacity
                onPress={() => setShowUserSelectModal(false)}
                style={styles.modalCloseButton}
              >
                <Icon name="close" size={24} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.modalContent}>
              <Text style={styles.modalDescription}>
                Select one or more users to assign this task.
              </Text>

              <ScrollView style={styles.userListContainer}>
                {allAvailableUsers.map(user => {
                  const isSelected = tempSelectedUserIds.includes(user.id);
                  return (
                    <TouchableOpacity
                      key={user.id}
                      style={[
                        styles.userListItem,
                        isSelected && styles.userListItemSelected,
                      ]}
                      onPress={() => toggleUserSelection(user.id)}
                      activeOpacity={0.7}
                    >
                      <View style={styles.userListItemContent}>
                        <Icon
                          name="person"
                          size={20}
                          color={
                            isSelected
                              ? theme.colors.primary
                              : theme.colors.textSecondary
                          }
                        />
                        <Text
                          style={[
                            styles.userListItemText,
                            isSelected && styles.userListItemTextSelected,
                          ]}
                        >
                          {user.name}
                        </Text>
                      </View>
                      {isSelected && (
                        <Icon
                          name="check-circle"
                          size={20}
                          color={theme.colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              <View style={styles.modalActions}>
                <TouchableOpacity
                  onPress={() => setShowUserSelectModal(false)}
                  style={[styles.modalButton, styles.modalCancelButton]}
                >
                  <Text style={styles.modalCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirmUserSelection}
                  style={[
                    styles.modalButton,
                    styles.modalAssignButton,
                    tempSelectedUserIds.length === 0 &&
                      styles.modalButtonDisabled,
                  ]}
                  disabled={tempSelectedUserIds.length === 0}
                >
                  <Text
                    style={[
                      styles.modalAssignButtonText,
                      tempSelectedUserIds.length === 0 &&
                        styles.modalButtonTextDisabled,
                    ]}
                  >
                    Confirm ({tempSelectedUserIds.length})
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  // 1. Purple Header Styles
  cyanHeaderSafeArea: {
    backgroundColor: theme.colors.primary, // #8091F2
  },
  cyanHeader: {
    backgroundColor: theme.colors.primary, // #8091F2
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    ...theme.shadows.sm,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  appIconContainer: {
    marginRight: theme.spacing.md,
  },
  headerTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textInverse,
  },
  // 2. Cyan Navigation Bar Styles
  cyanNavBar: {
    backgroundColor: theme.colors.secondary, // #00BCD4
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  navBarContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  navBarTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginLeft: theme.spacing.xs,
    flex: 1,
  },
  createChildTaskButton: {
    backgroundColor: theme.colors.primary, // Purple button
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  createChildTaskButtonText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textInverse,
  },
  // 3. Editable Fields Section Styles - 2 Column Layout
  editableFieldsSection: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  twoColumnContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.md,
  },
  fieldsColumn: {
    flex: 1,
    gap: theme.spacing.xs,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.sm,
    height: 40, // Fixed height instead of minHeight
    overflow: 'hidden', // Prevent content from expanding beyond fixed height
  },
  fieldIcon: {
    width: 20,
    height: 20,
    marginRight: theme.spacing.sm,
    resizeMode: 'contain',
  },
  fieldContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 40, // Match parent height
  },
  fieldValue: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    lineHeight: 18, // Consistent line height
  },
  dropdownIcon: {
    marginLeft: theme.spacing.xs,
  },
  statusPickerCompact: {
    flex: 1,
    height: 40, // Match fieldRow height exactly
    color: theme.colors.text,
    fontSize: theme.typography.fontSizes.sm,
  },
  statusPickerContainer: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
    justifyContent: 'center',
    minHeight: 40,
  },
  saveButtonColumn: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveButton: {
    backgroundColor: theme.colors.primary, // Purple
    paddingHorizontal: theme.spacing.xl,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 100,
    ...theme.shadows.md,
  },
  saveButtonDisabled: {
    opacity: 0.6,
  },
  saveButtonText: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textInverse,
  },
  // 5. Description & Files Sections
  descriptionSection: {
    padding: theme.spacing.lg,
  },
  descriptionLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    textTransform: 'lowercase',
  },
  descriptionTextArea: {
    minHeight: 200,
    borderWidth: 2,
    borderColor: theme.colors.primary, // Purple border
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  descriptionReadOnlyText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeights.relaxed * 1.5,
  },
  attachedFileSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.lg,
  },
  attachedFileTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  fileItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  fileInfo: {
    marginLeft: theme.spacing.md,
    flex: 1,
  },
  fileAttachedBy: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  fileTimestamp: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  noFilesText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  content: {
    flex: 1,
    padding: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  taskHeader: {
    marginBottom: theme.spacing.md,
  },
  taskTitle: {
    fontSize: theme.typography.fontSizes.xl, // Reduced from xxl to xl
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md, // Increased margin
    lineHeight: theme.typography.lineHeights.relaxed, // Changed from tight to relaxed
    includeFontPadding: false, // Android fix for text clipping
    paddingVertical: theme.spacing.xs, // Add vertical padding to prevent clipping
    minHeight: 32, // Ensure minimum height for proper rendering
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    marginLeft: theme.spacing.sm,
  },
  dueDateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  dueDateText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    marginLeft: theme.spacing.sm,
  },
  detailsCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  detailRow: {
    marginBottom: theme.spacing.md,
  },
  detailLabel: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  detailValue: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeights.relaxed,
    includeFontPadding: false, // Android fix for text clipping
    paddingTop: 2, // Small padding to prevent clipping
  },
  departmentBadge: {
    backgroundColor: theme.colors.primary + '15',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
    alignSelf: 'flex-start',
    marginTop: 2, // Small margin to align with other detail values
  },
  departmentText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
    includeFontPadding: false, // Remove extra padding
  },
  fileButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '10',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    alignSelf: 'flex-start',
  },
  fileButtonText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.primary,
    marginHorizontal: theme.spacing.sm,
  },
  statusUpdateCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  statusUpdateSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
    lineHeight: theme.typography.lineHeights.relaxed,
  },
  pickerContainer: {
    marginBottom: theme.spacing.md,
  },
  pickerLabel: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
  },
  pickerIcon: {
    position: 'absolute',
    right: theme.spacing.sm,
    top: '50%',
    marginTop: -12,
  },
  updatingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.sm,
  },
  updatingText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.primary,
    marginLeft: theme.spacing.sm,
  },
  readonlyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.textSecondary + '15',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  readonlyText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  restrictionContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
  },
  restrictionTextContainer: {
    flex: 1,
    marginLeft: theme.spacing.md,
  },
  restrictionTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.warning,
    marginBottom: theme.spacing.xs,
  },
  restrictionSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.relaxed,
  },
  picker: {
    height: 50,
    width: '100%',
    color: theme.colors.text,
    fontSize: theme.typography.fontSizes.md,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSizes.lg,
    color: theme.colors.error,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
    fontWeight: theme.typography.fontWeights.medium,
  },
  errorSubtext: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
    lineHeight: theme.typography.lineHeights.relaxed,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  retryButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  backButton: {
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.primary,
  },
  backButtonText: {
    color: theme.colors.primary,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  // Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    margin: theme.spacing.lg,
    maxWidth: 400,
    width: '90%',
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  modalTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  modalCloseButton: {
    padding: theme.spacing.sm,
  },
  modalContent: {
    padding: theme.spacing.lg,
  },
  modalDescription: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    lineHeight: theme.typography.lineHeights.relaxed,
  },
  modalLoading: {
    padding: theme.spacing.xl,
    alignItems: 'center',
  },
  modalLoadingText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.md,
  },

  modalActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.lg,
  },
  modalButton: {
    flex: 1,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    marginHorizontal: theme.spacing.xs,
  },
  modalCancelButton: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  modalCancelButtonText: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
  },
  modalAssignButton: {
    backgroundColor: theme.colors.primary,
  },
  modalAssignButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  modalButtonDisabled: {
    backgroundColor: theme.colors.border,
  },
  modalButtonTextDisabled: {
    color: theme.colors.textSecondary,
  },
  // Assigned Users Styles
  assignedUsersContainer: {
    flex: 1,
  },
  multipleUsersContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: theme.spacing.xs,
    gap: theme.spacing.xs,
  },
  userChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '15',
    borderRadius: 16,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    marginRight: theme.spacing.xs,
    marginBottom: theme.spacing.xs,
  },
  userChipText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.medium,
    marginLeft: theme.spacing.xs,
  },
  // Phase 10: Parent-Child Task Styles
  headerContainer: {
    position: 'relative',
  },
  createChildButton: {
    position: 'absolute',
    top: 0,
    right: theme.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  createChildButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    marginLeft: theme.spacing.xs,
  },
  tabPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  placeholderText: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  placeholderSubtext: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
  },
  // Parent Task Styles
  parentTaskContainer: {
    padding: theme.spacing.md,
  },
  parentTaskCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.md,
    borderWidth: 2,
    borderColor: theme.colors.primary + '30',
  },
  parentTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  parentTaskLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
    marginLeft: theme.spacing.sm,
  },
  parentTaskTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  parentTaskDetails: {
    marginBottom: theme.spacing.md,
  },
  parentTaskDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  parentTaskDetailText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  parentTaskStatus: {
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  parentTaskFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.sm,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  parentTaskLink: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.medium,
  },
  // Child Tasks Styles
  childTasksContainer: {
    flex: 1,
  },
  childTasksList: {
    padding: theme.spacing.md,
  },
  addChildFooterContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
  },
  childTaskCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  childTaskHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  childTaskTitleContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  childTaskTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  childTaskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  childTaskStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.sm,
  },
  childTaskStatusText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
    marginLeft: theme.spacing.xs,
  },
  childTaskAssignee: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  childTaskAssigneeText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  childTaskDueDate: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  childTaskDueDateText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  // Empty State Styles
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    textAlign: 'center',
  },
  emptyStateSubtext: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    textAlign: 'center',
    marginBottom: theme.spacing.lg,
  },
  emptyStateButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  emptyStateButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    marginLeft: theme.spacing.sm,
  },
  // History Tab Styles (Phase 10) - Redesigned to match UI image
  historyListContainer: {
    padding: theme.spacing.md,
  },
  historyEntry: {
    flexDirection: 'row',
    marginBottom: theme.spacing.lg,
  },
  timelineContainer: {
    width: 24,
    alignItems: 'center',
    marginRight: theme.spacing.sm,
    marginTop: 2,
  },
  timelineDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#7C4DFF', // Purple color matching the image
    borderWidth: 3,
    borderColor: '#FFFFFF',
  },
  timelineDotCreation: {
    backgroundColor: '#7C4DFF', // Same purple for creation
  },
  timelineLine: {
    width: 3,
    flex: 1,
    backgroundColor: '#7C4DFF', // Purple line matching the image
    marginTop: 4,
  },
  historyContent: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  historyUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  historyUserIcon: {
    marginRight: theme.spacing.xs,
  },
  historyUserNames: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    flex: 1,
  },
  historyStatusLine: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
    marginTop: 2,
  },
  historySeparator: {
    height: 1,
    backgroundColor: '#D0D0D0',
    marginVertical: theme.spacing.sm,
  },
  historyChangedBy: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  historyTime: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
  },
  imageIcon: {
    width: 25,
    height: 25,
  },
  imageContainer: {
    width: 30,
    height: 30,
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 4,
  },
  // User Selection Modal Styles
  userListContainer: {
    maxHeight: 400,
    marginVertical: theme.spacing.md,
  },
  userListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.xs,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  userListItemSelected: {
    backgroundColor: theme.colors.primary + '15',
    borderColor: theme.colors.primary,
  },
  userListItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userListItemText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
  userListItemTextSelected: {
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
  },
  // Comment Section Styles
  commentSection: {
    paddingHorizontal: theme.spacing.lg,
    paddingBottom: theme.spacing.xl,
    marginTop: theme.spacing.md,
  },
  commentSectionTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
  },
  commentInputContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  commentInput: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    minHeight: 80,
    maxHeight: 120,
    textAlignVertical: 'top',
    marginBottom: theme.spacing.sm,
    padding: 0, // Remove default padding
  },
  commentSubmitButton: {
    backgroundColor: theme.colors.primary, // Purple button
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-end',
    minWidth: 100,
    ...theme.shadows.sm,
  },
  commentSubmitButtonDisabled: {
    backgroundColor: theme.colors.disabled,
    opacity: 0.6,
  },
  commentSubmitButtonText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textInverse,
  },
  commentsListContainer: {
    marginTop: theme.spacing.md,
  },
  commentItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  commentHeader: {
    marginBottom: theme.spacing.sm,
  },
  commentText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeights.semiBold,
    lineHeight: theme.typography.lineHeights.relaxed * 1.5,
  },
  commentMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  commentUser: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  commentSeparator: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginHorizontal: theme.spacing.xs,
  },
  commentDate: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  noCommentsContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: theme.spacing.xl,
    marginTop: theme.spacing.md,
  },
  noCommentsText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
    fontWeight: theme.typography.fontWeights.medium,
  },
  noCommentsSubtext: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
});

export default TaskDetailsScreen;
