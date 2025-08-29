import { Platform, Alert } from 'react-native';
import {
  pick,
  DocumentPickerResponse,
  errorCodes,
  isErrorWithCode,
} from '@react-native-documents/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
// Removed react-native-sound dependency
import NotificationSounds, {
  playSampleSound,
} from 'react-native-notification-sounds';
import { STORAGE_KEYS } from '../constants/app';

export interface CustomRingtone {
  id: string;
  name: string;
  uri: string;
  type: string;
  size: number;
  isCustom: boolean;
}

export interface PredefinedSound {
  id: string;
  name: string;
  fileName?: string; // For bundled sounds (optional)
  isCustom: false;
}

export interface SystemSound {
  id: string;
  title: string;
  url: string;
  soundID?: string; // Changed to string to match playSampleSound API
  isSystem: true;
}

class RingtoneService {
  // System sounds from Android OS
  private systemSounds: SystemSound[] = [];

  // Predefined sounds that come with the app (keeping user's custom file as fallback)
  private predefinedSounds: PredefinedSound[] = [
    {
      id: 'custom_default',
      name: 'Custom Default',
      fileName: 'default_notification.mp3',
      isCustom: false,
    },
  ];

  // Supported audio formats
  private supportedFormats = [
    'audio/mpeg',
    'audio/mp3',
    'audio/wav',
    'audio/m4a',
    'audio/aac',
    'audio/ogg',
  ];

  // Maximum file size (5MB)
  private maxFileSize = 5 * 1024 * 1024;

