import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Vibration,
} from 'react-native';
import {
  useAppDispatch,
  useAppSelector,
  selectCurrentUser,
  selectInboxNotifications,
  selectTasksLoading,
  selectTasksError,
  selectUnreadNotifications,
  selectNotificationSoundId,
} from '../store';
import {
  fetchInboxNotifications,
  clearTaskError,
} from '../store/taskSlice';
import { theme } from '../constants/theme';
import { Header } from '../components';
import { APP_CONFIG, STORAGE_KEYS } from '../constants/app';
import { Notification } from '../types';
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ringtoneService } from '../services/ringtoneService';

interface InboxScreenProps {
  navigation: any;
}

const InboxScreen: React.FC<InboxScreenProps> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const notifications = useAppSelector(selectInboxNotifications);
  const unreadNotifications = useAppSelector(selectUnreadNotifications);
  const isLoading = useAppSelector(selectTasksLoading);
  const error = useAppSelector(selectTasksError);
  const selectedSoundId = useAppSelector(selectNotificationSoundId);

  const [refreshing, setRefreshing] = useState(false);
  const previousNotificationCountRef = useRef<number>(0);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);

  // NOTE: Removed HR permission check - all users can view notifications
  // Notifications are read-only (non-clickable) for all users

  // Load vibration settings
  useEffect(() => {
    const loadVibrationSettings = async () => {
      try {
        const storedVibration = await AsyncStorage.getItem(
          STORAGE_KEYS.VIBRATION_ENABLED,
        );
        if (storedVibration !== null) {
          setVibrationEnabled(JSON.parse(storedVibration));
        }
      } catch (error) {
        console.error('Error loading vibration settings:', error);
      }
    };

    loadVibrationSettings();
  }, []);

  // Fetch notifications on screen load
  useEffect(() => {
    if (user?.id) {
      dispatch(fetchInboxNotifications(user.id));
    }
  }, [dispatch, user?.id]);

  // Refresh notifications when screen comes into focus (to catch background notifications)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      if (user?.id) {
        console.log('📱 InboxScreen focused - refreshing notifications');
        dispatch(fetchInboxNotifications(user.id));
      }
    });

    return unsubscribe;
  }, [navigation, dispatch, user?.id]);

  // Detect new notifications and play sound
  useEffect(() => {
    const currentCount = notifications.length;
    const previousCount = previousNotificationCountRef.current;

    // If we have new notifications (more than before and not initial load)
    if (currentCount > previousCount && previousCount > 0) {
      playNotificationSound();
    }

    // Update the ref with current count
    previousNotificationCountRef.current = currentCount;
  }, [notifications.length]);

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
        await dispatch(fetchInboxNotifications(user.id)).unwrap();
      } catch (error) {
        console.error('Refresh error:', error);
      } finally {
        setRefreshing(false);
      }
    }
  }, [dispatch, user?.id]);

  // Play notification sound when new notifications arrive
  const playNotificationSound = useCallback(async () => {
    try {
      console.log('Playing notification sound for new notification');

      // Trigger vibration if enabled
      if (vibrationEnabled && Platform.OS === 'android') {
        Vibration.vibrate(500); // 500ms vibration
      }

      // Play the selected notification sound
      if (selectedSoundId) {
        await ringtoneService.playNotificationSound(selectedSoundId);
      } else {
        // Play default system notification sound if no custom sound selected
        await ringtoneService.playDefaultNotificationSound();
      }
    } catch (error) {
      console.error('Error playing notification sound:', error);
    }
  }, [selectedSoundId, vibrationEnabled]);

  // Format notification time
  const formatNotificationTime = (createdAt: string) => {
    const now = new Date();
    const notificationTime = new Date(createdAt);
    const diffInHours = Math.floor(
      (now.getTime() - notificationTime.getTime()) / (1000 * 60 * 60),
    );

    if (diffInHours < 1) {
      const diffInMinutes = Math.floor(
        (now.getTime() - notificationTime.getTime()) / (1000 * 60),
      );
      return diffInMinutes < 1 ? 'Just now' : `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      const diffInDays = Math.floor(diffInHours / 24);
      return `${diffInDays}d ago`;
    }
  };

  // Render notification item (read-only, non-clickable)
  const renderNotificationItem = useCallback(
    ({ item }: { item: Notification }) => {
      const isUnread = !item.readStatus;

      return (
        <View
          style={[
            styles.notificationItem,
            isUnread && styles.unreadNotification,
          ]}
        >
          <View style={styles.notificationContent}>
            <View style={styles.notificationHeader}>
              <View style={styles.notificationIndicator}>
                {isUnread && <View style={styles.unreadDot} />}
                <Icon
                  name="task-alt"
                  size={20}
                  color={
                    isUnread ? theme.colors.primary : theme.colors.textSecondary
                  }
                />
              </View>
              <Text style={styles.notificationTime}>
                {formatNotificationTime(item.createdAt)}
              </Text>
            </View>

            <Text
              style={[
                styles.notificationMessage,
                isUnread && styles.unreadMessage,
              ]}
              numberOfLines={2}
            >
              {item.taskTitle ? `Task: ${item.taskTitle}` : item.message}
            </Text>

            {/* Assignment details */}
            {item.assignedToName && item.createdByName && (
              <View style={styles.assignmentDetails}>
                <Text style={styles.assignmentText}>
                  <Text style={styles.assignmentLabel}>Assigned to: </Text>
                  <Text style={styles.assignmentValue}>
                    {item.assignedToName}
                  </Text>
                </Text>
                <Text style={styles.assignmentText}>
                  <Text style={styles.assignmentLabel}>By: </Text>
                  <Text style={styles.assignmentValue}>
                    {item.createdByName}
                  </Text>
                </Text>
                {item.department && (
                  <Text style={styles.assignmentText}>
                    <Text style={styles.assignmentLabel}>Department: </Text>
                    <Text style={styles.assignmentValue}>
                      {item.department}
                    </Text>
                  </Text>
                )}
              </View>
            )}

            {/* Status badge if available */}
            {item.status && (
              <View style={styles.statusBadgeContainer}>
                <View
                  style={[
                    styles.statusBadge,
                    item.status === 'completed' && styles.statusCompleted,
                    item.status === 'progress' && styles.statusProgress,
                    item.status === 'assigned' && styles.statusAssigned,
                  ]}
                >
                  <Text style={styles.statusText}>
                    {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </View>
      );
    },
    [],
  );

  // Render empty state
  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="inbox" size={64} color={theme.colors.textSecondary} />
      <Text style={styles.emptyStateTitle}>No Notifications</Text>
      <Text style={styles.emptyStateSubtitle}>
        You don't have any notifications yet.{'\n'}
        New task assignments will appear here.
      </Text>
    </View>
  );

  // Render error state
  const renderErrorState = () => (
    <View style={styles.errorState}>
      <Icon name="error-outline" size={48} color={theme.colors.error} />
      <Text style={styles.errorTitle}>Failed to Load Notifications</Text>
      <Text style={styles.errorSubtitle}>{error}</Text>
      <TouchableOpacity style={styles.retryButton} onPress={onRefresh}>
        <Text style={styles.retryButtonText}>Retry</Text>
      </TouchableOpacity>
    </View>
  );

  // Optimize FlatList performance
  const keyExtractor = useCallback((item: Notification) => item.id, []);
  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: 120, // Approximate item height
      offset: 120 * index,
      index,
    }),
    [],
  );

  return (
    <View style={styles.container}>
      <Header
        title="Inbox"
        showNotificationIcon={false}
        showHomeIcon={true}
        onHomePress={() => navigation.navigate('Main')}
      />

      <View style={styles.content}>
        {/* Header Info */}
        <View style={styles.inboxHeader}>
          <Text style={styles.inboxTitle}>Notifications</Text>
          {unreadNotifications.length > 0 && (
            <View style={styles.unreadBadge}>
              <Text style={styles.unreadBadgeText}>
                {unreadNotifications.length} new
              </Text>
            </View>
          )}
        </View>

        {/* Notifications List */}
        {error ? (
          renderErrorState()
        ) : (
          <FlatList
            data={notifications}
            renderItem={renderNotificationItem}
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
                  <ActivityIndicator
                    size="large"
                    color={theme.colors.primary}
                  />
                  <Text style={styles.loadingText}>
                    Loading notifications...
                  </Text>
                </View>
              ) : (
                renderEmptyState
              )
            }
            contentContainerStyle={[
              styles.listContainer,
              notifications.length === 0 && styles.emptyListContainer,
            ]}
            // Performance optimizations
            initialNumToRender={10}
            maxToRenderPerBatch={5}
            windowSize={10}
            removeClippedSubviews={true}
            updateCellsBatchingPeriod={100}
          />
        )}
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
  inboxHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
    paddingHorizontal: theme.spacing.sm,
  },
  inboxTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  unreadBadge: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.lg,
  },
  unreadBadgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  legendNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.primary + '10',
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
  },
  legendText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.primary,
    marginLeft: theme.spacing.sm,
    fontWeight: theme.typography.fontWeights.medium,
  },
  restrictionNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.warning + '15',
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.md,
  },
  restrictionText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.warning,
    marginLeft: theme.spacing.sm,
  },
  listContainer: {
    paddingVertical: theme.spacing.sm,
  },
  emptyListContainer: {
    flex: 1,
  },
  notificationItem: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  unreadNotification: {
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.primary,
  },
  disabledNotification: {
    opacity: 0.7,
  },
  notificationContent: {
    padding: theme.spacing.md,
  },
  notificationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  notificationIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    marginRight: theme.spacing.sm,
  },
  notificationTime: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.textSecondary,
  },
  notificationMessage: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    lineHeight: theme.typography.lineHeights.relaxed,
    marginBottom: theme.spacing.sm,
  },
  unreadMessage: {
    fontWeight: theme.typography.fontWeights.medium,
  },
  notificationFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tapToViewText: {
    fontSize: theme.typography.fontSizes.xs,
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.medium,
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
  errorState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.xl,
  },
  errorTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.error,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  errorSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.md,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  // Assignment details styles
  assignmentDetails: {
    marginTop: theme.spacing.sm,
    paddingTop: theme.spacing.xs,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border + '30',
  },
  assignmentText: {
    fontSize: theme.typography.fontSizes.xs,
    lineHeight: 16,
    marginBottom: 2,
  },
  assignmentLabel: {
    color: theme.colors.textSecondary,
    fontWeight: theme.typography.fontWeights.medium,
  },
  assignmentValue: {
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeights.normal,
  },
  // Status badge styles
  statusBadgeContainer: {
    marginTop: theme.spacing.sm,
    flexDirection: 'row',
  },
  statusBadge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.textSecondary + '20',
  },
  statusCompleted: {
    backgroundColor: '#10B981' + '20',
  },
  statusProgress: {
    backgroundColor: '#F59E0B' + '20',
  },
  statusAssigned: {
    backgroundColor: theme.colors.primary + '20',
  },
  statusText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
  },
});

export default InboxScreen;
