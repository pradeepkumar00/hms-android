import { NativeModules, Platform } from 'react-native';

const { DocumentScanner } = NativeModules;

export interface ScanOptions {
  pageLimit?: number;
  galleryImportAllowed?: boolean;
  scannerMode?: 'base' | 'base_with_filter' | 'full';
}

export interface ScanResult {
  uri: string;
  width: number;
  height: number;
  size: number;
  type: string;
  success: boolean;
}

export const startDocumentScan = async (options: ScanOptions = {}): Promise<ScanResult> => {
  if (Platform.OS !== 'android') {
    throw new Error('DocumentScanner is only supported on Android.');
  }
  
  if (!DocumentScanner) {
    throw new Error('Native DocumentScanner module is not registered.');
  }

  const defaultOptions: ScanOptions = {
    pageLimit: 1,
    galleryImportAllowed: true,
    scannerMode: 'base',
    ...options,
  };

  return await DocumentScanner.startScan(defaultOptions);
};
