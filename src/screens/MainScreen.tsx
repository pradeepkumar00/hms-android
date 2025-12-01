import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  ActivityIndicator,
  Image,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import {
  useAppDispatch,
  useAppSelector,
  selectCurrentUser,
  selectAuthToken,
} from '../store';
import { logoutUser } from '../store/authSlice';
import { fetchInboxNotifications } from '../store/taskSlice';
import { theme } from '../constants/theme';
import { APP_CONFIG } from '../constants/app';
import { Header } from '../components';
import Icon from 'react-native-vector-icons/MaterialIcons';

// Get screen dimensions
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Responsive scaling function based on standard width (375 - iPhone SE/small Android)
const scale = (size: number) => (SCREEN_WIDTH / 375) * size;

// Moderate scale for font sizes - less aggressive scaling
const moderateScale = (size: number, factor = 0.5) => {
  return size + (scale(size) - size) * factor;
};

// Import custom icons
const AssignedIcon = require('../../assets/images/Assigned.png');
const InProgressIcon = require('../../assets/images/InProgress.png');
const CompletedIcon = require('../../assets/images/Completed.png');
const WithdrawIcon = require('../../assets/images/Withdraw.png');
const DoubleArrowIcon = require('../../assets/images/DoubleArrow.png');
const TodayIcon = require('../../assets/images/Today.png');
const DefaultIcon = require('../../assets/images/Default.png');

interface MainScreenProps {
  navigation: any;
}

interface TaskCounts {
  today: number;
  new: number;
  assigned: number;
  progress: number;
  completed: number;
  withdraw: number;
  allAssigned: number;
  allCreated: number;
}

