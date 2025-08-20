import { Platform, Alert } from 'react-native';
import {
  pick,
  DocumentPickerResponse,
  errorCodes,
  isErrorWithCode,
} from '@react-native-documents/picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNFS from 'react-native-fs';
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
  soundID?: number;
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
   * Load system notification sounds from Android OS
   */
  private async loadSystemSounds(): Promise<SystemSound[]> {
    try {
      console.log('Loading Android system notification sounds...');

      if (Platform.OS !== 'android') {
        console.log('System sounds only available on Android');
        return [];
      }

      const soundsList = await NotificationSounds.getNotifications(
        'notification',
      );
      console.log(`Found ${soundsList.length} system notification sounds`);

      // Convert to our SystemSound format and limit to reasonable number
      const systemSounds: SystemSound[] = soundsList
        .slice(0, 10) // Limit to first 10 sounds to avoid overwhelming UI
        .map((sound: any, index: number) => ({
          id: `system_${index}`,
          title: sound.title || `System Sound ${index + 1}`,
          url: sound.url,
          soundID: sound.soundID,
          isSystem: true,
        }));

      this.systemSounds = systemSounds;
      return systemSounds;
    } catch (error) {
      console.error('Error loading system sounds:', error);
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
      await playSampleSound(systemSound);
    } catch (error) {
      console.error('Error playing system sound:', error);
      throw error;
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
  ): Promise<PredefinedSound | CustomRingtone | null> {
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

      if (ringtone.isCustom) {
        return (ringtone as CustomRingtone).uri;
      } else {
        // For predefined sounds, return the bundled resource URI
        const predefined = ringtone as PredefinedSound;
        if (Platform.OS === 'android') {
          return `android.resource://${this.getPackageName()}/raw/${predefined.fileName.replace(
            '.mp3',
            '',
          )}`;
        } else {
          return predefined.fileName;
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
    return 'com.octusai.hospital'; // Hospital management package name
  }

  /**
   * Validate ringtone file exists
   */
  async validateRingtoneFile(ringtone: CustomRingtone): Promise<boolean> {
    try {
      if (ringtone.uri.startsWith('file://')) {
        const filePath = ringtone.uri.replace('file://', '');
        return await RNFS.exists(filePath);
      }
      return true; // Assume other URIs are valid
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
}

// Export singleton instance
export const ringtoneService = new RingtoneService();
export default ringtoneService;
