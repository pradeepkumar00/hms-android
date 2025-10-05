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
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
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
import { Task, User } from '../types';
import type { TabType } from '../components/TaskTabs';
import Icon from 'react-native-vector-icons/MaterialIcons';
import authService from '../services/authService';
import {
  formatDateDDMMYYYY,
  formatDetailedRelativeTime,
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
      setTask(currentTask);

      // Update parent and child tasks if available in currentTask
      if (currentTask.childTasks) {
        setChildTasks(currentTask.childTasks);
      }
    }
  }, [currentTask, taskId]);

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      if (error) {
        dispatch(clearTaskError());
      }
    };
  }, [dispatch, error]);

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
      {/* Header with Create Child Task button */}
      <View style={styles.headerContainer}>
        <Header
          title="Task Details"
          showNotificationIcon={false}
          showHomeIcon={true}
          onHomePress={() => navigation.navigate('Main')}
        />
        {canCreateChild && (
          <TouchableOpacity
            style={styles.createChildButton}
            onPress={handleCreateChildTask}
            activeOpacity={0.7}
          >
            <Icon name="add-circle" size={20} color={theme.colors.surface} />
            <Text style={styles.createChildButtonText}>Create Child Task</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Tab Navigation (Phase 10) */}
      <TaskTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        hasParent={!!parentTask}
        childrenCount={childTasks.length}
      />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Details Tab Content */}
        {activeTab === 'details' && (
          <>
            {/* Task Header */}
            <View style={styles.taskHeader}>
              <Text style={styles.taskTitle}>{task.title}</Text>

              <View style={styles.statusContainer}>
                <Icon
                  name={getStatusIcon(task.status)}
                  size={20}
                  color={getStatusColor(task.status)}
                />
                <Text
                  style={[
                    styles.statusText,
                    { color: getStatusColor(task.status) },
                  ]}
                >
                  {task.status}
                </Text>
              </View>
            </View>

            {/* Due Date Warning */}
            {dueDateStatus && (
              <View
                style={[
                  styles.dueDateContainer,
                  { backgroundColor: dueDateStatus.color + '15' },
                ]}
              >
                <Icon name="schedule" size={16} color={dueDateStatus.color} />
                <Text
                  style={[styles.dueDateText, { color: dueDateStatus.color }]}
                >
                  {dueDateStatus.text}
                </Text>
              </View>
            )}

            {/* Task Details Card */}
            <View style={styles.detailsCard}>
              <Text style={styles.sectionTitle}>Task Information</Text>

              {/* Description */}
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Description</Text>
                <Text style={styles.detailValue}>{task.description}</Text>
              </View>

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

            {/* Status Update Section - Only for authorized users in non-readonly mode */}
            {!readonly && canEditStatus && (
              <View style={styles.statusUpdateCard}>
                <Text style={styles.sectionTitle}>Update Status</Text>
                <Text style={styles.statusUpdateSubtitle}>
                  Change the status to reflect your progress on this task.
                </Text>

                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerLabel}>Current Status</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={task.status}
                      onValueChange={handleStatusUpdate}
                      enabled={!isUpdatingStatus}
                      style={styles.picker}
                      mode="dropdown"
                    >
                      {getAllowedStatusOptions(task.status).map(option => (
                        <Picker.Item
                          key={option.value}
                          label={option.label}
                          value={option.value}
                        />
                      ))}
                    </Picker>
                  </View>
                </View>

                {isUpdatingStatus && (
                  <View style={styles.updatingContainer}>
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary}
                    />
                    <Text style={styles.updatingText}>Updating status...</Text>
                  </View>
                )}
              </View>
            )}

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

        {/* History Tab Content (Placeholder) */}
        {activeTab === 'history' && (
          <View style={styles.tabPlaceholder}>
            <Icon name="history" size={48} color={theme.colors.textSecondary} />
            <Text style={styles.placeholderText}>
              Task history will be displayed here
            </Text>
            <Text style={styles.placeholderSubtext}>
              This feature will be implemented in a future update
            </Text>
          </View>
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
                  Create a child task to break down this task into smaller parts
                </Text>
                {canCreateChild && (
                  <TouchableOpacity
                    style={styles.emptyStateButton}
                    onPress={handleCreateChildTask}
                  >
                    <Icon name="add" size={20} color={theme.colors.surface} />
                    <Text style={styles.emptyStateButtonText}>
                      Create Child Task
                    </Text>
                  </TouchableOpacity>
                )}
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
                ListFooterComponent={
                  canCreateChild ? (
                    <View style={styles.addChildFooterContainer}>
                      <TouchableOpacity
                        style={styles.emptyStateButton}
                        onPress={handleCreateChildTask}
                        activeOpacity={0.7}
                      >
                        <Icon
                          name="add"
                          size={20}
                          color={theme.colors.surface}
                        />
                        <Text style={styles.emptyStateButtonText}>
                          Create Child Task
                        </Text>
                      </TouchableOpacity>
                    </View>
                  ) : null
                }
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
                {/* <Text style={styles.modalDescription}>
                  Select a department and user to assign this task.
                </Text>

                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerLabel}>Department</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={selectedDepartment}
                      onValueChange={value => {
                        setSelectedDepartment(value);
                        setSelectedUser(null); // Reset user selection when department changes
                      }}
                      style={styles.picker}
                    >
                      {departments.map(dept => (
                        <Picker.Item key={dept} label={dept} value={dept} />
                      ))}
                    </Picker>
                  </View>
                </View> */}

                <View style={styles.pickerContainer}>
                  <Text style={styles.pickerLabel}>User</Text>
                  <View style={styles.pickerWrapper}>
                    <Picker
                      selectedValue={selectedUser?.id || ''}
                      onValueChange={userId => {
                        const user = users.find(u => u.id === userId);
                        setSelectedUser(user || null);
                      }}
                      style={styles.picker}
                      // enabled={selectedDepartment.length > 0}
                    >
                      <Picker.Item label="Select a user..." value="" />
                      {users
                        // .filter(user => user.type === selectedDepartment)
                        .map(user => (
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
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
  pickerWrapper: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    overflow: 'hidden',
    paddingHorizontal: theme.spacing.xs,
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
});

export default TaskDetailsScreen;