const MainScreen: React.FC<MainScreenProps> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const token = useAppSelector(selectAuthToken);
  const [taskCounts, setTaskCounts] = useState<TaskCounts>({
    today: 0,
    new: 0,
    assigned: 0,
    progress: 0,
    completed: 0,
    withdraw: 0,
    allAssigned: 0,
    allCreated: 0,
  });
  const [isLoading, setIsLoading] = useState(false);

  // Load inbox notifications when the screen mounts
  useEffect(() => {
    if (user?.id) {
      dispatch(fetchInboxNotifications(user.id));
    }
  }, [dispatch, user?.id]);

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'good morning!';
    if (hour < 17) return 'good afternoon!';
    return 'good evening!';
  };

  // Fetch task counts from API
  const fetchTaskCounts = useCallback(async () => {
    if (!token) return;

    setIsLoading(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;

      // Fetch all task counts in parallel - using /api/task/assigned?status={status}
      const [
        todayTasks,
        newTasks,
        assignedTasks,
        progressTasks,
        completedTasks,
        withdrawTasks,
        allAssignedTasks,
        allCreatedTasks,
      ] = await Promise.all([
        realAuthService
          .fetchAssignedTasksWithStatus(token, 'today')
          .catch(() => []),
        realAuthService
          .fetchAssignedTasksWithStatus(token, 'new')
          .catch(() => []),
        realAuthService
          .fetchAssignedTasksWithStatus(token, 'assigned')
          .catch(() => []),
        realAuthService
          .fetchAssignedTasksWithStatus(token, 'progress')
          .catch(() => []),
        realAuthService
          .fetchAssignedTasksWithStatus(token, 'completed')
          .catch(() => []),
        realAuthService
          .fetchAssignedTasksWithStatus(token, 'withdraw')
          .catch(() => []),
        realAuthService.fetchAssignedTasks(token).catch(() => []),
        realAuthService.fetchCreatedTasks(token).catch(() => []),
      ]);

      setTaskCounts({
        today: todayTasks.length,
        new: newTasks.length,
        assigned: assignedTasks.length,
        progress: progressTasks.length,
        completed: completedTasks.length,
        withdraw: withdrawTasks.length,
        allAssigned: allAssignedTasks.length,
        allCreated: allCreatedTasks.length,
      });
    } catch (error) {
      console.error('Failed to fetch task counts:', error);
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  // Fetch task counts when screen comes into focus
  useFocusEffect(
    useCallback(() => {
      fetchTaskCounts();
    }, [fetchTaskCounts]),
  );

  const handleNotificationPress = () => {
    navigation.navigate('Inbox');
  };

  const handleCreateTaskPress = () => {
    navigation.navigate('CreateTask');
  };

  const handleStatusCardPress = (
    status?:
      | 'today'
      | 'new'
      | 'assigned'
      | 'progress'
      | 'completed'
      | 'withdraw',
    type?: 'created' | 'assigned',
    title?: string,
  ) => {
    navigation.navigate('TaskList', { status, type, title });
  };

  const handleLogout = () => {
    Alert.alert('Logout', 'Are you sure you want to logout?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Logout',
        style: 'destructive',
        onPress: async () => {
          try {
            await dispatch(logoutUser()).unwrap();
            navigation.replace('Login');
          } catch (error) {
            console.error('Logout error:', error);
            navigation.replace('Login');
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Header
        title={APP_CONFIG.name}
        onNotificationPress={handleNotificationPress}
      />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* User Greeting Section */}
        <View style={styles.greetingSection}>
          <View style={styles.greetingLeft}>
            <View style={styles.profileIcon}>
              <Icon name="person" size={24} color={theme.colors.primary} />
            </View>
            <View style={styles.greetingTextContainer}>
              <Text style={styles.greetingText}>
                Hi, <Text style={styles.userName}>{user?.name || ''}</Text>
              </Text>
              <Text style={styles.welcomeText}>
                welcome back, {getGreeting()}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            style={styles.newTaskButton}
            onPress={handleCreateTaskPress}
            activeOpacity={0.7}
          >
            <Text style={styles.newTaskButtonText}>+ New task</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Loading tasks...</Text>
          </View>
        ) : (
          <>
            {/* Status Cards - 6 cards in 2x3 grid */}
            <View style={styles.statusCardsGrid}>
              {/* Row 1: Today's and New */}
              <TouchableOpacity
                style={styles.statusCard}
                onPress={() =>
                  handleStatusCardPress('today', 'assigned', "Today's Tasks")
                }
                activeOpacity={0.7}
              >
                <View style={styles.statusCardContent}>
                  <View style={styles.statusCardHeader}>
                    <View style={styles.statusIcon}>
                      <Image source={TodayIcon} style={styles.iconImage} />
                    </View>
                    <Text style={[styles.statusLabel, { color: '#F44336' }]}>
                      Today's
                    </Text>
                  </View>
                  <Image source={DoubleArrowIcon} style={styles.arrowIcon} />
                </View>
                <View style={styles.dividerLine} />
                <Text style={styles.statusCount}>{taskCounts.today}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statusCard}
                onPress={() =>
                  handleStatusCardPress('new', 'assigned', 'New Tasks')
                }
                activeOpacity={0.7}
              >
                <View style={styles.statusCardContent}>
                  <View style={styles.statusCardHeader}>
                    <View style={styles.statusIcon}>
                      <Image source={DefaultIcon} style={styles.iconImage} />
                    </View>
                    <Text style={[styles.statusLabel, { color: '#424242' }]}>
                      New
                    </Text>
                  </View>
                  <Image source={DoubleArrowIcon} style={styles.arrowIcon} />
                </View>
                <View style={styles.dividerLine} />
                <Text style={styles.statusCount}>{taskCounts.new}</Text>
              </TouchableOpacity>

              {/* Row 2: Assigned and In-progress */}
              <TouchableOpacity
                style={styles.statusCard}
                onPress={() =>
                  handleStatusCardPress(
                    'assigned',
                    'assigned',
                    'Assigned Tasks',
                  )
                }
                activeOpacity={0.7}
              >
                <View style={styles.statusCardContent}>
                  <View style={styles.statusCardHeader}>
                    <View style={styles.statusIcon}>
                      <Image source={AssignedIcon} style={styles.iconImage} />
                    </View>
                    <Text style={[styles.statusLabel, { color: '#F57C00' }]}>
                      Assigned
                    </Text>
                  </View>
                  <Image source={DoubleArrowIcon} style={styles.arrowIcon} />
                </View>
                <View style={styles.dividerLine} />
                <Text style={styles.statusCount}>{taskCounts.assigned}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statusCard}
                onPress={() =>
                  handleStatusCardPress(
                    'progress',
                    'assigned',
                    'In-Progress Tasks',
                  )
                }
                activeOpacity={0.7}
              >
                <View style={styles.statusCardContent}>
                  <View style={styles.statusCardHeader}>
                    <View style={styles.statusIcon}>
                      <Image source={InProgressIcon} style={styles.iconImage} />
                    </View>
                    <Text style={[styles.statusLabel, { color: '#66BB6A' }]}>
                      In-progress
                    </Text>
                  </View>
                  <Image source={DoubleArrowIcon} style={styles.arrowIcon} />
                </View>
                <View style={styles.dividerLine} />
                <Text style={styles.statusCount}>{taskCounts.progress}</Text>
              </TouchableOpacity>

              {/* Row 3: Completed and With-draw */}
              <TouchableOpacity
                style={styles.statusCard}
                onPress={() =>
                  handleStatusCardPress(
                    'completed',
                    'assigned',
                    'Completed Tasks',
                  )
                }
                activeOpacity={0.7}
              >
                <View style={styles.statusCardContent}>
                  <View style={styles.statusCardHeader}>
                    <View style={styles.statusIcon}>
                      <Image source={CompletedIcon} style={styles.iconImage} />
                    </View>
                    <Text style={[styles.statusLabel, { color: '#4CAF50' }]}>
                      Completed
                    </Text>
                  </View>
                  <Image source={DoubleArrowIcon} style={styles.arrowIcon} />
                </View>
                <View style={styles.dividerLine} />
                <Text style={styles.statusCount}>{taskCounts.completed}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.statusCard}
                onPress={() =>
                  handleStatusCardPress(
                    'withdraw',
                    'assigned',
                    'Withdrawn Tasks',
                  )
                }
                activeOpacity={0.7}
              >
                <View style={styles.statusCardContent}>
                  <View style={styles.statusCardHeader}>
                    <View style={styles.statusIcon}>
                      <Image source={WithdrawIcon} style={styles.iconImage} />
                    </View>
                    <Text style={[styles.statusLabel, { color: '#F44336' }]}>
                      Withdraw
                    </Text>
                  </View>
                  <Image source={DoubleArrowIcon} style={styles.arrowIcon} />
                </View>
                <View style={styles.dividerLine} />
                <Text style={styles.statusCount}>{taskCounts.withdraw}</Text>
              </TouchableOpacity>
            </View>

            {/* All Cards - 2 full-width cards */}
            <View style={styles.allCardsContainer}>
              <TouchableOpacity
                style={styles.allCard}
                onPress={() =>
                  handleStatusCardPress(
                    undefined,
                    'assigned',
                    'All Assigned Tasks',
                  )
                }
                activeOpacity={0.7}
              >
                <View style={styles.allCardContent}>
                  <View style={styles.allCardLeft}>
                    <View style={styles.radioIcon}>
                      <View style={styles.radioInner} />
                    </View>
                    <Text style={styles.allCardLabel}>ALL Assigned</Text>
                  </View>
                  <Image source={DoubleArrowIcon} style={styles.arrowIcon} />
                </View>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.allCard}
                onPress={() =>
                  handleStatusCardPress(
                    undefined,
                    'created',
                    'All Created Tasks',
                  )
                }
                activeOpacity={0.7}
              >
                <View style={styles.allCardContent}>
                  <View style={styles.allCardLeft}>
                    <View style={styles.radioIcon}>
                      <View style={styles.radioInner} />
                    </View>
                    <Text style={styles.allCardLabel}>ALL Created</Text>
                  </View>
                  <Image source={DoubleArrowIcon} style={styles.arrowIcon} />
                </View>
              </TouchableOpacity>
            </View>
          </>
        )}
      </ScrollView>

      {/* Logout Button */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
          <Text style={styles.logoutButtonText}>Logout</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContainer: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  scrollContent: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.lg,
  },
  greetingSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
  },
  greetingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  profileIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E3F2FD',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  greetingTextContainer: {
    flex: 1,
  },
  greetingText: {
    fontSize: theme.typography.fontSizes.xl,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeights.normal,
  },
  userName: {
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  welcomeText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  newTaskButton: {
    backgroundColor: theme.colors.surface,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    ...theme.shadows.sm,
  },
  newTaskButtonText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl * 2,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  statusCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    marginBottom: scale(12),
  },
  statusCard: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: scale(12),
    padding: scale(12),
    marginBottom: scale(12),
    ...theme.shadows.md,
    minHeight: scale(100),
  },
  statusCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: scale(8),
  },
  statusCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  statusIcon: {
    width: scale(24),
    height: scale(24),
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: scale(8),
  },
  statusLabel: {
    fontSize: moderateScale(16),
    fontWeight: theme.typography.fontWeights.medium,
    flex: 1,
  },
  dividerLine: {
    height: 1,
    backgroundColor: '#E0E0E0',
    marginVertical: scale(2),
  },
  statusCount: {
    fontSize: moderateScale(32),
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    textAlign: 'center',
    marginTop: scale(4),
  },
  allCardsContainer: {
    marginTop: theme.spacing.sm,
  },
  allCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  allCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  allCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  radioIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#E0E0E0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: theme.spacing.md,
  },
  radioInner: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#E0E0E0',
  },
  allCardLabel: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  iconImage: {
    width: scale(18),
    height: scale(18),
    resizeMode: 'contain',
  },
  arrowIcon: {
    width: scale(16),
    height: scale(16),
    resizeMode: 'contain',
    // tintColor: '#B0B0B0',
  },
  footer: {
    backgroundColor: theme.colors.background,
    padding: theme.spacing.lg,
    paddingTop: theme.spacing.md,
  },
  logoutButton: {
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
    alignItems: 'center',
    ...theme.shadows.sm,
  },
  logoutButtonText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
});

export default MainScreen;
