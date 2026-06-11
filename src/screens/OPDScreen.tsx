import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  StatusBar,
  Alert,
  Modal,
  Image,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import { launchCamera, CameraOptions } from 'react-native-image-picker';
import {
  pick,
  errorCodes,
  isErrorWithCode,
} from '@react-native-documents/picker';
import { useAppSelector, selectAuthToken } from '../store';
import { theme } from '../constants/theme';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Appointment } from '../types';

interface OPDScreenProps {
  navigation: any;
  route: { params?: { appointment?: Appointment; patient?: any } };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Categories requested when loading the prescription configuration
const PRESCRIPTION_CATEGORIES =
  'DENTAL,EYE,CARDIOLOGY,DERMATOLOGY,ENT,ORTHOPEDICS,PEDIATRICS,GYNECOLOGY,NEUROLOGY,PSYCHIATRY,GENERAL_MEDICINE,PULMONOLOGY,GASTROENTEROLOGY,UROLOGY';

// DD-MM-YYYY (matches the web app's history format)
const formatDate = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}-${mm}-${d.getFullYear()}`;
};

// e.g. "10:30 PM"
const formatTime = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
};

// "Today" / "Yesterday" / "DD-MM-YYYY"
const dateGroupLabel = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '';
  const startOf = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const today = startOf(new Date());
  const that = startOf(d);
  const dayMs = 86400000;
  if (that === today) return 'Today';
  if (that === today - dayMs) return 'Yesterday';
  return formatDate(value);
};

// Show the tail of long file names: "…A7E5DE4B0.jpeg"
const shortName = (n?: string) => {
  if (!n) return '';
  return n.length > 14 ? `…${n.slice(-14)}` : n;
};

interface HistoryItem {
  id: string;
  kind: 'upload' | 'lab';
  createdAt?: string;
  category?: string;
  mimeType?: string;
  fileName?: string;
  filePath?: string;
  reportName?: string;
  uploadedBy?: string;
}

interface HistorySection {
  label: string;
  items: HistoryItem[];
}

// Flatten the no-session response into a single, date-sorted, grouped list.
const buildHistorySections = (history: any): HistorySection[] => {
  const uploads: HistoryItem[] = (history?.prescriptionUpload || []).map(
    (u: any) => ({
      id: u._id,
      kind: 'upload' as const,
      createdAt: u.createdAt,
      category: u.category,
      mimeType: u.mimeType,
      fileName: u.originalName || u.fileName,
      filePath: u.filePath,
      uploadedBy: u.uploadedBy,
    }),
  );

  const labs: HistoryItem[] = (history?.labreport || []).map((l: any) => ({
    id: l._id,
    kind: 'lab' as const,
    createdAt: l.createdAt,
    reportName: l.name,
    uploadedBy: l.createdByName,
  }));

  const all = [...uploads, ...labs].sort(
    (a, b) =>
      new Date(b.createdAt || 0).getTime() -
      new Date(a.createdAt || 0).getTime(),
  );

  const sections: HistorySection[] = [];
  for (const item of all) {
    const label = dateGroupLabel(item.createdAt);
    const last = sections[sections.length - 1];
    if (last && last.label === label) {
      last.items.push(item);
    } else {
      sections.push({ label, items: [item] });
    }
  }
  return sections;
};

const OPDScreen: React.FC<OPDScreenProps> = ({ navigation, route }) => {
  const token = useAppSelector(selectAuthToken);
  const appointment = route.params?.appointment;
  const patient = route.params?.patient;
  const patientId = appointment?.patientId || patient?._id || patient?.id;

  const [history, setHistory] = useState<any>(null);
  const [, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<{
    name: string;
    uri: string;
    type: string;
  } | null>(null);
  const [uploading, setUploading] = useState(false);
  const [showUploadModal, setShowUploadModal] = useState(false);
  // Index of the currently open file within `openableItems` (null = closed).
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  // Shared cache of upload _id -> signed URL (used by thumbnails and viewer).
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});

  const historySections = useMemo(
    () => buildHistorySections(history),
    [history],
  );

  // All openable upload files (images + PDFs) in display order — the set the
  // viewer's bottom strip pages through.
  const openableItems = useMemo(
    () =>
      historySections
        .flatMap(s => s.items)
        .filter(i => i.kind === 'upload' && i.filePath),
    [historySections],
  );

  // Fetch signed URLs for image uploads so their thumbnails show the image.
  useEffect(() => {
    if (!token || !patientId || !history) return;
    const images = (history.prescriptionUpload || []).filter(
      (u: any) => (u.mimeType || '').startsWith('image/') && u.filePath,
    );
    if (images.length === 0) return;

    let active = true;
    (async () => {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const entries = await Promise.all(
        images.map(async (u: any) => {
          try {
            const url = await realAuthService.getPatientFileSignedUrl(
              u.filePath,
              patientId,
              token,
            );
            return [u._id, url] as const;
          } catch {
            return null;
          }
        }),
      );
      if (!active) return;
      const map: Record<string, string> = {};
      for (const e of entries) if (e) map[e[0]] = e[1];
      setSignedUrls(prev => ({ ...prev, ...map }));
    })();

    return () => {
      active = false;
    };
  }, [history, token, patientId]);

  // Resolve (and cache) the signed URL for an openable item.
  const resolveSignedUrl = useCallback(
    async (item: HistoryItem): Promise<string | null> => {
      if (!item.filePath || !token || !patientId) return null;
      if (signedUrls[item.id]) return signedUrls[item.id];
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const url = await realAuthService.getPatientFileSignedUrl(
          item.filePath,
          patientId,
          token,
        );
        setSignedUrls(prev => ({ ...prev, [item.id]: url }));
        return url;
      } catch (error) {
        console.error('Failed to resolve signed URL:', error);
        return null;
      }
    },
    [signedUrls, token, patientId],
  );

  // When the viewer opens or pages to a new item, make sure its URL is loaded.
  useEffect(() => {
    if (viewerIndex == null) return;
    const item = openableItems[viewerIndex];
    if (item && !signedUrls[item.id]) {
      resolveSignedUrl(item);
    }
  }, [viewerIndex, openableItems, signedUrls, resolveSignedUrl]);

  // Patient header values (prefer the fetched patient record, fall back to appt)
  const name = patient?.name || appointment?.patientName || 'Unknown';
  const mobile = patient?.mobileNo || appointment?.mobileNo || '—';
  const uhid = patient?.uhid || appointment?.uhid || '—';
  const genderAge =
    [
      patient?.gender,
      patient?.age != null ? `${patient.age} Years` : null,
    ]
      .filter(Boolean)
      .join(' / ') || '—';

  useEffect(() => {
    let active = true;
    const load = async () => {
      if (!token) return;
      setLoading(true);
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;

        // Prescription config (used when building a new prescription)
        realAuthService
          .fetchPrescriptionConfig(PRESCRIPTION_CATEGORIES, token)
          .then(cfg => active && setConfig(cfg))
          .catch(() => {});

        // Prescription history for this patient
        const data = patientId
          ? await realAuthService
              .fetchPrescriptionHistory(patientId, 'opd', token)
              .catch(() => null)
          : null;
        if (active) setHistory(data);
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [token, patientId]);

  const headerItem = (label: string, value: string) => (
    <View style={styles.headerItem}>
      <Text style={styles.hLabel}>{label}</Text>
      <Text style={styles.hValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  const infoRow = (label: string, value: string) => (
    <Text style={styles.cardInfoLine}>
      <Text style={styles.cardInfoLabel}>{label} </Text>
      {value}
    </Text>
  );

  const renderUploadCard = (item: HistoryItem) => {
    const isImage = (item.mimeType || '').startsWith('image/');
    const thumbUri = signedUrls[item.id];
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.uploadCard}
        activeOpacity={0.7}
        onPress={() => openFile(item)}
      >
        <View style={styles.uploadCardAccent} />
        <View style={styles.uploadCardBody}>
          <View style={styles.uploadCardHeader}>
            <Text style={styles.uploadCardTitle}>Uploaded Prescription</Text>
            {!!item.category && (
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryBadgeText}>{item.category}</Text>
              </View>
            )}
          </View>

          <View style={styles.uploadCardContent}>
            <View style={styles.thumbnail}>
              {isImage && thumbUri ? (
                <Image
                  source={{ uri: thumbUri }}
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                />
              ) : (
                <>
                  <Icon
                    name={isImage ? 'image' : 'picture-as-pdf'}
                    size={40}
                    color={isImage ? theme.colors.primary : '#E53935'}
                  />
                  <Text style={styles.thumbnailLabel}>
                    {isImage ? 'IMAGE' : 'PDF'}
                  </Text>
                </>
              )}
            </View>

            <View style={styles.uploadCardInfo}>
              {infoRow('File:', shortName(item.fileName))}
              {infoRow('Date:', formatDate(item.createdAt))}
              {infoRow('Time:', formatTime(item.createdAt))}
              {infoRow('Uploaded By:', item.uploadedBy || '—')}
            </View>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderLabCard = (item: HistoryItem) => (
    <View key={item.id} style={styles.labCard}>
      <View style={styles.labBadge}>
        <Text style={styles.labBadgeText}>Lab report</Text>
      </View>
      {infoRow('Report:', item.reportName || '—')}
      {infoRow('Date:', formatDate(item.createdAt))}
      {infoRow('Time:', formatTime(item.createdAt))}
    </View>
  );

  const handleCameraCapture = () => {
    const options: CameraOptions = {
      mediaType: 'photo',
      includeBase64: false,
      saveToPhotos: false,
      quality: 0.8 as any,
    };
    launchCamera(options, response => {
      if (response.didCancel) return;
      if (response.errorMessage) {
        console.error('Camera error:', response.errorMessage);
        Alert.alert('Camera Error', 'Failed to capture image. Please try again.');
        return;
      }
      if (response.assets && response.assets.length > 0) {
        const asset = response.assets[0];
        setSelectedFile({
          name: asset.fileName || `prescription_${Date.now()}.jpg`,
          uri: asset.uri || '',
          type: asset.type || 'image/jpeg',
        });
      }
    });
  };

  const handleFilePick = async () => {
    try {
      const result = await pick({ type: ['image/*', 'application/pdf'] });
      if (result && result.length > 0) {
        const file = result[0];
        setSelectedFile({
          name: file.name || 'Prescription file',
          uri: file.uri || '',
          type: file.type || 'application/octet-stream',
        });
      }
    } catch (error) {
      if (
        isErrorWithCode(error) &&
        error.code === errorCodes.OPERATION_CANCELED
      ) {
        return;
      }
      console.error('File picker error:', error);
      Alert.alert('Error', 'Failed to select file. Please try again.');
    }
  };

  const handleSelectCamera = () => {
    setShowUploadModal(false);
    handleCameraCapture();
  };

  const handleSelectFile = () => {
    setShowUploadModal(false);
    handleFilePick();
  };

  const handleRemoveFile = () => setSelectedFile(null);

  const openFile = (item: HistoryItem) => {
    if (!item.filePath) return;
    const index = openableItems.findIndex(i => i.id === item.id);
    if (index >= 0) setViewerIndex(index);
  };

  const handleUpload = async () => {
    if (!selectedFile || !token) return;
    if (!patientId) {
      Alert.alert('Upload Failed', 'No patient is associated with this visit.');
      return;
    }

    setUploading(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      await realAuthService.uploadPatientFile(
        selectedFile,
        patientId,
        'prescription',
        token,
      );

      setSelectedFile(null);
      Alert.alert('Success', 'Prescription uploaded successfully.');

      // Refresh the prescription history to reflect the new upload.
      const data = await realAuthService
        .fetchPrescriptionHistory(patientId, 'opd', token)
        .catch(() => null);
      setHistory(data);
    } catch (error) {
      console.error('Prescription upload error:', error);
      Alert.alert(
        'Upload Failed',
        'Could not upload the prescription. Please try again.',
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor={theme.colors.primary}
      />

      {/* Top app header: back button (left) + OPD title (center) */}
      <SafeAreaView edges={['top']} style={styles.appBarSafe}>
        <View style={styles.appBar}>
          <TouchableOpacity
            style={styles.appBarSide}
            activeOpacity={0.7}
            onPress={() => navigation.goBack()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="arrow-back" size={24} color={theme.colors.surface} />
          </TouchableOpacity>
          <Text style={styles.appBarTitle}>OPD</Text>
          <View style={styles.appBarSide} />
        </View>
      </SafeAreaView>

      {/* Patient header */}
      <View style={styles.header}>
        <View style={styles.headerGrid}>
          <View style={styles.headerCol}>
            {headerItem('Name:', name)}
            {headerItem('Mobile No:', mobile)}
          </View>
          <View style={styles.headerCol}>
            {headerItem('UHID:', uhid)}
            {headerItem('Gender/Age:', genderAge)}
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content}>
        {/* Upload prescription */}
        <TouchableOpacity
          style={styles.uploadBtn}
          activeOpacity={0.8}
          onPress={() => setShowUploadModal(true)}
        >
          <Icon name="upload-file" size={20} color={theme.colors.surface} />
          <Text style={styles.uploadText}>Upload Prescription</Text>
        </TouchableOpacity>

        {selectedFile && (
          <>
            <View style={styles.selectedFileRow}>
              <Icon
                name="insert-drive-file"
                size={20}
                color={theme.colors.primary}
              />
              <Text style={styles.selectedFileName} numberOfLines={1}>
                {selectedFile.name}
              </Text>
              <TouchableOpacity
                onPress={handleRemoveFile}
                disabled={uploading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="close" size={20} color={theme.colors.error} />
              </TouchableOpacity>
            </View>

            <TouchableOpacity
              style={[styles.confirmBtn, uploading && styles.confirmBtnDisabled]}
              activeOpacity={0.8}
              onPress={handleUpload}
              disabled={uploading}
            >
              {uploading ? (
                <ActivityIndicator size="small" color={theme.colors.surface} />
              ) : (
                <>
                  <Icon
                    name="cloud-upload"
                    size={20}
                    color={theme.colors.surface}
                  />
                  <Text style={styles.uploadText}>Upload</Text>
                </>
              )}
            </TouchableOpacity>
          </>
        )}

        {/* Prescriptions & Labs history */}
        <Text style={styles.historyTitle}>Prescriptions &amp; Labs</Text>
        {loading ? (
          <ActivityIndicator
            style={styles.historyLoader}
            color={theme.colors.primary}
          />
        ) : historySections.length === 0 ? (
          <Text style={styles.emptyText}>
            No prescriptions found for this patient
          </Text>
        ) : (
          historySections.map(section => (
            <View key={section.label} style={styles.historySection}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionLabelPill}>
                  <Text style={styles.sectionLabelText}>{section.label}</Text>
                </View>
                <View style={styles.sectionDivider} />
              </View>
              {section.items.map(item =>
                item.kind === 'upload'
                  ? renderUploadCard(item)
                  : renderLabCard(item),
              )}
            </View>
          ))
        )}
      </ScrollView>

      {/* Upload source modal */}
      <Modal
        visible={showUploadModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowUploadModal(false)}
      >
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={() => setShowUploadModal(false)}
        >
          <View style={styles.uploadModalContainer}>
            <TouchableOpacity activeOpacity={1} onPress={e => e.stopPropagation()}>
              <View style={styles.uploadModalContent}>
                <View style={styles.uploadModalHeader}>
                  <Text style={styles.uploadModalTitle}>Upload Prescription</Text>
                  <TouchableOpacity onPress={() => setShowUploadModal(false)}>
                    <Icon name="close" size={24} color={theme.colors.text} />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.uploadOption}
                  activeOpacity={0.7}
                  onPress={handleSelectCamera}
                >
                  <View style={styles.uploadOptionIcon}>
                    <Icon
                      name="photo-camera"
                      size={24}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={styles.uploadOptionTextWrap}>
                    <Text style={styles.uploadOptionTitle}>Camera</Text>
                    <Text style={styles.uploadOptionSubtitle}>
                      Take a photo of the prescription
                    </Text>
                  </View>
                  <Icon
                    name="chevron-right"
                    size={24}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.uploadOption}
                  activeOpacity={0.7}
                  onPress={handleSelectFile}
                >
                  <View style={styles.uploadOptionIcon}>
                    <Icon
                      name="folder"
                      size={24}
                      color={theme.colors.primary}
                    />
                  </View>
                  <View style={styles.uploadOptionTextWrap}>
                    <Text style={styles.uploadOptionTitle}>File Manager</Text>
                    <Text style={styles.uploadOptionSubtitle}>
                      Choose an image or PDF file
                    </Text>
                  </View>
                  <Icon
                    name="chevron-right"
                    size={24}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
              </View>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* In-app file viewer with a bottom strip to move between prescriptions */}
      <Modal
        visible={viewerIndex != null}
        animationType="slide"
        onRequestClose={() => setViewerIndex(null)}
      >
        {(() => {
          const current =
            viewerIndex != null ? openableItems[viewerIndex] : undefined;
          const currentUrl = current ? signedUrls[current.id] : undefined;
          const isPdf = (current?.mimeType || '').includes('pdf');
          return (
            <SafeAreaView
              edges={['top', 'bottom']}
              style={styles.viewerContainer}
            >
              <View style={styles.viewerHeader}>
                <TouchableOpacity
                  onPress={() => setViewerIndex(null)}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.viewerTitle} numberOfLines={1}>
                  {current?.fileName || 'File'}
                </Text>
                <Text style={styles.viewerCount}>
                  {viewerIndex != null ? viewerIndex + 1 : 0}/
                  {openableItems.length}
                </Text>
              </View>

              <View style={styles.viewerBody}>
                {!currentUrl ? (
                  <ActivityIndicator
                    size="large"
                    color={theme.colors.surface}
                  />
                ) : isPdf ? (
                  <Pdf
                    key={current?.id}
                    source={{ uri: currentUrl, cache: true }}
                    trustAllCerts={false}
                    style={styles.viewerPdf}
                    onError={err => {
                      console.error('PDF render error:', err);
                    }}
                  />
                ) : (
                  <ScrollView
                    style={styles.viewerImageScroll}
                    contentContainerStyle={styles.viewerImageContent}
                    maximumZoomScale={4}
                    minimumZoomScale={1}
                    centerContent
                  >
                    <Image
                      source={{ uri: currentUrl }}
                      style={styles.viewerImage}
                      resizeMode="contain"
                    />
                  </ScrollView>
                )}
              </View>

              {/* Bottom glider: thumbnails of all prescriptions */}
              {openableItems.length > 1 && (
                <View style={styles.gliderContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.gliderContent}
                  >
                    {openableItems.map((it, idx) => {
                      const itIsImage = (it.mimeType || '').startsWith('image/');
                      const itUri = signedUrls[it.id];
                      const active = idx === viewerIndex;
                      return (
                        <TouchableOpacity
                          key={it.id}
                          activeOpacity={0.8}
                          onPress={() => setViewerIndex(idx)}
                          style={[
                            styles.gliderThumb,
                            active && styles.gliderThumbActive,
                          ]}
                        >
                          {itIsImage && itUri ? (
                            <Image
                              source={{ uri: itUri }}
                              style={styles.gliderThumbImage}
                              resizeMode="cover"
                            />
                          ) : (
                            <Icon
                              name={itIsImage ? 'image' : 'picture-as-pdf'}
                              size={26}
                              color={itIsImage ? theme.colors.primary : '#E53935'}
                            />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </SafeAreaView>
          );
        })()}
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  appBarSafe: {
    backgroundColor: theme.colors.primary,
  },
  appBar: {
    height: theme.headerHeight,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    elevation: 4,
  },
  appBarSide: {
    width: 40,
    alignItems: 'flex-start',
    justifyContent: 'center',
  },
  appBarTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  header: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerGrid: {
    flexDirection: 'row',
  },
  headerCol: {
    flex: 1,
  },
  headerItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.xs,
  },
  hLabel: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginRight: theme.spacing.xs,
  },
  hValue: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
  },
  content: {
    padding: theme.spacing.md,
    paddingBottom: theme.spacing.xxl,
  },
  uploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: theme.colors.primary,
    ...theme.shadows.sm,
  },
  uploadText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
    marginLeft: theme.spacing.sm,
  },
  selectedFileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  selectedFileName: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginHorizontal: theme.spacing.sm,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.lg,
    backgroundColor: '#4CAF50',
    ...theme.shadows.sm,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  uploadModalContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingBottom: 20,
  },
  uploadModalContent: {
    padding: theme.spacing.lg,
  },
  uploadModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.lg,
    paddingBottom: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  uploadModalTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.spacing.md,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.sm,
  },
  uploadOptionIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
  },
  uploadOptionTextWrap: {
    flex: 1,
  },
  uploadOptionTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  uploadOptionSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  historyTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  historyLoader: {
    marginTop: theme.spacing.lg,
  },
  emptyText: {
    textAlign: 'center',
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.xxl,
  },
  historySection: {
    marginBottom: theme.spacing.md,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.md,
  },
  sectionLabelPill: {
    backgroundColor: '#E8EAF6',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.md,
  },
  sectionLabelText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textSecondary,
  },
  sectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: theme.spacing.md,
  },
  // Shared info lines (File: / Date: / Time: / Uploaded By:)
  cardInfoLine: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
  },
  cardInfoLabel: {
    fontWeight: theme.typography.fontWeights.bold,
  },
  // Uploaded prescription card
  uploadCard: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  uploadCardAccent: {
    width: 5,
    backgroundColor: theme.colors.primary,
  },
  uploadCardBody: {
    flex: 1,
    padding: theme.spacing.md,
  },
  uploadCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.md,
  },
  uploadCardTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  categoryBadge: {
    backgroundColor: '#E8EAF6',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 2,
    paddingHorizontal: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
  },
  categoryBadgeText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
  },
  uploadCardContent: {
    flexDirection: 'row',
  },
  thumbnail: {
    width: 96,
    height: 96,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.md,
    overflow: 'hidden',
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  thumbnailLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    marginTop: 4,
  },
  uploadCardInfo: {
    flex: 1,
  },
  // Lab report card
  labCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
    ...theme.shadows.sm,
  },
  labBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#E8EAF6',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: theme.spacing.xs,
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  labBadgeText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  // In-app file viewer
  viewerContainer: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  viewerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  viewerTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginLeft: theme.spacing.md,
  },
  viewerCount: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.sm,
  },
  viewerBody: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewerPdf: {
    flex: 1,
    width: SCREEN_WIDTH,
    backgroundColor: '#525659',
  },
  viewerImageScroll: {
    flex: 1,
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  viewerImageContent: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  viewerImage: {
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.8,
  },
  // Bottom glider strip
  gliderContainer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  gliderContent: {
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  gliderThumb: {
    width: 56,
    height: 56,
    borderRadius: theme.borderRadius.md,
    borderWidth: 2,
    borderColor: 'transparent',
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    overflow: 'hidden',
  },
  gliderThumbActive: {
    borderColor: theme.colors.primary,
  },
  gliderThumbImage: {
    width: '100%',
    height: '100%',
  },
});

export default OPDScreen;