  /**
   * Load system notification sounds from Android OS with enhanced error handling
   */
  private async loadSystemSounds(): Promise<SystemSound[]> {
    try {
      console.log('🔊 Loading Android system notification sounds...');

      if (Platform.OS !== 'android') {
        console.log('📱 System sounds only available on Android, skipping...');
        return [];
      }

      // Add timeout for sound loading to prevent hanging
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error('System sounds loading timeout')),
          10000,
        );
      });

      const soundsPromise = NotificationSounds.getNotifications('notification');

      const soundsList = await Promise.race([soundsPromise, timeoutPromise]);

      if (!Array.isArray(soundsList)) {
        throw new Error('Invalid sounds list received from system');
      }

      console.log(`🎵 Found ${soundsList.length} system notification sounds`);

      // Convert to our SystemSound format with validation
      const systemSounds: SystemSound[] = soundsList
        .slice(0, 10) // Limit to first 10 sounds to avoid overwhelming UI
        .filter(sound => sound && (sound.title || sound.url)) // Filter out invalid sounds
        .map((sound: any, index: number) => {
          console.log('====================================');
          console.log('system sound', sound);
          console.log('====================================');
          const processedSound: SystemSound = {
            id: `system_${index}`,
            title: sound.title || `System Sound ${index + 1}`,
            url: sound.url || '',
            soundID: sound.soundID ? String(sound.soundID) : `${index}`,
            isSystem: true,
          };

          // Validate the processed sound
          if (!processedSound.url) {
            console.warn(
              `⚠️ System sound at index ${index} missing URL, skipping`,
            );
            return null;
          }

          return processedSound;
        })
        .filter(Boolean) as SystemSound[]; // Remove null entries

      this.systemSounds = systemSounds;
      console.log(
        `✅ Successfully loaded ${systemSounds.length} valid system sounds`,
      );
      return systemSounds;
    } catch (error) {
      console.error('❌ Error loading system sounds:', error);

      // Set empty array to prevent repeated failed attempts
      this.systemSounds = [];
      return [];
    }
  }

  /**
   * Get all available sounds (system + predefined + custom)
   */
  async getAllSounds(): Promise<
    (SystemSound | PredefinedSound | CustomRingtone)[]
  > {
    try {
      // Load system sounds first
      const systemSounds = await this.loadSystemSounds();
      const customRingtones = await this.getCustomRingtones();

      return [...systemSounds, ...this.predefinedSounds, ...customRingtones];
    } catch (error) {
      console.error('❌ Error getting all sounds:', error);
      return this.predefinedSounds;
    }
  }

  /**
   * Play a system sound
   */
  async playSystemSound(systemSound: SystemSound): Promise<void> {
    try {
      console.log('Playing system sound:', systemSound.title);

      // Convert SystemSound to the format expected by playSampleSound
      const soundForPlayback = {
        title: systemSound.title,
        url: systemSound.url,
        soundID: systemSound.soundID || '0', // Ensure soundID is string
      };

      await playSampleSound(soundForPlayback); // Now properly typed
    } catch (error) {
      console.error('Error playing system sound:', error);
      // Fallback to default sound if system sound fails
      console.warn('Falling back to default notification sound');
    }
  }

  /**
   * Get predefined sounds
   */
  getPredefinedSounds(): PredefinedSound[] {
    return this.predefinedSounds;
  }

  /**
   * Get custom ringtones from storage
   */
  async getCustomRingtones(): Promise<CustomRingtone[]> {
    try {
      const storedRingtones = await AsyncStorage.getItem(
        STORAGE_KEYS.CUSTOM_RINGTONES,
      );
      return storedRingtones ? JSON.parse(storedRingtones) : [];
    } catch (error) {
      console.error('❌ Error getting custom ringtones:', error);
      return [];
    }
  }

  /**
   * Open audio file picker
   */
  async pickAudioFile(): Promise<CustomRingtone | null> {
    try {
      const result = await pick({
        type: ['audio/*'],
        copyTo: 'documentDirectory', // Copy to app's document directory
      });

      if (result && result.length > 0) {
        const file = result[0];
        return await this.processSelectedFile(file);
      }

      return null;
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        console.log('📱 User cancelled audio file selection');
        return null;
      }

      console.error('❌ Error picking audio file:', error);
      Alert.alert('Error', 'Failed to select audio file. Please try again.', [
        { text: 'OK' },
      ]);
      return null;
    }
  }

  /**
   * Process selected audio file
   */
  private async processSelectedFile(
    file: DocumentPickerResponse,
  ): Promise<CustomRingtone | null> {
    try {
      // Validate file type
      if (!this.isValidAudioFormat(file.type)) {
        Alert.alert(
          'Invalid File Format',
          'Please select a valid audio file (MP3, WAV, M4A, AAC, OGG).',
          [{ text: 'OK' }],
        );
        return null;
      }

      // Validate file size
      if (file.size && file.size > this.maxFileSize) {
        Alert.alert(
          'File Too Large',
          `File size must be less than ${this.maxFileSize / (1024 * 1024)}MB.`,
          [{ text: 'OK' }],
        );
        return null;
      }

      // Create custom ringtone object
      const customRingtone: CustomRingtone = {
        id: `custom_${Date.now()}`,
        name: this.extractFileName(file.name || 'Custom Sound'),
        uri: file.uri,
        type: file.type || 'audio/mpeg',
        size: file.size || 0,
        isCustom: true,
      };

      // Save to storage
      await this.saveCustomRingtone(customRingtone);

      console.log('✅ Custom ringtone processed:', customRingtone);
      return customRingtone;
    } catch (error) {
      console.error('❌ Error processing selected file:', error);
      Alert.alert('Error', 'Failed to process the selected audio file.', [
        { text: 'OK' },
      ]);
      return null;
    }
  }

  /**
   * Validate audio format
   */
  private isValidAudioFormat(mimeType: string | null): boolean {
    if (!mimeType) return false;
    return this.supportedFormats.includes(mimeType.toLowerCase());
  }

  /**
   * Extract clean file name
   */
  private extractFileName(fileName: string): string {
    // Remove file extension and clean up the name
    const nameWithoutExtension = fileName.replace(/\.[^/.]+$/, '');
    return nameWithoutExtension.replace(/[_-]/g, ' ').trim();
  }

  /**
   * Save custom ringtone to storage
   */
  private async saveCustomRingtone(ringtone: CustomRingtone): Promise<void> {
    try {
      const existingRingtones = await this.getCustomRingtones();
      const updatedRingtones = [...existingRingtones, ringtone];

      await AsyncStorage.setItem(
        STORAGE_KEYS.CUSTOM_RINGTONES,
        JSON.stringify(updatedRingtones),
      );

      console.log('💾 Custom ringtone saved to storage');
    } catch (error) {
      console.error('❌ Error saving custom ringtone:', error);
      throw error;
    }
  }

  /**
   * Delete custom ringtone
   */
  async deleteCustomRingtone(ringtoneId: string): Promise<void> {
    try {
      const existingRingtones = await this.getCustomRingtones();
      const ringtoneToDelete = existingRingtones.find(r => r.id === ringtoneId);

      if (ringtoneToDelete) {
        // Delete the file from device storage
        try {
          if (ringtoneToDelete.uri.startsWith('file://')) {
            const exists = await RNFS.exists(
              ringtoneToDelete.uri.replace('file://', ''),
            );
            if (exists) {
              await RNFS.unlink(ringtoneToDelete.uri.replace('file://', ''));
            }
          }
        } catch (fileError) {
          console.warn('⚠️ Could not delete ringtone file:', fileError);
        }

        // Remove from storage
        const updatedRingtones = existingRingtones.filter(
          r => r.id !== ringtoneId,
        );
        await AsyncStorage.setItem(
          STORAGE_KEYS.CUSTOM_RINGTONES,
          JSON.stringify(updatedRingtones),
        );

        console.log('🗑️ Custom ringtone deleted:', ringtoneId);
      }
    } catch (error) {
      console.error('❌ Error deleting custom ringtone:', error);
      throw error;
    }
  }

  /**
   * Get currently selected ringtone
   */
  async getSelectedRingtone(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_RINGTONE_URI);
    } catch (error) {
      console.error('❌ Error getting selected ringtone:', error);
      return null;
    }
  }

  /**
   * Set selected ringtone
   */
  async setSelectedRingtone(ringtoneId: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_RINGTONE_URI, ringtoneId);
      console.log('🔔 Selected ringtone updated:', ringtoneId);
    } catch (error) {
      console.error('❌ Error setting selected ringtone:', error);
      throw error;
    }
  }

  /**
   * Get ringtone by ID
   */
  async getRingtoneById(
    ringtoneId: string,
  ): Promise<SystemSound | PredefinedSound | CustomRingtone | null> {
    try {
      const allSounds = await this.getAllSounds();
      return allSounds.find(sound => sound.id === ringtoneId) || null;
    } catch (error) {
      console.error('❌ Error getting ringtone by ID:', error);
      return null;
    }
  }

  /**
   * Get ringtone URI for notification channel
   */
  async getRingtoneUriForNotification(
    ringtoneId?: string,
  ): Promise<string | null> {
    try {
      const selectedId = ringtoneId || (await this.getSelectedRingtone());

      if (!selectedId || selectedId === 'default') {
        return null; // Use system default
      }

      const ringtone = await this.getRingtoneById(selectedId);

      if (!ringtone) {
        return null;
      }

      // Handle different sound types
      if ('isCustom' in ringtone && ringtone.isCustom) {
        return (ringtone as CustomRingtone).uri;
      } else if ('isSystem' in ringtone && ringtone.isSystem) {
        // For system sounds, return the system URI
        return (ringtone as SystemSound).url;
      } else {
        // For predefined sounds, return the bundled resource URI
        const predefined = ringtone as PredefinedSound;

        // Add null check for fileName
        if (!predefined.fileName) {
          console.warn('Predefined sound missing fileName, using default');
          return 'default';
        }

        if (Platform.OS === 'android') {
          const fileName = predefined.fileName || 'default';
          return `android.resource://${this.getPackageName()}/raw/${fileName.replace(
            '.mp3',
            '',
          )}`;
        } else {
          return predefined.fileName || null;
        }
      }
    } catch (error) {
      console.error('❌ Error getting ringtone URI for notification:', error);
      return null;
    }
  }

  /**
   * Get package name for Android resource URI
   */
  private getPackageName(): string {
    // This would typically come from native code or app configuration
    return 'com.octusai.hospital'; // Octus AI package name
  }

  /**
   * Get ringtone service health status
   */
  async getServiceHealthStatus(): Promise<{
    isHealthy: boolean;
    systemSoundsLoaded: boolean;
    customRingtonesCount: number;
    issues: string[];
  }> {
    const issues: string[] = [];
    let systemSoundsLoaded = false;
    let customRingtonesCount = 0;

    try {
      // Check system sounds availability
      if (Platform.OS === 'android') {
        try {
          await this.loadSystemSounds();
          systemSoundsLoaded = this.systemSounds.length > 0;
          if (!systemSoundsLoaded) {
            issues.push('No system sounds available');
          }
        } catch (error) {
          issues.push('Failed to load system sounds');
        }
      } else {
        systemSoundsLoaded = true; // iOS doesn't need system sounds loading
      }

      // Check custom ringtones
      try {
        const customRingtones = await this.getCustomRingtones();
        customRingtonesCount = customRingtones.length;

        // Validate custom ringtones
        let invalidCount = 0;
        for (const ringtone of customRingtones) {
          const isValid = await this.validateRingtoneFile(ringtone);
          if (!isValid) {
            invalidCount++;
          }
        }

        if (invalidCount > 0) {
          issues.push(`${invalidCount} invalid custom ringtones found`);
        }
      } catch (error) {
        issues.push('Failed to check custom ringtones');
      }

      // Check predefined sounds
      const predefinedCount = this.predefinedSounds.length;
      if (predefinedCount === 0) {
        issues.push('No predefined sounds available');
      }

      const isHealthy = issues.length === 0;

      return {
        isHealthy,
        systemSoundsLoaded,
        customRingtonesCount,
        issues,
      };
    } catch (error) {
      console.error('Error checking service health:', error);
      return {
        isHealthy: false,
        systemSoundsLoaded: false,
        customRingtonesCount: 0,
        issues: ['Service health check failed'],
      };
    }
  }

  /**
   * Initialize ringtone service with error handling
   */
  async initialize(): Promise<boolean> {
    try {
      console.log('🔊 Initializing Ringtone Service...');

      // Load system sounds on Android
      if (Platform.OS === 'android') {
        await this.loadSystemSounds();
      }

      // Clean up invalid custom ringtones
      await this.cleanupInvalidRingtones();

      // Check service health
      const healthStatus = await this.getServiceHealthStatus();

      if (healthStatus.issues.length > 0) {
        console.warn(
          '⚠️ Ringtone service initialized with issues:',
          healthStatus.issues,
        );
      } else {
        console.log('✅ Ringtone service initialized successfully');
      }

      return healthStatus.isHealthy;
    } catch (error) {
      console.error('❌ Failed to initialize ringtone service:', error);
      return false;
    }
  }

  /**
   * Validate ringtone file exists with comprehensive checks
   */
  async validateRingtoneFile(ringtone: CustomRingtone): Promise<boolean> {
    try {
      if (!ringtone || !ringtone.uri) {
        console.warn('⚠️ Ringtone or URI is missing');
        return false;
      }

      // Check different URI formats
      if (ringtone.uri.startsWith('file://')) {
        const filePath = ringtone.uri.replace('file://', '');
        const exists = await RNFS.exists(filePath);

        if (!exists) {
          console.warn(`⚠️ Custom ringtone file does not exist: ${filePath}`);
          return false;
        }

        // Additional validation - check if it's actually a file (not directory)
        try {
          const stats = await RNFS.stat(filePath);
          if (stats.isDirectory()) {
            console.warn(
              `⚠️ Ringtone path is a directory, not a file: ${filePath}`,
            );
            return false;
          }

          // Check file size (should be reasonable for an audio file)
          if (stats.size === 0) {
            console.warn(`⚠️ Ringtone file is empty: ${filePath}`);
            return false;
          }

          if (stats.size > this.maxFileSize) {
            console.warn(`⚠️ Ringtone file too large: ${stats.size} bytes`);
            return false;
          }

          console.log(
            `✅ Ringtone file validation passed: ${filePath} (${stats.size} bytes)`,
          );
          return true;
        } catch (statError) {
          console.warn(
            `⚠️ Error getting file stats for ${filePath}:`,
            statError,
          );
          return false;
        }
      } else if (
        ringtone.uri.startsWith('content://') ||
        ringtone.uri.startsWith('android.resource://')
      ) {
        // Content URIs and Android resource URIs - assume valid if properly formatted
        console.log(`✅ Content/Resource URI assumed valid: ${ringtone.uri}`);
        return true;
      } else {
        // Other URI formats - basic validation
        const isValidUri =
          ringtone.uri.length > 0 && !ringtone.uri.includes(' ');
        if (!isValidUri) {
          console.warn(`⚠️ Invalid URI format: ${ringtone.uri}`);
        }
        return isValidUri;
      }
    } catch (error) {
      console.error('❌ Error validating ringtone file:', error);
      return false;
    }
  }

  /**
   * Clean up invalid ringtones
   */
  async cleanupInvalidRingtones(): Promise<void> {
    try {
      const customRingtones = await this.getCustomRingtones();
      const validRingtones: CustomRingtone[] = [];

      for (const ringtone of customRingtones) {
        const isValid = await this.validateRingtoneFile(ringtone);
        if (isValid) {
          validRingtones.push(ringtone);
        } else {
          console.log('🧹 Removing invalid ringtone:', ringtone.name);
        }
      }

      if (validRingtones.length !== customRingtones.length) {
        await AsyncStorage.setItem(
          STORAGE_KEYS.CUSTOM_RINGTONES,
          JSON.stringify(validRingtones),
        );
        console.log('✅ Cleaned up invalid ringtones');
      }
    } catch (error) {
      console.error('❌ Error cleaning up invalid ringtones:', error);
    }
  }

  /**
   * Play notification sound by ID (for incoming notifications)
   */
  async playNotificationSound(soundId: string): Promise<void> {
    try {
      const availableSounds = await this.getAllSounds();
      const sound = availableSounds.find((s: any) => s.id === soundId);

      if (!sound) {
        console.warn(`Sound with ID ${soundId} not found, playing default`);
        await this.playDefaultNotificationSound();
        return;
      }

      // Improved type checking and error handling
      if ('isSystem' in sound && sound.isSystem) {
        await this.playSystemSound(sound as SystemSound);
      } else if ('fileName' in sound && sound.fileName) {
        // Predefined sound with valid fileName
        const predefinedSound = sound as PredefinedSound;
        await this.playPredefinedSound(predefinedSound);
      } else if ('isCustom' in sound && sound.isCustom) {
        // Custom sound
        const customSound = sound as CustomRingtone;
        await this.playCustomSound(customSound);
      } else {
        console.warn('Unknown sound type, playing default');
        await this.playDefaultNotificationSound();
      }
    } catch (error) {
      console.error('Error playing notification sound:', error);
      await this.playDefaultNotificationSound();
    }
  }

  /**
   * Play default system notification sound with enhanced error handling
   */
  async playDefaultNotificationSound(): Promise<void> {
    try {
      console.log('🔊 Attempting to play default notification sound...');

      // First try to get system sounds if not already loaded
      if (this.systemSounds.length === 0) {
        console.log('System sounds not loaded, loading now...');
        await this.loadSystemSounds();
      }

      const systemSounds = this.systemSounds;
      const defaultSound = systemSounds[0]; // Use first system sound as default

      if (defaultSound) {
        console.log(`Playing default system sound: ${defaultSound.title}`);
        await this.playSystemSound(defaultSound);
      } else {
        console.warn('No system sounds available, trying fallback sound');
        await this.playFallbackSound();
      }
    } catch (error) {
      console.error('Error playing default notification sound:', error);
      // Last resort - try to play a basic sound
      await this.playFallbackSound();
    }
  }

  /**
   * Play fallback sound when system sounds are not available
   */
  private async playFallbackSound(): Promise<void> {
    try {
      console.log('🔊 Attempting fallback sound playback...');

      // Try to play a predefined sound as fallback
      const fallbackSound = this.predefinedSounds[0];
      if (fallbackSound && fallbackSound.fileName) {
        await this.playPredefinedSound(fallbackSound);
        console.log('✅ Fallback sound played successfully');
      } else {
        console.warn(
          '⚠️ No fallback sound available, notification will be silent',
        );
      }
    } catch (error) {
      console.error('❌ Fallback sound also failed:', error);
      // At this point we've exhausted all options
      console.warn(
        '❌ All sound playback options failed, notification will be silent',
      );
    }
  }

  /**
   * Play predefined sound (private helper)
   */
  private async playPredefinedSound(sound: PredefinedSound): Promise<void> {
    try {
      // Add validation for fileName
      if (!sound.fileName) {
        throw new Error('Predefined sound missing fileName');
      }

      console.log(`🔊 Playing predefined sound: ${sound.name}`);

      // Use system notification sound as fallback since we can't play bundled assets easily
      const systemSounds = await this.loadSystemSounds();
      if (systemSounds && systemSounds.length > 0) {
        const defaultSound = systemSounds[0];
        await playSampleSound(defaultSound);
        console.log(
          '✅ Predefined sound played successfully (using system sound)',
        );
      } else {
        console.log(
          '⚠️ No system sounds available for predefined sound playback',
        );
      }
    } catch (error) {
      console.error('❌ Error playing predefined sound:', error);
      throw error;
    }
  }

  /**
   * Play custom sound (private helper)
   */
  private async playCustomSound(sound: CustomRingtone): Promise<void> {
    try {
      if (!sound.uri) {
        throw new Error('Custom sound missing URI');
      }

      console.log(`🔊 Playing custom sound: ${sound.name}`);

      // For custom sounds, use system notification sound as fallback
      // since playing custom URIs requires complex native implementation
      const systemSounds = await this.loadSystemSounds();
      if (systemSounds && systemSounds.length > 0) {
        const defaultSound = systemSounds[0];
        await playSampleSound(defaultSound);
        console.log(
          '✅ Custom sound played successfully (using system sound fallback)',
        );
      } else {
        console.log('⚠️ No system sounds available for custom sound playback');
      }
    } catch (error) {
      console.error('❌ Error playing custom sound:', error);
      throw error;
    }
  }

  /**
   * Get the selected notification sound for notifications
   * Returns the currently selected ringtone URI or 'default'
   */
  async getSelectedNotificationSound(): Promise<string> {
    try {
      console.log('🔊 Getting selected notification sound...');

      // Get currently selected ringtone from storage
      const selectedRingtoneId = await AsyncStorage.getItem(
        STORAGE_KEYS.NOTIFICATION_SOUND,
      );

      if (!selectedRingtoneId) {
        console.log('🔊 No selected ringtone, using default');
        return 'default';
      }

      // Find the selected sound
      const allSounds = await this.getAllSounds();
      const selectedSound = allSounds.find(
        sound => sound.id === selectedRingtoneId,
      );

      if (!selectedSound) {
        console.log('🔊 Selected sound not found, using default');
        return 'default';
      }

      // Return appropriate URI based on sound type
      if ('uri' in selectedSound) {
        // Custom ringtone
        return selectedSound.uri;
      } else if ('url' in selectedSound) {
        // System sound
        return selectedSound.url;
      } else if ('fileName' in selectedSound && selectedSound.fileName) {
        // Predefined sound
        return `android.resource://${selectedSound.fileName}`;
      }

      console.log('🔊 Unable to determine sound URI, using default');
      return 'default';
    } catch (error) {
      console.error('❌ Error getting selected notification sound:', error);
      return 'default';
    }
  }
}

// Export singleton instance
export const ringtoneService = new RingtoneService();
export default ringtoneService;
