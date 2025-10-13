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
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  useAppDispatch,
  useAppSelector,
  selectCurrentUser,
  selectCreatedByMeTasks,
  selectTasksLoading,
  selectTasksError,
} from '../store';
import { fetchCreatedTasks, clearTaskError } from '../store/taskSlice';
import { theme } from '../constants/theme';
import { Header } from '../components';
import { Task } from '../types';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface AssignedTasksScreenProps {
  navigation: any;
}

type SortOption = 'newest' | 'oldest' | 'status' | 'department';
type FilterOption = 'all' | 'assigned' | 'in-progress' | 'completed';

const AssignedTasksScreen: React.FC<AssignedTasksScreenProps> = ({
  navigation,
}) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const createdTasks = useAppSelector(selectCreatedByMeTasks);
  const isLoading = useAppSelector(selectTasksLoading);
  const error = useAppSelector(selectTasksError);

  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortOption>('newest');
  const [filterBy, setFilterBy] = useState<FilterOption>('all');
  const [showFilters, setShowFilters] = useState(false);

  // Fetch created tasks on screen load and when screen comes into focus
  useEffect(() => {
    if (user?.id) {
      dispatch(fetchCreatedTasks({}));
    }
  }, [dispatch, user?.id]);

  // Refresh data when screen comes into focus (e.g., after creating a task)
  useFocusEffect(
    useCallback(() => {
      if (user?.id) {
        dispatch(fetchCreatedTasks({}));
      }
    }, [dispatch, user?.id]),
  );

  // Clear error when component unmounts
  useEffect(() => {
    return () => {
      if (error) {
        dispatch(clearTaskError());
      }
    };
  }, [dispatch, error]);

  // Handle refresh
  const onRefresh = useCallback(async () => {
    if (user?.id) {
      setRefreshing(true);
      try {
        await dispatch(fetchCreatedTasks({})).unwrap();
      } catch (error) {
        console.error('Refresh error:', error);
      } finally {
        setRefreshing(false);
      }
    }
  }, [dispatch, user?.id]);

  // Filter and sort tasks
  const filteredAndSortedTasks = useMemo(() => {
    let filtered = [...createdTasks];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        task =>
          task.title.toLowerCase().includes(query) ||
          task.description.toLowerCase().includes(query) ||
          (task.department?.toLowerCase() || '').includes(query),
      );
    }

    // Apply status filter
    if (filterBy !== 'all') {
      const statusMap: Record<FilterOption, string[]> = {
        all: [],
        assigned: ['Assigned'],
        'in-progress': ['In Progress'],
        completed: ['Completed'],
      };
      const allowedStatuses = statusMap[filterBy];
      if (allowedStatuses.length > 0) {
        filtered = filtered.filter(task =>
          allowedStatuses.includes(task.status),
        );
      }
    }

    // Apply sorting
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
        case 'department':
          return (a.department || '').localeCompare(b.department || '');
        default:
          return 0;
      }
    });

    return filtered;
  }, [createdTasks, searchQuery, sortBy, filterBy]);

  // Get task status statistics
  const taskStats = useMemo(() => {
    return createdTasks.reduce(
      (stats, task) => {
        stats.total += 1;
        switch (task.status) {
          case 'assigned':
            stats.assigned += 1;
            break;
          case 'progress':
            stats.inProgress += 1;
            break;
          case 'completed':
            stats.completed += 1;
            break;
        }
        return stats;
      },
      { total: 0, assigned: 0, inProgress: 0, completed: 0 },
    );
  }, [createdTasks]);

  // Handle task press - navigate to editable task details (assigned tasks can be updated)
  const handleTaskPress = useCallback(
    (task: Task) => {
      navigation.navigate('TaskDetails', {
        taskId: task.id,
        readonly: false, // Allow status updates for assigned tasks
      });
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

  // Format relative time
  // Import and use the enhanced time formatting utility
  const { formatDetailedRelativeTime } = require('../utils/helpers');

  // Render task item
  const renderTaskItem = useCallback(
    ({ item }: { item: Task }) => {
      const statusColor = getStatusColor(item.status);
      const statusIcon = getStatusIcon(item.status);

      return (
        <TouchableOpacity
          style={styles.taskItem}
          onPress={() => handleTaskPress(item)}
          activeOpacity={0.7}
        >
          <View style={styles.taskContent}>
            {/* Task Header */}
            <View style={styles.taskHeader}>
              <Text style={styles.taskTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: statusColor + '15' },
                ]}
              >
                <Icon name={statusIcon} size={14} color={statusColor} />
                <Text style={[styles.statusBadgeText, { color: statusColor }]}>
                  {item.status}
                </Text>
              </View>
            </View>

            {/* Task Description */}
            <Text style={styles.taskDescription} numberOfLines={2}>
              {item.description}
            </Text>

            {/* Task Footer */}
            <View style={styles.taskFooter}>
              <View style={styles.taskMeta}>
                <View style={styles.metaItem}>
                  <Icon
                    name="schedule"
                    size={14}
                    color={theme.colors.textSecondary}
                  />
                  <Text style={styles.metaText}>
                    {formatDetailedRelativeTime(
                      item.createdAt,
                      item.status,
                      item.dueDate,
                    )}
                  </Text>
                </View>
                {item.fileUrl && (
                  <View style={styles.metaItem}>
                    <Icon
                      name="attach-file"
                      size={14}
                      color={theme.colors.textSecondary}
                    />
                  </View>
                )}
              </View>
              <Icon
                name="chevron-right"
                size={20}
                color={theme.colors.textSecondary}
              />
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleTaskPress],
  );

  // Render filter chip
  const renderFilterChip = (
    label: string,
    value: FilterOption,
    count?: number,
  ) => (
    <TouchableOpacity
      key={value}
      style={[styles.filterChip, filterBy === value && styles.activeFilterChip]}
      onPress={() => {
        Keyboard.dismiss();
        setFilterBy(value);
      }}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.filterChipText,
          filterBy === value && styles.activeFilterChipText,
        ]}
      >
        {label} {count !== undefined && `(${count})`}
      </Text>
    </TouchableOpacity>
  );

  // Render sort option
  const renderSortOption = (label: string, value: SortOption) => (
    <TouchableOpacity
      key={value}
      style={[styles.sortOption, sortBy === value && styles.activeSortOption]}
      onPress={() => {
        Keyboard.dismiss();
        setSortBy(value);
      }}
      activeOpacity={0.7}
    >
      <Text
        style={[
          styles.sortOptionText,
          sortBy === value && styles.activeSortOptionText,
        ]}
      >
        {label}
      </Text>
      {sortBy === value && (
        <Icon name="check" size={16} color={theme.colors.primary} />
      )}
    </TouchableOpacity>
  );

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="assignment" size={64} color={theme.colors.textSecondary} />
      <Text style={styles.emptyStateTitle}>No Tasks Found</Text>
      <Text style={styles.emptyStateSubtitle}>
        {searchQuery.trim() || filterBy !== 'all'
          ? 'No tasks match your current filters.\nTry adjusting your search or filters.'
          : "You haven't created any tasks yet.\nUse the Create Task feature to get started."}
      </Text>
      {(searchQuery.trim() || filterBy !== 'all') && (
        <TouchableOpacity
          style={styles.clearFiltersButton}
          onPress={() => {
            setSearchQuery('');
            setFilterBy('all');
          }}
        >
          <Text style={styles.clearFiltersText}>Clear Filters</Text>
        </TouchableOpacity>
      )}
    </View>
  );

  // Optimize FlatList performance
  const keyExtractor = useCallback((item: Task) => item.id, []);
  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: 140, // Approximate item height
      offset: 140 * index,
      index,
    }),
    [],
  );

  return (
    <View style={styles.container}>
      <Header
        title="Task Created"
        showNotificationIcon={false}
        showHomeIcon={true}
        onHomePress={() => navigation.navigate('Main')}
      />

      <View style={styles.content}>
        {/* Description */}
        <View style={styles.descriptionContainer}>
          <Text style={styles.descriptionText}>
            Tasks that you have created
          </Text>
        </View>
        {/* Stats Cards */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Text style={styles.statNumber}>{taskStats.total}</Text>
            <Text style={styles.statLabel}>Total</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: theme.colors.warning }]}>
              {taskStats.assigned}
            </Text>
            <Text style={styles.statLabel}>Assigned</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: theme.colors.primary }]}>
              {taskStats.inProgress}
            </Text>
            <Text style={styles.statLabel}>In Progress</Text>
          </View>
          <View style={styles.statCard}>
            <Text style={[styles.statNumber, { color: theme.colors.success }]}>
              {taskStats.completed}
            </Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
        </View>

        {/* Search Bar */}
        {/* <View style={styles.searchContainer}>
          <Icon name="search" size={20} color={theme.colors.textSecondary} />
          <TextInput
            style={styles.searchInput}
            placeholder="Search tasks..."
            placeholderTextColor={theme.colors.textSecondary}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
          <TouchableOpacity
            style={styles.filterToggle}
            onPress={() => setShowFilters(!showFilters)}
            activeOpacity={0.7}
          >
            <Icon
              name={showFilters ? 'filter-list-off' : 'filter-list'}
              size={20}
              color={theme.colors.primary}
            />
          </TouchableOpacity>
        </View> */}

        {/* Filters */}
        {/* {showFilters && ( 
          // <View style={styles.filtersContainer}>
            {/* Status Filters */}
        {/* <Text style={styles.filterSectionTitle}>Status</Text>
            <View style={styles.filterChipsContainer}>
              {renderFilterChip('All', 'all', taskStats.total)}
              {renderFilterChip('Assigned', 'assigned', taskStats.assigned)}
              {renderFilterChip(
                'In Progress',
                'in-progress',
                taskStats.inProgress,
              )}
              {renderFilterChip('Completed', 'completed', taskStats.completed)}
            </View> */}

        {/* Sort Options */}
        {/* <Text style={styles.filterSectionTitle}>Sort By</Text>
            <View style={styles.sortOptionsContainer}>
              {renderSortOption('Newest First', 'newest')}
              {renderSortOption('Oldest First', 'oldest')}
            </View>
          </View> */}
        {/* )} */}

        {/* Results Summary */}
        <View style={styles.resultsHeader}>
          <Text style={styles.resultsText}>
            {filteredAndSortedTasks.length}{' '}
            {filteredAndSortedTasks.length === 1 ? 'task' : 'tasks'}
            {searchQuery.trim() && ` for "${searchQuery}"`}
          </Text>
        </View>

        {/* Tasks List */}
        <FlatList
          data={filteredAndSortedTasks}
          renderItem={renderTaskItem}
          keyExtractor={keyExtractor}
          getItemLayout={getItemLayout}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={
            isLoading ? (
              <View style={styles.loadingState}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.loadingText}>Loading your tasks...</Text>
              </View>
            ) : (
              renderEmptyState
            )
          }
          contentContainerStyle={[
            styles.listContainer,
            filteredAndSortedTasks.length === 0 && styles.emptyListContainer,
          ]}
          // Performance optimizations
          initialNumToRender={10}
          maxToRenderPerBatch={5}
          windowSize={10}
          removeClippedSubviews={true}
          updateCellsBatchingPeriod={100}
        />
      </View>
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
  statsContainer: {
    flexDirection: 'row',
    marginBottom: theme.spacing.md,
  },
  statCard: {
    flex: 1,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginHorizontal: theme.spacing.xs,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  statNumber: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  statLabel: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  searchInput: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  filterToggle: {
    padding: theme.spacing.xs,
  },
  filtersContainer: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  filterSectionTitle: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  filterChipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.md,
  },
  filterChip: {
    backgroundColor: theme.colors.background,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    marginRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  activeFilterChip: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
  },
  activeFilterChipText: {
    color: theme.colors.surface,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  sortOptionsContainer: {
    gap: theme.spacing.xs,
  },
  sortOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
  },
  activeSortOption: {
    backgroundColor: theme.colors.primary + '15',
  },
  sortOptionText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
  },
  activeSortOptionText: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  resultsHeader: {
    marginBottom: theme.spacing.sm,
  },
  resultsText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  listContainer: {
    paddingVertical: theme.spacing.sm,
  },
  emptyListContainer: {
    flex: 1,
  },
  taskItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  taskContent: {
    padding: theme.spacing.md,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.sm,
  },
  taskTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
    lineHeight: 20, // Fixed line height to prevent truncation
    includeFontPadding: false, // Android specific fix
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.md,
  },
  statusBadgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
    marginLeft: theme.spacing.xs,
  },
  taskDescription: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.md,
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  metaText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.xs,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  emptyStateTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyStateSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.md,
  },
  clearFiltersButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  clearFiltersText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  loadingState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xl,
  },
  loadingText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.sm,
  },
  descriptionContainer: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.background,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  descriptionText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontStyle: 'italic',
  },
});

export default AssignedTasksScreen;
