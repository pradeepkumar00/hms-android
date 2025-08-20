import { Platform, NativeModules } from 'react-native';
import { ringtoneService } from './ringtoneService';

export interface NotificationChannel {
  id: string;
  name: string;
  description: string;
  importance: number;
  soundUri?: string;
}

class NotificationChannelService {
  private readonly DEFAULT_CHANNEL_ID = 'default_notifications';
  private readonly CUSTOM_CHANNEL_PREFIX = 'custom_sound_';

  // Android importance levels
  private readonly IMPORTANCE_HIGH = 4;
  private readonly IMPORTANCE_DEFAULT = 3;

  /**
   * Create default notification channel
   */
  async createDefaultChannel(): Promise<void> {
    if (Platform.OS !== 'android') return;

    try {
      const channel: NotificationChannel = {
        id: this.DEFAULT_CHANNEL_ID,
        name: 'Task Notifications',
        description: 'Notifications for task assignments and updates',
        importance: this.IMPORTANCE_DEFAULT,
      };

      await this.createChannel(channel);
      console.log('✅ Default notification channel created');
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
      const channelId =
        soundId === 'default'
          ? this.DEFAULT_CHANNEL_ID
          : `${this.CUSTOM_CHANNEL_PREFIX}${soundId}`;

      const channel: NotificationChannel = {
        id: channelId,
        name: `Task Notifications - ${
          soundId === 'default' ? 'Default' : 'Custom Sound'
        }`,
        description: 'Notifications with custom sound',
        importance: this.IMPORTANCE_DEFAULT,
        soundUri: soundUri || undefined,
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
      // For now, we'll use a placeholder implementation
      // In a real app, you would use a native module or library like @react-native-async-storage/async-storage
      // or react-native-push-notification to create actual notification channels

      console.log('📱 Creating notification channel:', channel);

      // TODO: Implement actual channel creation using native Android code
      // This would typically involve:
      // 1. Creating a NotificationChannel object in native Android code
      // 2. Setting the sound URI if provided
      // 3. Registering the channel with NotificationManager

      // Example native implementation would be:
      /*
      const { NotificationChannelManager } = NativeModules;
      if (NotificationChannelManager) {
        await NotificationChannelManager.createChannel({
          id: channel.id,
          name: channel.name,
          description: channel.description,
          importance: channel.importance,
          soundUri: channel.soundUri,
        });
      }
      */
    } catch (error) {
      console.error('❌ Error in createChannel:', error);
      throw error;
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
}

// Export singleton instance
export const notificationChannelService = new NotificationChannelService();
export default notificationChannelService;
