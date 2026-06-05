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
  showMenuIcon?: boolean;
  onMenuPress?: () => void;
  rightText?: string;
  onRightTextPress?: () => void;
  rightTextExpanded?: boolean;
  leftText?: string;
  onLeftTextPress?: () => void;
  leftTextExpanded?: boolean;
}

const Header: React.FC<HeaderProps> = ({
  title = APP_CONFIG.name,
  onNotificationPress,
  showNotificationIcon = true,
  showHomeIcon = false,
  onHomePress,
  showMenuIcon = false,
  onMenuPress,
  rightText,
  onRightTextPress,
  rightTextExpanded = false,
  leftText,
  onLeftTextPress,
  leftTextExpanded = false,
}) => {
  const unreadCount = useAppSelector(selectNotificationCount);

  return (
    <>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.primary}
        translucent={false}
      />
      <SafeAreaView edges={['top']} style={styles.safeArea}>
        <View style={styles.container}>
          {/* Left Side - Text label, Home Icon or App Logo */}
          <View style={styles.leftSection}>
            {leftText ? (
              <TouchableOpacity
                style={styles.leftTextButton}
                onPress={onLeftTextPress}
                activeOpacity={onLeftTextPress ? 0.7 : 1}
                disabled={!onLeftTextPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.leftText} numberOfLines={1}>
                  {leftText}
                </Text>
                {!!onLeftTextPress && (
                  <Icon
                    name={leftTextExpanded ? 'arrow-drop-up' : 'arrow-drop-down'}
                    size={22}
                    color={theme.colors.surface}
                  />
                )}
              </TouchableOpacity>
            ) : showHomeIcon ? (
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

          {/* Right Side - Text label, Hamburger Menu or Notification Bell (Conditional) */}
          <View style={styles.rightSection}>
            {rightText ? (
              <TouchableOpacity
                style={styles.rightTextButton}
                onPress={onRightTextPress}
                activeOpacity={onRightTextPress ? 0.7 : 1}
                disabled={!onRightTextPress}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Text style={styles.rightText} numberOfLines={1}>
                  {rightText}
                </Text>
                {!!onRightTextPress && (
                  <Icon
                    name={rightTextExpanded ? 'arrow-drop-up' : 'arrow-drop-down'}
                    size={22}
                    color={theme.colors.surface}
                  />
                )}
              </TouchableOpacity>
            ) : showMenuIcon ? (
              <TouchableOpacity
                style={styles.notificationButton}
                onPress={onMenuPress}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <View>
                  <Icon name="menu" size={28} color={theme.colors.surface} />
                  {unreadCount > 0 && (
                    <View style={styles.badge}>
                      <Text style={styles.badgeText} numberOfLines={1}>
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ) : (
              showNotificationIcon && (
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
              )
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
    minWidth: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  leftTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  leftText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  centerSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  rightSection: {
    minWidth: 40,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  rightTextButton: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rightText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
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
