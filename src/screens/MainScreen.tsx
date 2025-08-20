import React, { useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
} from 'react-native';
import { useAppDispatch, useAppSelector, selectCurrentUser } from '../store';
import { logoutUser } from '../store/authSlice';
import { fetchInboxNotifications } from '../store/taskSlice';
import { theme } from '../constants/theme';
import { APP_CONFIG } from '../constants/app';
import { Header } from '../components';
import Icon from 'react-native-vector-icons/MaterialIcons';

interface MainScreenProps {
  navigation: any; // Will be properly typed when navigation is set up
}

const MainScreen: React.FC<MainScreenProps> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);

  // Load inbox notifications when the screen mounts to show correct badge count
  useEffect(() => {
    if (user?.id) {
      dispatch(fetchInboxNotifications(user.id));
    }
  }, [dispatch, user?.id]);

  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good Morning';
    if (hour < 17) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Format user info display
  const getUserDisplayInfo = () => {
    if (!user) return null;

    const departmentEmoji =
      {
        HR: '👥',
        Admin: '⚙️',
        Supervisor: '👨‍💼',
      }[user.department] || '🏢';

    const roleEmoji =
      {
        HR: '👤',
        Admin: '🔧',
        Supervisor: '👔',
      }[user.role] || '💼';

    return { departmentEmoji, roleEmoji };
  };

  const { departmentEmoji, roleEmoji } = getUserDisplayInfo() || {};

  const handleNotificationPress = () => {
    // Navigate to Inbox screen (Phase 3 - Complete!)
    navigation.navigate('Inbox');
  };

  const handleCreateTaskPress = () => {
    // Navigate to Create Task screen (Phase 4 - Complete!)
    navigation.navigate('CreateTask');
  };

  const handleAssignedTasksPress = () => {
    // Navigate to Assigned Tasks screen (Phase 3 - Complete!)
    navigation.navigate('AssignedTasks');
  };

  const handleNotificationSettingsPress = () => {
    navigation.navigate('NotificationSettings');
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
            // Navigate to login even if logout fails
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
        {/* Compact Greeting */}
        <View style={styles.greetingSection}>
          <Text style={styles.greetingText}>
            {getGreeting()}! Welcome back, {user?.name || 'User'} 👋
          </Text>
        </View>

        {/* Compact User Profile */}
        <View style={styles.userInfo}>
          <Text style={styles.userInfoTitle}>📋 Your Profile</Text>

          {/* Department and Role in one row */}
          <View style={styles.infoRowDouble}>
            <View style={styles.infoHalf}>
              <Text style={styles.infoIcon}>{departmentEmoji}</Text>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Department</Text>
                <Text style={styles.infoValue}>{user?.department}</Text>
              </View>
            </View>
            <View style={styles.infoHalf}>
              <Text style={styles.infoIcon}>{roleEmoji}</Text>
              <View style={styles.infoContent}>
                <Text style={styles.infoLabel}>Role</Text>
                <Text style={styles.infoValue}>{user?.role}</Text>
              </View>
            </View>
          </View>

          {/* Mobile number */}
          <View style={styles.infoRow}>
            <Text style={styles.infoIcon}>📱</Text>
            <View style={styles.infoContent}>
              <Text style={styles.infoLabel}>Mobile Number</Text>
              <Text style={styles.infoValue}>{user?.mobileNumber}</Text>
            </View>
          </View>
        </View>

        {/* Compact Action Buttons */}
        <View style={styles.actionButtonsSection}>
          <Text style={styles.actionSectionTitle}>Quick Actions</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleCreateTaskPress}
            activeOpacity={0.8}
          >
            <View style={styles.actionButtonContent}>
              <Icon name="add-task" size={20} color={theme.colors.primary} />
              <Text style={styles.actionButtonTitle}>Create New Task</Text>
              <Icon
                name="chevron-right"
                size={18}
                color={theme.colors.textSecondary}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleAssignedTasksPress}
            activeOpacity={0.8}
          >
            <View style={styles.actionButtonContent}>
              <Icon
                name="assignment"
                size={20}
                color={theme.colors.secondary}
              />
              <Text style={styles.actionButtonTitle}>My Assigned Tasks</Text>
              <Icon
                name="chevron-right"
                size={18}
                color={theme.colors.textSecondary}
              />
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleNotificationSettingsPress}
            activeOpacity={0.8}
          >
            <View style={styles.actionButtonContent}>
              <Icon
                name="notifications"
                size={20}
                color={theme.colors.primary}
              />
              <Text style={styles.actionButtonTitle}>
                Notification Settings
              </Text>
              <Icon
                name="chevron-right"
                size={18}
                color={theme.colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
        </View>

        {/* Compact Phase Indicator */}
        <View style={styles.phaseIndicator}>
          <Text style={styles.phaseText}>
            Phase 3 Complete ✅ | Task Management Ready 🎯
          </Text>
        </View>
      </ScrollView>

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
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  greetingText: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    textAlign: 'center',
  },
  userInfo: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.lg,
    marginBottom: theme.spacing.md,
    ...theme.shadows.md,
  },
  userInfoTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.md,
    textAlign: 'center',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
  },
  infoRowDouble: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
  },
  infoHalf: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.xs,
  },
  infoIcon: {
    fontSize: theme.typography.fontSizes.xl,
    marginRight: theme.spacing.md,
    width: 32,
    textAlign: 'center',
  },
  infoContent: {
    flex: 1,
  },
  infoLabel: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  infoValue: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  phaseIndicator: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.success,
    marginBottom: theme.spacing.sm,
  },
  phaseText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.success,
    textAlign: 'center',
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
  actionButtonsSection: {
    marginBottom: theme.spacing.md,
  },
  actionSectionTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  actionButton: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  actionButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: theme.spacing.md,
  },
  actionButtonTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginLeft: theme.spacing.sm,
  },
});

export default MainScreen;
