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
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import {
  useAppDispatch,
  useAppSelector,
  selectCurrentUser,
  selectAssignedTasks,
  selectCreatedTasks,
  selectCurrentTask,
  selectTasksLoading,
  selectTasksError,
} from '../store';
import {
  updateTaskStatus,
  updateTaskStatusOptimistic,
  clearTaskError,
  fetchAssignedTasks,
  fetchCreatedTasks,
  fetchTaskById,
} from '../store/taskSlice';
import { theme } from '../constants/theme';
import { Header } from '../components';
import { TASK_STATUSES } from '../constants/app';
import { Task } from '../types';
import Icon from 'react-native-vector-icons/MaterialIcons';
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
  const { taskId, readonly = false } = route.params;
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const assignedTasks = useAppSelector(selectAssignedTasks);
  const createdTasks = useAppSelector(selectCreatedTasks);
  const currentTask = useAppSelector(selectCurrentTask);
  const isLoading = useAppSelector(selectTasksLoading);
  const error = useAppSelector(selectTasksError);

  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [task, setTask] = useState<Task | null>(null);

  // Find the task from the store or fetch it
  useEffect(() => {
    // First, try to find in assigned tasks
    let foundTask = assignedTasks.find(t => t.id === taskId);

    // If not found in assigned tasks, try created tasks
    if (!foundTask) {
      foundTask = createdTasks.find(t => t.id === taskId);
    }

    // If not found in either, check currentTask from redux (might be from fetchTaskById)
    if (!foundTask && currentTask && currentTask.id === taskId) {
      foundTask = currentTask;
    }

    if (foundTask) {
      setTask(foundTask);
    } else {
      // If task not found anywhere, fetch it by ID (works for notifications and deep linking)
      dispatch(fetchTaskById(taskId));
    }
  }, [taskId, assignedTasks, createdTasks, currentTask, dispatch]);

  // Update local task state when currentTask changes
  useEffect(() => {
    if (currentTask && currentTask.id === taskId) {
      setTask(currentTask);
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

      // Check if current user is the task creator
      const isCreator =
        task && currentUser && task.createdBy === currentUser.id;

      // Define allowed transitions
      switch (currentStatus) {
        case 'new':
          // From New status, only creator can change to assigned or keep it new
          if (isCreator) {
            return allStatuses.filter(
              s => s.value === 'new' || s.value === 'assigned',
            );
          } else {
            // Non-creators can only view, no status change allowed
            return allStatuses.filter(s => s.value === 'new');
          }
        case 'assigned':
          // From Assigned, can stay assigned or move to in_progress
          return allStatuses.filter(
            s => s.value === 'assigned' || s.value === 'in_progress',
          );
        case 'in_progress':
          // From In Progress, can stay in_progress or move to completed
          return allStatuses.filter(
            s => s.value === 'in_progress' || s.value === 'completed',
          );
        case 'completed':
          // From Completed, can only stay completed (no backwards flow)
          return allStatuses.filter(s => s.value === 'completed');
        default:
          return allStatuses.filter(s => s.value === currentStatus);
      }
    },
    [task, currentUser],
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
      if (task.status === 'Completed') {
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

  // Handle status update
  const handleStatusUpdate = useCallback(
    async (newStatus: 'new' | 'assigned' | 'in_progress' | 'completed') => {
      if (!task || readonly) return;

      // Special handling for changing from 'new' to 'assigned'
      if (task.status === 'new' && newStatus === 'assigned') {
        // Check if user is creator
        const isCreator = currentUser && task.createdBy === currentUser.id;
        if (!isCreator) {
          Alert.alert(
            'Access Denied',
            'Only the task creator can assign new tasks.',
            [{ text: 'OK' }],
          );
          return;
        }

        // For now, we'll show an alert that assignment is needed
        // In a full implementation, this would open a user selection modal
        Alert.alert(
          'Task Assignment Required',
          'To mark this task as assigned, you need to assign it to a user. This will be implemented in the next update.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Assign Later',
              onPress: () => {
                // For now, just update the status
                setIsUpdatingStatus(true);
                dispatch(
                  updateTaskStatusOptimistic({
                    taskId: task.id,
                    status: newStatus,
                  }),
                );
                // TODO: Implement user assignment modal
                setIsUpdatingStatus(false);
              },
            },
          ],
        );
        return;
      }

      setIsUpdatingStatus(true);

      // Optimistic update for immediate UI feedback
      dispatch(
        updateTaskStatusOptimistic({ taskId: task.id, status: newStatus }),
      );

      try {
        await dispatch(
          updateTaskStatus({ taskId: task.id, status: newStatus }),
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
    [task, readonly, dispatch, currentUser],
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

  if (!task) {
    return (
      <View style={styles.container}>
        <Header title="Task Details" showNotificationIcon={false} />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading task details...</Text>
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
    user && (user.id === task.assignedTo || user.department === 'HR');

  return (
    <View style={styles.container}>
      <Header title="Task Details" showNotificationIcon={false} />

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
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
            <Text style={[styles.dueDateText, { color: dueDateStatus.color }]}>
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

          {/* Department */}
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Department</Text>
            <View style={styles.departmentBadge}>
              <Text style={styles.departmentText}>{task.department}</Text>
            </View>
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
                <ActivityIndicator size="small" color={theme.colors.primary} />
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
                  Only the assigned user or HR department can update the task
                  status.
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
      </ScrollView>
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
  },
  picker: {
    height: 50,
    color: theme.colors.text,
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
  // Missing picker styles
  pickerWrapper: {
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.xs,
  },
  picker: {
    height: 50,
    width: '100%',
    color: theme.colors.text,
    fontSize: theme.typography.fontSizes.md,
  },
});

export default TaskDetailsScreen;
