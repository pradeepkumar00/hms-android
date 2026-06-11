import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Keyboard,
  Alert,
  Modal,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  useAppDispatch,
  useAppSelector,
  selectCurrentUser,
  selectAssignedToMeTasks,
  selectTasksLoading,
  selectTasksError,
} from '../store';
import {
  fetchAssignedToMeTasks,
  clearTaskError,
  reassignTask,
  updateTaskStatusOptimistic,
  updateTaskStatusReal,
} from '../store/taskSlice';
import { theme } from '../constants/theme';
import { Header } from '../components';
import { Task } from '../types';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface HistoryScreenProps {
  navigation: any;
}

type SortOption = 'newest' | 'oldest' | 'status' | 'creator';
type FilterOption = 'all' | 'new' | 'assigned' | 'in-progress' | 'completed';

const HistoryScreen: React.FC<HistoryScreenProps> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const assignedToMeTasks = useAppSelector(selectAssignedToMeTasks);
  const isLoading = useAppSelector(selectTasksLoading);
  const error = useAppSelector(selectTasksError);

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showReassignModal, setShowReassignModal] = useState(false);
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  // Fetch tasks assigned to current user on screen load and when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        dispatch(fetchAssignedToMeTasks(user.id));
      }
    }, [dispatch, user?.id]),
  );

  useEffect(() => {
    if (error) {
      console.error('History tasks error:', error);
    }
  }, [error]);

  useEffect(() => {
    return () => {
      dispatch(clearTaskError());
    };
  }, [dispatch]);

  const onRefresh = useCallback(async () => {
    if (!user?.id) return;

    setRefreshing(true);
    try {
      await dispatch(fetchAssignedToMeTasks(user.id)).unwrap();
    } catch (error) {
      console.error('Failed to refresh tasks:', error);
    } finally {
      setRefreshing(false);
    }
  }, [dispatch, user?.id]);

  const filteredAndSortedTasks = useMemo(() => {
    // Filter tasks assigned to current user
    let filtered = assignedToMeTasks.filter(task => {
      const matchesSearch =
        task.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        task.description.toLowerCase().includes(searchQuery.toLowerCase());

      if (filterBy === 'all') return matchesSearch;
      // Map filterBy to actual status values
      const statusMap: Record<FilterOption, string> = {
        all: '',
        new: 'new',
        assigned: 'assigned',
        'in-progress': 'progress',
        completed: 'completed',
      };
      const targetStatus = statusMap[filterBy];
      return matchesSearch && task.status === targetStatus;
    });

    // Sort tasks
    filtered.sort((a, b) => {
      switch (sortBy) {
        case 'newest':
          return (
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
          );
        case 'oldest':
          return (
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          );
        case 'status':
          return a.status.localeCompare(b.status);
        case 'creator':
          const aCreator = a.createdByName || a.createdBy || 'Unknown';
          const bCreator = b.createdByName || b.createdBy || 'Unknown';
          return aCreator.localeCompare(bCreator);
        default:
          return 0;
      }
    });

    return filtered;
  }, [assignedToMeTasks, searchQuery, sortBy, filterBy]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'new':
        return theme.colors.textSecondary;
      case 'assigned':
        return theme.colors.primary;
      case 'progress':
        return theme.colors.warning;
      case 'completed':
        return theme.colors.success;
      default:
        return theme.colors.textSecondary;
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'new':
        return 'fiber-new';
      case 'assigned':
        return 'assignment-ind';
      case 'progress':
        return 'work';
      case 'completed':
        return 'check-circle';
      default:
        return 'help';
    }
  };

  const formatRelativeTime = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

    if (diffInDays === 0) return 'Today';
    if (diffInDays === 1) return 'Yesterday';
    if (diffInDays < 7) return `${diffInDays} days ago`;
    if (diffInDays < 30) return `${Math.floor(diffInDays / 7)} weeks ago`;
    return `${Math.floor(diffInDays / 30)} months ago`;
  };

  const handleTaskPress = useCallback(
    (task: Task) => {
      navigation.navigate('TaskDetails', {
        taskId: task.id,
        fromHistory: true,
      });
    },
    [navigation],
  );

  const handleReassignPress = useCallback((task: Task) => {
    setSelectedTask(task);
    setShowReassignModal(true);
  }, []);

  const handleStatusUpdate = (task: Task, newStatus: string) => {
    // Optimistic update
    dispatch(
      updateTaskStatusOptimistic({
        taskId: task.id,
        status: newStatus as 'new' | 'assigned' | 'progress' | 'completed',
      }),
    );
  };

  const handleReassign = (newAssigneeId: string | null) => {
    if (!selectedTask || !user?.id) return;

    dispatch(
      reassignTask({
        taskId: selectedTask.id,
        newAssigneeId,
        reassignedBy: user.id,
      }),
    );

    setShowReassignModal(false);
    setSelectedTask(null);
  };

  const renderTaskCard = useCallback(
    ({ item: task }: { item: Task }) => (
      <TouchableOpacity
        style={styles.taskCard}
        onPress={() => handleTaskPress(task)}
        activeOpacity={0.8}
      >
        <View style={styles.taskHeader}>
          <Text style={styles.taskTitle} numberOfLines={2}>
            {task.title}
          </Text>
          <View style={styles.taskActions}>
            <TouchableOpacity
              onPress={() => handleReassignPress(task)}
              style={styles.reassignButton}
            >
              <Icon name="swap-horiz" size={20} color={theme.colors.primary} />
            </TouchableOpacity>
          </View>
        </View>

        <Text style={styles.taskDescription} numberOfLines={3}>
          {task.description}
        </Text>

        <View style={styles.taskMeta}>
          <View style={styles.statusContainer}>
            <Icon
              name={getStatusIcon(task.status)}
              size={16}
              color={getStatusColor(task.status)}
            />
            <Text
              style={[
                styles.statusText,
                { color: getStatusColor(task.status) },
              ]}
            >
              {task.status.replace('_', ' ').toUpperCase()}
            </Text>
          </View>

          <Text style={styles.assigneeText}>
            {task.createdByName
              ? `Created by: ${task.createdByName}`
              : task.createdBy
              ? `Created by: User ${task.createdBy}`
              : 'Task'}
          </Text>
        </View>

        <View style={styles.taskFooter}>
          <Text style={styles.timeText}>
            Created {formatRelativeTime(task.createdAt)}
          </Text>
          {task.dueDate && (
            <Text style={styles.dueDateText}>
              Due: {new Date(task.dueDate).toLocaleDateString()}
            </Text>
          )}
        </View>
      </TouchableOpacity>
    ),
    [handleTaskPress, handleReassignPress],
  );

  const renderFilterModal = () => (
    <Modal
      visible={showFilters}
      transparent
      animationType="fade"
      onRequestClose={() => setShowFilters(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowFilters(false)}
      >
        <View style={styles.filterModal}>
          <Text style={styles.modalTitle}>Filter & Sort</Text>

          <Text style={styles.sectionTitle}>Sort By</Text>
          {(['newest', 'oldest', 'status', 'creator'] as SortOption[]).map(
            option => (
              <TouchableOpacity
                key={option}
                style={[
                  styles.filterOption,
                  sortBy === option && styles.selectedFilter,
                ]}
                onPress={() => setSortBy(option)}
              >
                <Text
                  style={[
                    styles.filterText,
                    sortBy === option && styles.selectedFilterText,
                  ]}
                >
                  {option.charAt(0).toUpperCase() + option.slice(1)}
                </Text>
              </TouchableOpacity>
            ),
          )}

          <Text style={styles.sectionTitle}>Filter By Status</Text>
          {(
            [
              'all',
              'new',
              'assigned',
              'in-progress',
              'completed',
            ] as FilterOption[]
          ).map(option => (
            <TouchableOpacity
              key={option}
              style={[
                styles.filterOption,
                filterBy === option && styles.selectedFilter,
              ]}
              onPress={() => setFilterBy(option)}
            >
              <Text
                style={[
                  styles.filterText,
                  filterBy === option && styles.selectedFilterText,
                ]}
              >
                {option === 'all'
                  ? 'All Tasks'
                  : option.charAt(0).toUpperCase() +
                    option.slice(1).replace('-', ' ')}
              </Text>
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => setShowFilters(false)}
          >
            <Text style={styles.closeButtonText}>Close</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderReassignModal = () => (
    <Modal
      visible={showReassignModal}
      transparent
      animationType="slide"
      onRequestClose={() => setShowReassignModal(false)}
    >
      <TouchableOpacity
        style={styles.modalOverlay}
        activeOpacity={1}
        onPress={() => setShowReassignModal(false)}
      >
        <View style={styles.reassignModal}>
          <Text style={styles.modalTitle}>Reassign Task</Text>

          {selectedTask && (
            <Text style={styles.taskNameText} numberOfLines={2}>
              {selectedTask.title}
            </Text>
          )}

          <TouchableOpacity
            style={styles.reassignOption}
            onPress={() => handleReassign(null)}
          >
            <Icon
              name="fiber-new"
              size={24}
              color={theme.colors.textSecondary}
            />
            <Text style={styles.reassignOptionText}>Mark as New</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reassignOption}
            onPress={() => handleReassign('1')} // HR User
          >
            <Icon name="person" size={24} color={theme.colors.primary} />
            <Text style={styles.reassignOptionText}>Assign to HR User</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reassignOption}
            onPress={() => handleReassign('2')} // Admin User
          >
            <Icon name="person" size={24} color={theme.colors.secondary} />
            <Text style={styles.reassignOptionText}>Assign to Admin User</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.reassignOption}
            onPress={() => handleReassign('3')} // Supervisor
          >
            <Icon name="person" size={24} color={theme.colors.warning} />
            <Text style={styles.reassignOptionText}>Assign to Supervisor</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelButton}
            onPress={() => setShowReassignModal(false)}
          >
            <Text style={styles.cancelButtonText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </Modal>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <Icon name="assignment" size={64} color={theme.colors.textSecondary} />
      <Text style={styles.emptyTitle}>No Tasks Assigned to You</Text>
      <Text style={styles.emptyDescription}>
        Tasks assigned to you will appear here. Pull down to refresh.
      </Text>
    </View>
  );

  const renderFooter = useCallback(() => {
    return <View style={styles.footerSpacing} />;
  }, []);

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search tasks..."
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={Keyboard.dismiss}
        />
      </View>

      <TouchableOpacity
        style={styles.filterButton}
        onPress={() => setShowFilters(true)}
      >
        <Icon name="filter-list" size={20} color={theme.colors.primary} />
      </TouchableOpacity>

      <View style={styles.statsContainer}>
        <Text style={styles.statsText}>
          {filteredAndSortedTasks.length} of {assignedToMeTasks.length} tasks
        </Text>
      </View>
    </View>
  );

  if (error && !refreshing) {
    return (
      <View style={styles.container}>
        <Header
          title="Tasks Assigned to Me"
          showHomeIcon={true}
          onHomePress={() => navigation.popToTop()}
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
        title="Tasks Assigned to Me"
        showHomeIcon={true}
        onHomePress={() => navigation.popToTop()}
      />

      {renderHeader()}

      <FlatList
        data={filteredAndSortedTasks}
        renderItem={renderTaskCard}
        keyExtractor={(item, index) => item.id || `task-${index}`}
        contentContainerStyle={[
          styles.listContainer,
          filteredAndSortedTasks.length === 0 && styles.emptyListContainer,
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={!isLoading ? renderEmptyState : null}
        ListFooterComponent={renderFooter}
      />

      {isLoading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}

      {renderFilterModal()}
      {renderReassignModal()}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  headerContainer: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  filterButton: {
    position: 'absolute',
    top: theme.spacing.md + theme.spacing.xs,
    right: theme.spacing.md,
    padding: theme.spacing.sm,
  },
  statsContainer: {
    alignItems: 'center',
  },
  statsText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  listContainer: {
    padding: theme.spacing.md,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  taskCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  taskTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  taskActions: {
    flexDirection: 'row',
  },
  reassignButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.background,
  },
  taskDescription: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.normal,
    marginBottom: theme.spacing.sm,
  },
  taskMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    marginLeft: theme.spacing.xs,
  },
  assigneeText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  timeText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  dueDateText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.warning,
    fontWeight: theme.typography.fontWeights.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.sm,
  },
  emptyDescription: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.normal,
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
    marginVertical: theme.spacing.lg,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  footerSpacing: {
    height: theme.spacing.xl,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  filterModal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    margin: theme.spacing.lg,
    maxHeight: '80%',
    minWidth: 300,
    maxWidth: '90%',
    alignSelf: 'center',
    ...theme.shadows.lg,
  },
  reassignModal: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.xl,
    margin: theme.spacing.lg,
    minWidth: 320,
    maxWidth: '90%',
    alignSelf: 'center',
    ...theme.shadows.lg,
  },
  modalTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  taskNameText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.lg,
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginTop: theme.spacing.lg,
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  filterOption: {
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  selectedFilter: {
    backgroundColor: theme.colors.primary,
  },
  filterText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  selectedFilterText: {
    color: theme.colors.surface,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  reassignOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  reassignOptionText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginLeft: theme.spacing.md,
  },
  closeButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.md,
  },
  closeButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    textAlign: 'center',
  },
  cancelButton: {
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.md,
  },
  cancelButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    textAlign: 'center',
  },
});

export default HistoryScreen;
