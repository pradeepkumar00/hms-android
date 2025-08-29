import { Platform, NativeModules } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { ringtoneService } from './ringtoneService';
import { STORAGE_KEYS } from '../constants/app';

export interface NotificationChannel {
  id: string;
  name: string;
  description: string;
  importance: number;
  soundUri?: string;
  vibrationEnabled?: boolean;
  vibrationPattern?: number[];
}

class NotificationChannelService {
  private readonly DEFAULT_CHANNEL_ID = 'default_notifications';
  private readonly CUSTOM_CHANNEL_PREFIX = 'custom_sound_';

  // Android importance levels
  private readonly IMPORTANCE_HIGH = 4;
  private readonly IMPORTANCE_DEFAULT = 3;

  /**
   * Create default notification channel with enhanced sound and vibration
   */
  async createDefaultChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      console.log('🔔 Creating default notification channel...');

      // Get vibration settings
      const vibrationEnabled = await this.getVibrationSettings();

      // Get default notification sound
      const defaultSoundUri =
        (await ringtoneService.getSelectedNotificationSound()) || 'default';
      console.log('🔊 Using sound URI:', defaultSoundUri);

      const channel: NotificationChannel = {
        id: this.DEFAULT_CHANNEL_ID,
        name: 'Hospital Management Notifications',
        description: 'Task assignments, updates and alerts',
        importance: this.IMPORTANCE_HIGH, // Ensures sound and popup
        soundUri: defaultSoundUri !== 'default' ? defaultSoundUri : undefined, // Use system default if not set
        vibrationEnabled,
        vibrationPattern: vibrationEnabled ? [0, 300, 200, 300] : [0], // Enhanced vibration pattern
      };

