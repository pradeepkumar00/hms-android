import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  StatusBar,
  Platform,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useAppSelector, selectNotificationCount } from '../store';
import { theme } from '../constants/theme';
import { APP_CONFIG } from '../constants/app';

const AppLogo = require('../../assets/images/app-logo.jpeg');

interface HeaderProps {
  title?: string;
  onNotificationPress?: () => void;
  showNotificationIcon?: boolean;
  showHomeIcon?: boolean;
  onHomePress?: () => void;
}

const Header: React.FC<HeaderProps> = ({
  title = APP_CONFIG.name,
  onNotificationPress,
  showNotificationIcon = true,
  showHomeIcon = false,
  onHomePress,
}) => {
  const unreadCount = useAppSelector(selectNotificationCount);

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.primary}
        translucent={false}
      />
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          {/* Left Side - Home Icon or App Logo */}
          <View style={styles.leftSection}>
            {showHomeIcon ? (
              <TouchableOpacity
                style={styles.homeButton}
                onPress={onHomePress}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="home" size={24} color={theme.colors.surface} />
              </TouchableOpacity>
            ) : (
              <View style={styles.headerLogoContainer}>
                <Image source={AppLogo} style={styles.headerLogo} />
              </View>
            )}
          </View>

          {/* Center - App Name */}
          <View style={styles.centerSection}>
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>

          {/* Right Side - Notification Bell (Conditional) */}
          <View style={styles.rightSection}>
            {showNotificationIcon && (
              <TouchableOpacity
                style={styles.notificationButton}
                onPress={onNotificationPress}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View>
                  <Icon
                    name="notifications"
                    size={28}
                    color={theme.colors.surface}
                  />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} numberOfLines={1}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: theme.colors.primary,
    ...theme.shadows.md,
  },
  container: {
    height: theme.headerHeight,
    backgroundColor: theme.colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    elevation: 4, // Android shadow
    shadowColor: '#000', // iOS shadow
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  leftSection: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  rightSection: {
    width: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  title: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
    textAlign: 'center',
  },
  notificationButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
  },
  badge: {
    position: 'absolute',
    right: -2,
    top: -2,
    backgroundColor: theme.colors.error,
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
  },
  badgeText: {
    color: theme.colors.surface,
    fontSize: 10,
    fontWeight: theme.typography.fontWeights.bold,
  },
  headerLogoContainer: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: theme.colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    resizeMode: 'cover',
  },
  headerLogo: {
    width: 20,
    height: 20,
    borderRadius: 2,
    resizeMode: 'cover',
  },
  homeButton: {
    padding: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default Header;
