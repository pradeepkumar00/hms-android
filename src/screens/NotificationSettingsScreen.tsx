import React, { useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
  Switch,
  Vibration,
  Platform,
} from 'react-native';
// Removed react-native-sound dependency
import Icon from 'react-native-vector-icons/MaterialIcons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Header } from '../components';
import { theme } from '../constants/theme';
import { STORAGE_KEYS } from '../constants/app';
import {
  useAppDispatch,
  useAppSelector,
  selectNotificationSoundId,
} from '../store';
import { loadSettings, setNotificationSound } from '../store/settingsSlice';
import {
  ringtoneService,
  CustomRingtone,
  PredefinedSound,
  SystemSound,
} from '../services/ringtoneService';
import {
  requestNotificationsPermission,
  checkNotificationPermissions,
  redirectToNotificationSettings,
} from '../utils/permissionUtils';
import { notificationService } from '../services/notificationService';
import { notificationChannelService } from '../services/notificationChannelService';

type SoundItem = SystemSound | PredefinedSound | CustomRingtone;

interface NotificationSettingsScreenProps {
  navigation: any;
}

const NotificationSettingsScreen: React.FC<NotificationSettingsScreenProps> = ({
  navigation,
}) => {
  const dispatch = useAppDispatch();
  const selectedSoundId = useAppSelector(selectNotificationSoundId);
  const [availableSounds, setAvailableSounds] = useState<SoundItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [addingCustomSound, setAddingCustomSound] = useState(false);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [currentlyPlaying, setCurrentlyPlaying] = useState<string | null>(null);
  const [permissionStatus, setPermissionStatus] = useState<{
    hasPermission: boolean;
    status: string;
  }>({ hasPermission: false, status: 'unknown' });
  const [checkingPermission, setCheckingPermission] = useState(false);

  // Use ref to track sound timeouts for cleanup
  const systemSoundTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  useEffect(() => {
    dispatch(loadSettings());
    loadAvailableSounds();
    loadVibrationSettings();
    checkPermissions();
  }, [dispatch]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAllSounds();
    };
  }, []);

  const loadVibrationSettings = async () => {
    try {
      const storedVibration = await AsyncStorage.getItem(
        STORAGE_KEYS.VIBRATION_ENABLED,
      );
      if (storedVibration !== null) {
        const vibrationSetting = JSON.parse(storedVibration);
        setVibrationEnabled(vibrationSetting);
      }
    } catch (error) {
      console.error('Error loading vibration settings:', error);
    }
  };

  const handleVibrationToggle = async (enabled: boolean) => {
    try {
      setVibrationEnabled(enabled);
      await AsyncStorage.setItem(
        STORAGE_KEYS.VIBRATION_ENABLED,
        JSON.stringify(enabled),
      );

      // Update all notification channels with new vibration setting
      await notificationChannelService.updateChannelsForSettingsChange();
      console.log(
        '✅ Notification channels updated for vibration setting:',
        enabled,
      );

      // Test vibration immediately when enabled
      if (enabled && Platform.OS === 'android') {
        Vibration.vibrate(100);
      }
    } catch (error) {
      console.error('Error saving vibration setting:', error);
      // Revert local state if the async operation failed
      setVibrationEnabled(!enabled);
    }
  };

  const checkPermissions = async () => {
    try {
      setCheckingPermission(true);
      const status = await checkNotificationPermissions();
      setPermissionStatus(status);
    } catch (error) {
      console.error('Error checking permissions:', error);
      setPermissionStatus({ hasPermission: false, status: 'error' });
    } finally {
      setCheckingPermission(false);
    }
  };

  const handleRequestPermissions = async () => {
    try {
      setCheckingPermission(true);
      const granted = await requestNotificationsPermission();

      // Refresh permission status after request
      await checkPermissions();

      if (granted) {
        Alert.alert(
          'Success',
          'Notification permissions granted! You will now receive task updates.',
        );
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
    } finally {
      setCheckingPermission(false);
    }
  };

  const handleOpenSettings = () => {
    Alert.alert(
      'Open Notification Settings',
      'You will be redirected to your device settings to enable notifications manually.',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Open Settings',
          onPress: redirectToNotificationSettings,
        },
      ],
    );
  };

  const loadAvailableSounds = async () => {
    try {
      setLoading(true);
      const sounds = await ringtoneService.getAllSounds();
      setAvailableSounds(sounds);

      // Set first notification bell as default if no sound is currently selected
      if (!selectedSoundId && sounds.length > 0) {
        const firstSound = sounds[0];
        console.log(
          '🔔 Setting first notification sound as default:',
          firstSound,
        );

        try {
          await ringtoneService.setSelectedRingtone(firstSound.id);
          dispatch(setNotificationSound(firstSound.id));

          // Create notification channel for the default sound
          await notificationChannelService.createChannelForSound(firstSound.id);
          console.log('✅ Default notification sound and channel set');
        } catch (defaultError) {
          console.error('Error setting default sound:', defaultError);
        }
      }
    } catch (error) {
      console.error('Error loading available sounds:', error);
      Alert.alert('Error', 'Failed to load available sounds');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectSound = async (sound: SoundItem) => {
    try {
      await ringtoneService.setSelectedRingtone(sound.id);
      dispatch(setNotificationSound(sound.id === 'default' ? null : sound.id));

      // Update notification channels with new sound
      await notificationChannelService.createChannelForSound(sound.id);
      console.log('✅ Notification channel updated for sound:', sound.id);
    } catch (error) {
      console.error('Error selecting sound:', error);
      Alert.alert('Error', 'Failed to select sound');
    }
  };

  const handleAddCustomSound = async () => {
    try {
      setAddingCustomSound(true);
      const customRingtone = await ringtoneService.pickAudioFile();

      if (customRingtone) {
        await loadAvailableSounds(); // Refresh the list
        Alert.alert(
          'Success',
          `"${customRingtone.name}" has been added to your notification sounds.`,
          [{ text: 'OK' }],
        );
      }
    } catch (error) {
      console.error('Error adding custom sound:', error);
      Alert.alert('Error', 'Failed to add custom sound');
    } finally {
      setAddingCustomSound(false);
    }
  };

  const handleDeleteCustomSound = (sound: CustomRingtone) => {
    Alert.alert(
      'Delete Custom Sound',
      `Are you sure you want to delete "${sound.name}"?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await ringtoneService.deleteCustomRingtone(sound.id);
              await loadAvailableSounds(); // Refresh the list

              // If this was the selected sound, reset to default
              if (selectedSoundId === sound.id) {
                dispatch(setNotificationSound(null));
                await ringtoneService.setSelectedRingtone('default');
              }
            } catch (error) {
              console.error('Error deleting custom sound:', error);
              Alert.alert('Error', 'Failed to delete custom sound');
            }
          },
        },
      ],
    );
  };

  const stopAllSounds = () => {
    // Clear any system sound timeouts
    if (systemSoundTimeoutRef.current) {
      clearTimeout(systemSoundTimeoutRef.current);
      systemSoundTimeoutRef.current = null;
    }

    setCurrentlyPlaying(null);
  };

  const stopSound = (soundId?: string) => {
    if (soundId) {
      // Clear system sound timeout if it's the current playing sound
      if (currentlyPlaying === soundId && systemSoundTimeoutRef.current) {
        clearTimeout(systemSoundTimeoutRef.current);
        systemSoundTimeoutRef.current = null;
      }

      if (currentlyPlaying === soundId) {
        setCurrentlyPlaying(null);
      }
    } else {
      // Stop all sounds
      stopAllSounds();
    }
  };

  const playSound = async (sound: SoundItem) => {
    try {
      // Stop any currently playing sound
      stopAllSounds();

      setCurrentlyPlaying(sound.id);

      // Validate sound object
      if (!sound || !sound.id) {
        console.error('Invalid sound object:', sound);
        setCurrentlyPlaying(null);
        return;
      }

      // For system sounds, use the notification sounds library
      if ('isSystem' in sound && sound.isSystem) {
        const systemSound = sound as SystemSound;
        console.log('Playing system sound:', systemSound.title);

        try {
          await ringtoneService.playSystemSound(systemSound);
          console.log('System sound played successfully');

          // System sounds typically play for a short duration
          // Set a timeout to clear the playing state
          systemSoundTimeoutRef.current = setTimeout(() => {
            setCurrentlyPlaying(prevState => {
              // Only clear if this sound is still the currently playing one
              return prevState === sound.id ? null : prevState;
            });
          }, 2000); // Reduced to 2 seconds for better responsiveness
        } catch (error) {
          console.error('Failed to play system sound:', error);
          // Show fallback alert
          Alert.alert(
            'Sound Preview',
            `🔊 Playing: ${systemSound.title}\n\nThis is a system notification sound.`,
            [{ text: 'OK', onPress: () => setCurrentlyPlaying(null) }],
          );
          setCurrentlyPlaying(null);
        }
      }
      // For predefined sounds, use bundled assets
      else if ('fileName' in sound) {
        const predefinedSound = sound as PredefinedSound;
        if (!predefinedSound.fileName) {
          console.error('Predefined sound missing fileName:', predefinedSound);
          setCurrentlyPlaying(null);
          return;
        }

        console.log(
          'Attempting to play predefined sound:',
          predefinedSound.fileName,
        );

        try {
          // Show preview alert
          Alert.alert(
            'Sound Preview',
            `🔊 Playing: ${predefinedSound.name}\n\nThis is a preview of the selected notification sound.`,
            [{ text: 'OK', onPress: () => setCurrentlyPlaying(null) }],
          );

          // Use ringtone service to play predefined sound
          await ringtoneService.playNotificationSound(sound.id);
          console.log('Predefined sound played successfully');

          // Auto-clear after 3 seconds
          setTimeout(() => {
            setCurrentlyPlaying(prevState => {
              return prevState === sound.id ? null : prevState;
            });
          }, 3000);
        } catch (error) {
          console.error('Failed to play predefined sound:', error);
          setCurrentlyPlaying(null);
        }
      } else {
        // For custom sounds, use file URI
        const customSound = sound as CustomRingtone;
        if (!customSound.uri) {
          console.error('Custom sound missing uri:', customSound);
          setCurrentlyPlaying(null);
          return;
        }

        console.log('Playing custom sound:', customSound.name);

        try {
          // Use ringtone service to play custom sound
          await ringtoneService.playNotificationSound(sound.id);
          console.log('Custom sound played successfully');

          // Auto-clear after 3 seconds
          setTimeout(() => {
            setCurrentlyPlaying(prevState => {
              return prevState === sound.id ? null : prevState;
            });
          }, 3000);
        } catch (error) {
          console.error('Failed to play custom sound:', error);
          Alert.alert('Error', 'Failed to play the selected custom sound.');
          setCurrentlyPlaying(null);
        }
      }

      // Add vibration if enabled
      if (vibrationEnabled) {
        try {
          Vibration.vibrate(200);
          console.log('Vibration triggered');
        } catch (vibrationError) {
          console.error('Vibration failed:', vibrationError);
          // Vibration permission might be missing, but don't crash the app
        }
      }
    } catch (error) {
      console.error('Error playing sound:', error);
      setCurrentlyPlaying(null);
    }
  };

  const renderItem = ({ item }: { item: SoundItem }) => {
    const isSelected = item.id === (selectedSoundId || 'default');
    const isCustom = 'isCustom' in item && item.isCustom;
    const isSystem = 'isSystem' in item && item.isSystem;

    // Get the display name based on sound type
    const getDisplayName = () => {
      if (isSystem) return (item as SystemSound).title;
      if (isCustom) return (item as CustomRingtone).name;
      return (item as PredefinedSound).name;
    };

    // Get the subtitle based on sound type
    const getSubtitle = () => {
      if (isSystem) return 'System Sound';
      if (isCustom) return 'Custom Sound';
      return 'App Sound';
    };

    return (
      <TouchableOpacity
        style={[styles.optionRow, isSelected && styles.optionRowSelected]}
        onPress={() => handleSelectSound(item)}
        activeOpacity={0.8}
      >
        <View style={styles.optionContent}>
          <View style={styles.optionInfo}>
            <Text style={styles.optionTitle}>{getDisplayName()}</Text>
            <Text style={styles.optionSubtitle}>{getSubtitle()}</Text>
          </View>

          <View style={styles.optionActions}>
            {/* Play/Stop Button */}
            <TouchableOpacity
              style={styles.playButton}
              onPress={() => {
                if (currentlyPlaying === item.id) {
                  stopSound(item.id);
                } else {
                  playSound(item);
                }
              }}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Icon
                name={currentlyPlaying === item.id ? 'stop' : 'play-arrow'}
                size={20}
                color={theme.colors.primary}
              />
            </TouchableOpacity>

            {isCustom && (
              <TouchableOpacity
                style={styles.deleteButton}
                onPress={() => handleDeleteCustomSound(item as CustomRingtone)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Icon name="delete" size={20} color={theme.colors.error} />
              </TouchableOpacity>
            )}

            <Text
              style={[
                styles.badge,
                isSelected ? styles.badgeSelected : styles.badgeUnselected,
              ]}
            >
              {isSelected ? 'Selected' : 'Select'}
            </Text>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  if (loading) {
    return (
      <View style={styles.container}>
        <Header
          title="Notification Settings"
          onNotificationPress={() => navigation.navigate('Inbox')}
          showHomeIcon={true}
          onHomePress={() => navigation.navigate('Main')}
        />
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading sounds...</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Notification Settings"
        onNotificationPress={() => navigation.navigate('Inbox')}
        showHomeIcon={true}
        onHomePress={() => navigation.navigate('Main')}
      />
      <View style={styles.content}>
        {/* Permission Management Section */}
        <View style={styles.permissionSection}>
          <Text style={styles.sectionTitle}>Notification Permissions</Text>

          <View style={styles.permissionRow}>
            <View style={styles.permissionInfo}>
              <Text style={styles.permissionTitle}>
                {permissionStatus.hasPermission
                  ? 'Notifications Enabled'
                  : 'Notifications Disabled'}
              </Text>
              <Text style={styles.permissionSubtitle}>
                Status: {permissionStatus.status}
              </Text>
              {!permissionStatus.hasPermission && (
                <Text style={styles.permissionWarning}>
                  Enable notifications to receive task updates
                </Text>
              )}
            </View>

            <View style={styles.permissionActions}>
              {checkingPermission ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <View style={styles.permissionButtons}>
                  <TouchableOpacity
                    style={styles.permissionButton}
                    onPress={checkPermissions}
                  >
                    <Icon
                      name="refresh"
                      size={16}
                      color={theme.colors.primary}
                    />
                    <Text style={styles.permissionButtonText}>Check</Text>
                  </TouchableOpacity>

                  {!permissionStatus.hasPermission && (
                    <>
                      <TouchableOpacity
                        style={[styles.permissionButton, styles.primaryButton]}
                        onPress={handleRequestPermissions}
                      >
                        <Icon name="notifications" size={16} color="white" />
                        <Text
                          style={[
                            styles.permissionButtonText,
                            styles.primaryButtonText,
                          ]}
                        >
                          Enable
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        style={styles.permissionButton}
                        onPress={handleOpenSettings}
                      >
                        <Icon
                          name="settings"
                          size={16}
                          color={theme.colors.primary}
                        />
                        <Text style={styles.permissionButtonText}>
                          Settings
                        </Text>
                      </TouchableOpacity>
                    </>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Notification Sound</Text>

        <FlatList
          data={availableSounds}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={false}
        />

        <TouchableOpacity
          style={[
            styles.addCustomButton,
            addingCustomSound && styles.addCustomButtonDisabled,
          ]}
          onPress={handleAddCustomSound}
          disabled={addingCustomSound}
          activeOpacity={0.8}
        >
          {addingCustomSound ? (
            <ActivityIndicator size="small" color={theme.colors.surface} />
          ) : (
            <Icon name="add" size={20} color={theme.colors.surface} />
          )}
          <Text style={styles.addCustomButtonText}>
            {addingCustomSound ? 'Adding...' : 'Add Custom Sound'}
          </Text>
        </TouchableOpacity>

        {/* Vibration Settings */}
        <View style={styles.vibrationSection}>
          <Text style={styles.sectionTitle}>Vibration</Text>
          <View style={styles.vibrationRow}>
            <View style={styles.vibrationInfo}>
              <Text style={styles.vibrationTitle}>Enable Vibration</Text>
              <Text style={styles.vibrationSubtitle}>
                Vibrate when notifications arrive
              </Text>
            </View>
            <Switch
              value={vibrationEnabled}
              onValueChange={handleVibrationToggle}
              trackColor={{
                false: theme.colors.border,
                true: theme.colors.primary + '40',
              }}
              thumbColor={
                vibrationEnabled
                  ? theme.colors.primary
                  : theme.colors.textSecondary
              }
            />
          </View>
        </View>

        <Text style={styles.helpText}>
          Your selected sound will be used when notifications arrive. You can
          add custom sounds from your device or choose from the predefined
          options. Tap the play button to preview sounds.
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  loadingText: {
    marginTop: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
  },
  content: {
    flex: 1,
    padding: theme.spacing.md,
  },
  sectionTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.sm,
  },
  optionRow: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
  },
  optionRowSelected: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  optionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  optionInfo: {
    flex: 1,
  },
  optionTitle: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeights.medium,
  },
  optionSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  optionActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  deleteButton: {
    padding: theme.spacing.xs,
    marginRight: theme.spacing.sm,
  },
  badge: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.medium,
  },
  badgeSelected: {
    backgroundColor: theme.colors.primary,
    color: theme.colors.surface,
  },
  badgeUnselected: {
    backgroundColor: theme.colors.background,
    color: theme.colors.textSecondary,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  addCustomButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.primary,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.md,
  },
  addCustomButtonDisabled: {
    backgroundColor: theme.colors.textSecondary,
  },
  addCustomButtonText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    marginLeft: theme.spacing.sm,
  },
  separator: {
    height: theme.spacing.sm,
  },
  helpText: {
    marginTop: theme.spacing.md,
    color: theme.colors.textSecondary,
    fontSize: theme.typography.fontSizes.sm,
    lineHeight: 20,
  },
  playButton: {
    padding: theme.spacing.xs,
    marginRight: theme.spacing.sm,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.primary + '20',
  },
  vibrationSection: {
    marginTop: theme.spacing.lg,
    paddingTop: theme.spacing.md,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  vibrationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.sm,
  },
  vibrationInfo: {
    flex: 1,
  },
  vibrationTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.text,
  },
  vibrationSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xs,
  },
  // Permission Management Styles
  permissionSection: {
    marginBottom: theme.spacing.lg,
  },
  permissionRow: {
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  permissionInfo: {
    flex: 1,
    marginRight: theme.spacing.md,
  },
  permissionTitle: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    fontWeight: theme.typography.fontWeights.medium,
    marginBottom: theme.spacing.xs,
  },
  permissionSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  permissionWarning: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.error,
    fontStyle: 'italic',
  },
  permissionActions: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtons: {
    flexDirection: 'row',
    gap: theme.spacing.xs,
  },
  permissionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    backgroundColor: 'transparent',
  },
  primaryButton: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  permissionButtonText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.primary,
    marginLeft: theme.spacing.xs,
    fontWeight: theme.typography.fontWeights.medium,
  },
  primaryButtonText: {
    color: 'white',
  },
});

export default NotificationSettingsScreen;
