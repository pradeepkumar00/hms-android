import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  useAppDispatch,
  useAppSelector,
  selectCurrentUser,
  selectAuthToken,
} from '../store';
import { theme } from '../constants/theme';
import { Header } from '../components';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Task } from '../types';
import {
  formatDateDDMMYYYY,
  formatDetailedRelativeTime,
} from '../utils/helpers';

interface TaskListScreenProps {
  navigation: any;
  route: {
    params: {
      status?:
        | 'today'
        | 'new'
        | 'assigned'
        | 'progress'
        | 'completed'
        | 'withdraw';
      type?: 'created' | 'assigned'; // 'created' for /api/task/created, 'assigned' for /api/task/assigned
      title: string; // Title to display in header
    };
  };
}

const TaskListScreen: React.FC<TaskListScreenProps> = ({
  navigation,
  route,
}) => {
  const { status, type, title } = route.params;
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const token = useAppSelector(selectAuthToken);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch tasks based on status and type
  const fetchTasks = useCallback(async () => {
    if (!token) {
      setError('Authentication required');
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Import realAuthService dynamically
      const realAuthService = (await import('../services/realAuthService'))
        .default;

      let fetchedTasks: Task[] = [];

      if (type === 'created') {
        // Fetch from /api/task/created with optional status query
        fetchedTasks = await realAuthService.fetchCreatedTasks(token, status);
      } else if (type === 'assigned') {
        // Fetch from /api/task/assigned with optional status query
        if (status) {
          // Use new method with status parameter
          fetchedTasks = await realAuthService.fetchAssignedTasksWithStatus(
            token,
            status,
          );
        } else {
          // Fetch all assigned tasks (no status filter)
          fetchedTasks = await realAuthService.fetchAssignedTasks(token);
        }
      }

      // Transform API response to Task interface
      const transformedTasks = fetchedTasks.map((task: any) => ({
        id: task._id || task.id,
        _id: task._id,
        tenantId: task.tenantId,
        title: task.title,
        description: task.description,
        status: task.status,
        createdBy: task.createdBy,
        createdByName: task.createdByName,
        assignedTo: task.assignedTo,
        assignedToName: task.assignedToName,
        user: task.user || [],
        createdAt: task.createdAt,
        updatedAt: task.updatedAt,
        dueDate: task.dueDate,
        priority: task.priority || 'medium',
      }));

      setTasks(transformedTasks);
      console.log(
        `✅ Fetched ${transformedTasks.length} tasks for ${type} with status ${
          status || 'all'
        }`,
      );
    } catch (err) {
      console.error('Error fetching tasks:', err);
      setError(err instanceof Error ? err.message : 'Failed to fetch tasks');
    } finally {
      setIsLoading(false);
    }
  }, [token, status, type]);

  // Fetch tasks on mount and when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchTasks();
    }, [fetchTasks]),
  );

  // Handle refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await fetchTasks();
    setRefreshing(false);
  }, [fetchTasks]);

  // Filter tasks based on search query
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) return tasks;

    const query = searchQuery.toLowerCase();
    return tasks.filter(
      task =>
        task.title.toLowerCase().includes(query) ||
        task.description.toLowerCase().includes(query) ||
        task.createdByName?.toLowerCase().includes(query) ||
        task.assignedToName?.toLowerCase().includes(query),
    );
  }, [tasks, searchQuery]);

  // Get status color
  const getStatusColor = (taskStatus: string) => {
    switch (taskStatus) {
      case 'new':
        return '#2196F3';
      case 'assigned':
        return '#FF9800';
      case 'progress':
        return '#9C27B0';
      case 'completed':
        return '#4CAF50';
      case 'withdraw':
        return '#F44336';
      default:
        return theme.colors.textSecondary;
    }
  };

  // Get status label
  const getStatusLabel = (taskStatus: string) => {
    switch (taskStatus) {
      case 'new':
        return 'New';
      case 'assigned':
        return 'Assigned';
      case 'progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      case 'withdraw':
        return 'Withdrawn';
      default:
        return taskStatus;
    }
  };

  // Render task card
  const renderTaskCard = ({ item }: { item: Task }) => {
    const statusColor = getStatusColor(item.status);

    return (
      <TouchableOpacity
        style={styles.taskCard}
        onPress={() => navigation.navigate('TaskDetails', { taskId: item.id })}
        activeOpacity={0.7}
      >
        {/* Header with status indicator */}
        <View style={styles.taskCardHeader}>
          <View
            style={[styles.statusIndicator, { backgroundColor: statusColor }]}
          />
          <View style={styles.taskHeaderContent}>
            <Text style={styles.taskTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View
              style={[
                styles.statusBadge,
                { backgroundColor: statusColor + '20' },
              ]}
            >
              <Text style={[styles.statusText, { color: statusColor }]}>
                {getStatusLabel(item.status)}
              </Text>
            </View>
          </View>
        </View>

        {/* Description */}
        <Text style={styles.taskDescription} numberOfLines={2}>
          {item.description}
        </Text>

        {/* Task metadata */}
        <View style={styles.taskMetadata}>
          <View style={styles.metadataRow}>
            <Icon name="person" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.metadataText}>
              Created by: {item.createdByName || 'Unknown'}
            </Text>
          </View>

          {item.assignedToName && (
            <View style={styles.metadataRow}>
              <Icon
                name="assignment-ind"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.metadataText}>
                Assigned to: {item.assignedToName}
              </Text>
            </View>
          )}

          {/* Multiple assigned users */}
          {item.user && item.user.length > 1 && (
            <View style={styles.metadataRow}>
              <Icon name="group" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.metadataText}>
                {item.user.length} users assigned
              </Text>
            </View>
          )}

          {item.dueDate && (
            <View style={styles.metadataRow}>
              <Icon
                name="schedule"
                size={16}
                color={theme.colors.textSecondary}
              />
              <Text style={styles.metadataText}>
                Due: {formatDateDDMMYYYY(item.dueDate)}
              </Text>
            </View>
          )}
        </View>

        {/* Created time */}
        <Text style={styles.taskTime}>
          {formatDetailedRelativeTime(item.createdAt)}
        </Text>
      </TouchableOpacity>
    );
  };

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="assignment" size={64} color={theme.colors.disabled} />
      <Text style={styles.emptyStateTitle}>No Tasks Found</Text>
      <Text style={styles.emptyStateText}>
        {searchQuery.trim()
          ? `No tasks match "${searchQuery}"`
          : 'There are no tasks with this status yet.'}
      </Text>
    </View>
  );

  // Render error state
  if (error && !refreshing) {
    return (
      <View style={styles.container}>
        <Header
          title={title}
          showHomeIcon={true}
          onHomePress={() => navigation.navigate('Main')}
        />
        <View style={styles.errorContainer}>
          <Icon name="error" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title={title}
        showHomeIcon={true}
        onHomePress={() => navigation.navigate('Main')}
      />

      {/* Search Bar */}
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks..."
          placeholderTextColor={theme.colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      {/* Results count */}
      <View style={styles.resultsHeader}>
        <Text style={styles.resultsText}>
          {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
          {searchQuery.trim() && ` for "${searchQuery}"`}
        </Text>
      </View>

      {/* Task list */}
      <FlatList
        data={filteredTasks}
        renderItem={renderTaskCard}
        keyExtractor={item => item.id}
        contentContainerStyle={[
          styles.listContainer,
          filteredTasks.length === 0 && styles.emptyListContainer,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
      />

      {/* Loading overlay */}
      {isLoading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    margin: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  resultsHeader: {
    paddingHorizontal: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  resultsText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeights.medium,
  },
  listContainer: {
    padding: theme.spacing.md,
    paddingTop: 0,
  },
  emptyListContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  taskCardHeader: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
  },
  statusIndicator: {
    width: 4,
    borderRadius: theme.borderRadius.sm,
    marginRight: theme.spacing.sm,
  },
  taskHeaderContent: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  taskTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  statusText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  taskDescription: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.sm,
    lineHeight: 20,
  },
  taskMetadata: {
    marginBottom: theme.spacing.xs,
  },
  metadataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  metadataText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  taskTime: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
  },
  emptyStateTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.error,
    textAlign: 'center',
    marginVertical: theme.spacing.md,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default TaskListScreen;