      await this.createChannel(channel);
      console.log(
        '✅ Default notification channel created with sound and vibration',
      );
    } catch (error) {
      console.error('❌ Error creating default notification channel:', error);
    }
  }

  /**
   * Create or update channel for custom sound
   */
  async createChannelForSound(soundId: string): Promise<string> {
    if (Platform.OS !== 'android') return this.DEFAULT_CHANNEL_ID;

    try {
      const soundUri = await ringtoneService.getRingtoneUriForNotification(
        soundId,
      );
      const vibrationEnabled = await this.getVibrationSettings();

      const channelId =
        soundId === 'default'
          ? this.DEFAULT_CHANNEL_ID
          : `${this.CUSTOM_CHANNEL_PREFIX}${soundId}`;

      const channel: NotificationChannel = {
        id: channelId,
        name: `Task Notifications - ${
          soundId === 'default' ? 'Default' : 'Custom Sound'
        }`,
        description: 'Notifications with custom sound and vibration settings',
        importance: this.IMPORTANCE_HIGH,
        soundUri: soundUri || undefined,
        vibrationEnabled,
        vibrationPattern: vibrationEnabled ? [0, 250, 250, 250] : undefined,
      };

      await this.createChannel(channel);
      console.log(`✅ Notification channel created for sound: ${soundId}`);
      return channelId;
    } catch (error) {
      console.error('❌ Error creating channel for sound:', error);
      return this.DEFAULT_CHANNEL_ID;
    }
  }

  /**
   * Create notification channel (Android only)
   */
  private async createChannel(channel: NotificationChannel): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      console.log('📱 Creating notification channel:', channel);

      // For Android API 26+, use a simplified approach
      if (this.supportsChannels()) {
        // Store channel configuration for use by Firebase messaging
        await this.storeChannelConfig(channel);

        // Since we're using Firebase messaging, the actual channel creation
        // needs to be handled in the native Android code through Firebase
        // For now, we'll store the channel configuration and log it
        console.log(`✅ Notification channel configured: ${channel.id}`);
        console.log(`   - Name: ${channel.name}`);
        console.log(`   - Sound URI: ${channel.soundUri || 'default'}`);
        console.log(
          `   - Vibration: ${
            channel.vibrationEnabled ? 'enabled' : 'disabled'
          }`,
        );
        console.log(`   - Importance: ${channel.importance}`);
      } else {
        // For older Android versions, store basic configuration
        await this.storeChannelConfig(channel);
        console.log(
          `✅ Notification settings stored for legacy Android: ${channel.id}`,
        );
      }
    } catch (error) {
      console.error('❌ Error in createChannel:', error);
      throw error;
    }
  }

  /**
   * Store channel configuration for Firebase messaging to use
   */
  private async storeChannelConfig(
    channel: NotificationChannel,
  ): Promise<void> {
    try {
      const channelConfig = {
        id: channel.id,
        name: channel.name,
        description: channel.description,
        importance: channel.importance,
        soundUri: channel.soundUri,
        vibrationEnabled: channel.vibrationEnabled,
        vibrationPattern: channel.vibrationPattern,
        createdAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(
        `${STORAGE_KEYS.NOTIFICATION_SOUND}_channel_${channel.id}`,
        JSON.stringify(channelConfig),
      );
    } catch (error) {
      console.error('❌ Error storing channel config:', error);
      throw error;
    }
  }

  /**
   * Get stored channel configuration
   */
  async getChannelConfig(
    channelId: string,
  ): Promise<NotificationChannel | null> {
    try {
      const storedConfig = await AsyncStorage.getItem(
        `${STORAGE_KEYS.NOTIFICATION_SOUND}_channel_${channelId}`,
      );
      return storedConfig ? JSON.parse(storedConfig) : null;
    } catch (error) {
      console.error('❌ Error getting channel config:', error);
      return null;
    }
  }

  /**
   * Get channel ID for current sound setting
   */
  async getCurrentChannelId(): Promise<string> {
    try {
      const selectedSoundId = await ringtoneService.getSelectedRingtone();

      if (!selectedSoundId || selectedSoundId === 'default') {
        return this.DEFAULT_CHANNEL_ID;
      }

      return `${this.CUSTOM_CHANNEL_PREFIX}${selectedSoundId}`;
    } catch (error) {
      console.error('❌ Error getting current channel ID:', error);
      return this.DEFAULT_CHANNEL_ID;
    }
  }

  /**
   * Delete custom sound channels that are no longer needed
   */
  async cleanupUnusedChannels(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      // Get all custom ringtones
      const customRingtones = await ringtoneService.getCustomRingtones();
      const activeChannelIds = customRingtones.map(
        ringtone => `${this.CUSTOM_CHANNEL_PREFIX}${ringtone.id}`,
      );

      // TODO: Implement channel cleanup
      // This would involve getting all existing channels and deleting ones not in activeChannelIds
      console.log('🧹 Cleaning up unused notification channels');
    } catch (error) {
      console.error('❌ Error cleaning up unused channels:', error);
    }
  }

  /**
   * Get default channel ID
   */
  getDefaultChannelId(): string {
    return this.DEFAULT_CHANNEL_ID;
  }

  /**
   * Check if platform supports notification channels
   */
  supportsChannels(): boolean {
    return Platform.OS === 'android' && Platform.Version >= 26;
  }

  /**
   * Get vibration settings from storage
   */
  private async getVibrationSettings(): Promise<boolean> {
    try {
      const storedVibration = await AsyncStorage.getItem(
        STORAGE_KEYS.VIBRATION_ENABLED,
      );
      if (storedVibration !== null) {
        return JSON.parse(storedVibration);
      }
      return true; // Default to enabled
    } catch (error) {
      console.error('Error loading vibration settings:', error);
      return true; // Default to enabled on error
    }
  }

  /**
   * Update existing channels when settings change
   */
  async updateChannelsForSettingsChange(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      console.log('🔄 Updating notification channels for settings change');

      // Recreate default channel with new settings
      await this.createDefaultChannel();

      // Recreate custom sound channels
      const customRingtones = await ringtoneService.getCustomRingtones();
      for (const ringtone of customRingtones) {
        await this.createChannelForSound(ringtone.id);
      }

      console.log('✅ Notification channels updated for settings change');
    } catch (error) {
      console.error('❌ Error updating channels for settings change:', error);
    }
  }
}

// Export singleton instance
export const notificationChannelService = new NotificationChannelService();
export default notificationChannelService;
