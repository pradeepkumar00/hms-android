import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  Dimensions,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import {
  useAppDispatch,
  useAppSelector,
  selectCurrentUser,
} from '../store';
import { logoutUser } from '../store/authSlice';
import { fetchInboxNotifications } from '../store/taskSlice';
import { theme } from '../constants/theme';
import { APP_CONFIG } from '../constants/app';
import { HOME_MENU_ITEMS } from '../constants/menuItems';
import { Header, MenuDrawer } from '../components';
import { RootStackParamList } from '../types';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const scale = (size: number) => (SCREEN_WIDTH / 375) * size;

interface HomeScreenProps {
  navigation: any;
}

const HomeScreen: React.FC<HomeScreenProps> = ({ navigation }) => {
  const dispatch = useAppDispatch();
  const user = useAppSelector(selectCurrentUser);
  const [menuVisible, setMenuVisible] = useState(false);

  useEffect(() => {
    if (user?.id) {
      dispatch(fetchInboxNotifications(user.id));
    }
  }, [dispatch, user?.id]);

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'good morning!';
    if (hour < 17) return 'good afternoon!';
    return 'good evening!';
  };

  const handleTilePress = (screen: keyof RootStackParamList) => {
    if (screen === 'AddPatient') {
      navigation.navigate('AddPatient', { bookingMode: 'appointment' });
      return;
    }
    navigation.navigate(screen);
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
            // AppNavigator automatically shows Login when isAuthenticated becomes false
          } catch (error) {
            console.error('❌ Logout error:', error);
          }
        },
      },
    ]);
  };

  return (
    <View style={styles.container}>
      <Header
        title={APP_CONFIG.name}
        showNotificationIcon={false}
        showMenuIcon
        onMenuPress={() => setMenuVisible(true)}
      />

      <MenuDrawer
        visible={menuVisible}
        onClose={() => setMenuVisible(false)}
        onLogout={handleLogout}
      />

      <ScrollView
        style={styles.scrollContainer}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Greeting */}
        <View style={styles.greetingSection}>
          <View style={styles.profileIcon}>
            <Icon name="person" size={24} color={theme.colors.primary} />
          </View>
          <View style={styles.greetingTextContainer}>
            <Text style={styles.greetingText}>
              Hi, <Text style={styles.userName}>{user?.name || ''}</Text>
            </Text>
            <Text style={styles.welcomeText}>welcome back, {getGreeting()}</Text>
          </View>
        </View>

        {/* Menu tiles */}
        <View style={styles.tilesGrid}>
          {HOME_MENU_ITEMS.map(item => (
            <TouchableOpacity
              key={item.key}
              style={styles.tile}
              activeOpacity={0.7}
              onPress={() => handleTilePress(item.screen)}
            >
              <View style={styles.tileIconWrapper}>
                <Icon name={item.icon} size={32} color={theme.colors.primary} />
              </View>
              <Text style={styles.tileLabel} numberOfLines={2}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
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
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingVertical: theme.spacing.sm,
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
  tilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  tile: {
    width: '48%',
    backgroundColor: theme.colors.surface,
    borderRadius: scale(12),
    paddingVertical: scale(24),
    paddingHorizontal: scale(12),
    marginBottom: scale(12),
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: scale(120),
    ...theme.shadows.md,
  },
  tileIconWrapper: {
    width: scale(56),
    height: scale(56),
    borderRadius: scale(28),
    backgroundColor: '#EEF1FE',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: theme.spacing.sm,
  },
  tileLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    textAlign: 'center',
  },
  badge: {
    position: 'absolute',
    right: -2,
    top: -2,
    backgroundColor: theme.colors.error,
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  badgeText: {
    color: theme.colors.surface,
    fontSize: 11,
    fontWeight: theme.typography.fontWeights.bold,
  },
});

export default HomeScreen;
