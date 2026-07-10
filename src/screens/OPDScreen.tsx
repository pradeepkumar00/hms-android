import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  StatusBar,
  Alert,
  Modal,
  Image,
  Dimensions,
  Platform,
  TextInput,
  Pressable,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import Pdf from 'react-native-pdf';
import { launchCamera, CameraOptions } from 'react-native-image-picker';
import {
  pick,
  types,
  errorCodes,
  isErrorWithCode,
} from '@react-native-documents/picker';
import { useAppSelector, selectAuthToken, selectManageServices, selectAppDataLoading, selectCurrentUser } from '../store';
import ReactNativeBlobUtil from 'react-native-blob-util';
import { startDocumentScan } from '../services/documentScannerService';
import { getFileTypeIcon } from '../utils/fileTypeIcon.util';
import type { TreatmentPlanRecord } from '../components';
import { extractAppointmentTreatments } from '../utils/appointmentTreatments';
import { theme } from '../constants/theme';
import { ModalBackdrop, OPDActionsFab, PinchZoomView, SlotPickerGrid, TreatmentPlanCard, TreatmentPlanDrawer, CustomBookingTimeFields, MonthCalendarPickerModal } from '../components';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { Appointment } from '../types';
import {
  collectSelectedFollowupDetails,
  mapCatalogTreatments,
  mapPlanGroups,
  type FollowupPlanGroup,
  type FollowupTreatmentOption,
} from '../utils/followupTreatments';
import { BookableSlot, isSlotSelectable } from '../utils/slot.util';
import { isSlotBookingMode, isCustomBookingMode, resolveCustomBookingDuration } from '../utils/doctorBookingMode.util';
import {
  collectUploadFileParts,
  isImageUploadPart,
  viewerPartKey,
} from '../utils/uploadFileParts.util';
import { layoutUploadViewerImage } from '../utils/uploadViewerImageLayout.util';
import { filterManageServicesByType } from '../utils/manageServices';
import {
  canDeleteUpload,
  canManageTreatmentPlan,
} from '../utils/accessControl';

interface OPDScreenProps {
  navigation: any;
  route: {
    params?: {
      appointment?: Appointment;
      patient?: any;
      openFollowup?: boolean;
      followupLinkedTreatments?: Array<{ treatmentDesc: string; date?: string }>;
    };
  };
}

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

// Categories requested when loading the prescription configuration
const PRESCRIPTION_CATEGORIES =
  'DENTAL,EYE,CARDIOLOGY,DERMATOLOGY,ENT,ORTHOPEDICS,PEDIATRICS,GYNECOLOGY,NEUROLOGY,PSYCHIATRY,GENERAL_MEDICINE,PULMONOLOGY,GASTROENTEROLOGY,UROLOGY';

// A doctor record from GET /users?type=doctor
interface Doctor {
  _id: string;
  name: string;
  doctorCode?: string | null;
  bookingMode?: string;
  color?: string | null;
}

// A bookable slot from GET /slot
interface Slot extends BookableSlot {}

// YYYY-MM-DD in local time (the format the slot/booking APIs expect).
const toApiDate = (d: Date) => {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

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

// Fallback MIME lookup for when the document picker doesn't report a type.
const MIME_BY_EXT: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  gif: 'image/gif',
  bmp: 'image/bmp',
  webp: 'image/webp',
  heic: 'image/heic',
  heif: 'image/heif',
  pdf: 'application/pdf',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  csv: 'text/csv',
  rtf: 'application/rtf',
  zip: 'application/zip',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  wav: 'audio/wav',
  m4a: 'audio/x-m4a',
};

const guessMimeType = (name?: string | null): string | undefined => {
  if (!name) return undefined;
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match ? MIME_BY_EXT[match[1]] : undefined;
};

// Clean a display file name: drop a stray "null"/"undefined" prefix that some
// uploads carry (e.g. "null-20260701-WA0003.jpg") and fall back gracefully.
const displayFileName = (name?: string | null, fallback = 'File'): string => {
  const trimmed = (name || '').trim();
  if (!trimmed || /^(null|undefined)$/i.test(trimmed)) return fallback;
  const cleaned = trimmed.replace(/^(null|undefined)[-_\s]+/i, '').trim();
  return cleaned || fallback;
};

// Resolve the file parts for a history item. HistoryItems carry the full list
// in `fileParts`; only the first file lives on the top-level `filePath`, so we
// must NOT rely on collectUploadFileParts(item) here (it would report 1 file
// for a multi-file batch). Falls back to the flattener for raw upload rows.
const getItemParts = (item: any): any[] => {
  if (Array.isArray(item?.fileParts) && item.fileParts.length) {
    return item.fileParts;
  }
  return collectUploadFileParts(item);
};

interface HistoryItem {
  id: string;
  kind: 'upload' | 'lab' | 'appointment' | 'treatmentPlan';
  uploadType?: string;
  createdAt?: string;
  category?: string;
  mimeType?: string;
  fileName?: string;
  filePath?: string;
  fileCount?: number;
  batchParentId?: string;
  reportName?: string;
  uploadedBy?: string;
  appointmentDate?: string;
  appointmentTime?: string | null;
  slot?: number | null;
  visitType?: string;
  doctorName?: string;
  status?: string;
  remark?: string;
  details?: Appointment['details'];
  sortAt?: number;
  treatmentPlan?: TreatmentPlanRecord;
  fileParts?: Array<{
    filePath: string;
    fileName?: string;
    originalName?: string;
    mimeType?: string;
  }>;
}

const parseApptTime = (time?: string | null): number | null => {
  if (!time) return null;
  const m = time.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let hours = parseInt(m[1], 10);
  const minutes = parseInt(m[2], 10);
  const meridiem = m[3]?.toUpperCase();
  if (meridiem === 'PM' && hours < 12) hours += 12;
  if (meridiem === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
};

const appointmentSortAt = (appt: Appointment): number => {
  if (!appt.date) return 0;
  const [y, m, d] = appt.date.split('-').map(Number);
  if (!y || !m || !d) return new Date(appt.date).getTime() || 0;
  const minutes = parseApptTime(appt.time) ?? 0;
  return new Date(y, m - 1, d, Math.floor(minutes / 60), minutes % 60).getTime();
};

// DD/MM/YYYY for appointment cards (matches the web OPD timeline)
const formatApptDate = (value?: string) => {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split('-');
    return `${d}/${m}/${y}`;
  }
  return formatDate(value);
};

const formatVisitType = (value?: string) => {
  if (!value) return '—';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase());
};

const formatApptToken = (slot?: number | null) => {
  if (slot == null) return '—';
  return `T${slot}`;
};

const getApptStatusColor = (status?: string) => {
  switch ((status || '').toLowerCase()) {
    case 'waiting':
      return '#FF9800';
    case 'confirmed':
      return '#2196F3';
    case 'arrived':
      return '#9C27B0';
    case 'completed':
      return '#4CAF50';
    case 'scheduled':
      return 'rgba(255,255,255,0.25)';
    case 'cancelled':
    case 'canceled':
      return '#F44336';
    default:
      return theme.colors.textSecondary;
  }
};

const getApptStatusLabel = (status?: string) => {
  if (!status) return 'Unknown';
  return status.charAt(0).toUpperCase() + status.slice(1);
};

const itemGroupLabel = (item: HistoryItem) => {
  if (item.kind === 'appointment' && item.appointmentDate) {
    return dateGroupLabel(`${item.appointmentDate}T12:00:00`);
  }
  return dateGroupLabel(item.createdAt);
};

const itemSortAt = (item: HistoryItem) => {
  if (item.sortAt != null) return item.sortAt;
  return new Date(item.createdAt || 0).getTime();
};

const kindOrder = (kind: HistoryItem['kind']) => {
  switch (kind) {
    case 'upload':
    case 'treatmentPlan':
      return 0;
    case 'lab':
      return 1;
    case 'appointment':
      return 2;
    default:
      return 3;
  }
};

// Prescriptions/labs first, then appointments; newest first within each type.
const compareHistoryItems = (a: HistoryItem, b: HistoryItem) => {
  const kindDiff = kindOrder(a.kind) - kindOrder(b.kind);
  if (kindDiff !== 0) return kindDiff;
  return itemSortAt(b) - itemSortAt(a);
};

// Flatten prescriptions, labs, appointments, and treatment plans into a date-sorted timeline.
const buildHistorySections = (
  history: any,
  appointments: Appointment[] = [],
  treatmentPlans: TreatmentPlanRecord[] = [],
): HistorySection[] => {
  const uploads: HistoryItem[] = (history?.prescriptionUpload || []).map(
    (u: any) => {
      const parts = collectUploadFileParts(u);
      const first = parts[0];
      return {
        id: u._id,
        batchParentId: u._id,
        kind: 'upload' as const,
        uploadType: u.type,
        createdAt: u.createdAt,
        category: u.category,
        mimeType: first?.mimeType ?? u.mimeType,
        fileName:
          parts.length > 1
            ? `${parts.length} files`
            : first?.originalName || first?.fileName || u.originalName || u.fileName,
        filePath: first?.filePath ?? u.filePath,
        fileCount: parts.length || 1,
        fileParts: parts.map((p: any) => ({
          filePath: p.filePath,
          fileName: p.fileName,
          originalName: p.originalName,
          mimeType: p.mimeType,
        })),
        uploadedBy: u.uploadedBy,
        status: u.status,
      };
    },
  );

  const labs: HistoryItem[] = (history?.labreport || []).map((l: any) => ({
    id: l._id,
    kind: 'lab' as const,
    createdAt: l.createdAt,
    reportName: l.name,
    uploadedBy: l.createdByName,
  }));

  const appts: HistoryItem[] = appointments.map(appt => ({
    id: appt._id,
    kind: 'appointment' as const,
    createdAt: appt.date ? `${appt.date}T12:00:00` : undefined,
    appointmentDate: appt.date,
    appointmentTime: appt.time,
    slot: appt.tokenCount,
    visitType: appt.visitType,
    doctorName: appt.doctorName,
    status: appt.status,
    remark: appt.remark,
    details: appt.details,
    sortAt: appointmentSortAt(appt),
  }));

  const plans: HistoryItem[] = treatmentPlans.map((plan, index) => ({
    id: plan._id || `plan-${index}`,
    kind: 'treatmentPlan' as const,
    createdAt: plan.createdAt || plan.updatedAt,
    treatmentPlan: plan,
  }));

  const all = [...uploads, ...labs, ...appts, ...plans];

  const byLabel = new Map<string, HistoryItem[]>();
  for (const item of all) {
    const label = itemGroupLabel(item);
    if (!label) continue;
    const group = byLabel.get(label) || [];
    group.push(item);
    byLabel.set(label, group);
  }

  return Array.from(byLabel.entries())
    .map(([label, items]) => ({
      label,
      items: [...items].sort(compareHistoryItems),
      sectionSortAt: Math.max(...items.map(itemSortAt), 0),
    }))
    .sort((a, b) => b.sectionSortAt - a.sectionSortAt)
    .map(({ label, items }) => ({ label, items }));
};

interface HistorySection {
  label: string;
  items: HistoryItem[];
}

type UploadFileType = 'prescription' | 'procedure' | 'lab';

const uploadApiType = (kind: UploadFileType): string => {
  if (kind === 'procedure') return 'note';
  if (kind === 'lab') return 'lab';
  return 'prescription';
};

const uploadKindLabel = (kind: UploadFileType): string => {
  if (kind === 'procedure') return 'Procedure';
  if (kind === 'lab') return 'Lab / Investigation';
  return 'Prescription';
};

const mapTeethForPlan = (selectedTeeth: number[]) => {
  const Upper = selectedTeeth
    .filter(
      t =>
        (t >= 11 && t <= 28) ||
        (t >= 51 && t <= 55) ||
        (t >= 61 && t <= 65),
    )
    .sort((a, b) => a - b);
  const Lower = selectedTeeth
    .filter(
      t =>
        (t >= 31 && t <= 48) ||
        (t >= 71 && t <= 75) ||
        (t >= 81 && t <= 85),
    )
    .sort((a, b) => a - b);
  const teeth: { Upper?: number[]; Lower?: number[] } = {};
  if (Upper.length) teeth.Upper = Upper;
  if (Lower.length) teeth.Lower = Lower;
  return teeth;
};

const OPDScreen: React.FC<OPDScreenProps> = ({ navigation, route }) => {
  const insets = useSafeAreaInsets();
  const followupScrollRef = React.useRef<ScrollView>(null);
  const token = useAppSelector(selectAuthToken);
  const currentUser = useAppSelector(selectCurrentUser);
  const canManageTreatmentPlanAccess = useMemo(
    () => canManageTreatmentPlan(currentUser),
    [currentUser],
  );
  const canDeleteUploadAccess = useMemo(
    () => canDeleteUpload(currentUser),
    [currentUser],
  );
  const manageServiceRecords = useAppSelector(selectManageServices);
  const appDataLoading = useAppSelector(selectAppDataLoading);
  const appointment = route.params?.appointment;
  const initialPatient = route.params?.patient;
  const patientId = appointment?.patientId || initialPatient?._id || initialPatient?.id;
  const [patientRecord, setPatientRecord] = useState<any>(initialPatient || null);

  const [history, setHistory] = useState<any>(null);
  const [patientAppointments, setPatientAppointments] = useState<Appointment[]>(
    [],
  );
  const [, setConfig] = useState<any>(null);
  const [deleteGroupModalOpen, setDeleteGroupModalOpen] = useState(false);
  const [deleteGroupParent, setDeleteGroupParent] = useState<any>(null);
  const [deleteGroupParts, setDeleteGroupParts] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<
    Array<{ name: string; uri: string; type: string }>
  >([]);
  const [uploading, setUploading] = useState(false);
  const [uploadFileType, setUploadFileType] =
    useState<UploadFileType>('prescription');
  const [showUploadModal, setShowUploadModal] = useState(false);
  // Prescription category for the file being uploaded.
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [categoryDropdownOpen, setCategoryDropdownOpen] = useState(false);
  // Index of the currently open file within `openableItems` (null = closed).
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  /** Clockwise rotation for the image viewer; resets when switching files. */
  const [viewerRotation, setViewerRotation] = useState(0);
  const [viewerZoom, setViewerZoom] = useState(1);
  const [viewerImageNatural, setViewerImageNatural] = useState({ w: 0, h: 0 });
  const [viewerBodySize, setViewerBodySize] = useState({
    w: SCREEN_WIDTH,
    h: Math.round(SCREEN_HEIGHT * 0.55),
  });
  const viewerImageLayout = useMemo(() => {
    const naturalW = viewerImageNatural.w || SCREEN_WIDTH;
    const naturalH = viewerImageNatural.h || Math.round(SCREEN_HEIGHT * 0.7);
    return layoutUploadViewerImage(
      naturalW,
      naturalH,
      Math.max(1, viewerBodySize.w - 16),
      Math.max(1, viewerBodySize.h - 16),
      viewerRotation,
    );
  }, [viewerImageNatural, viewerBodySize, viewerRotation]);

  const resetViewerImageState = () => {
    setViewerImageNatural({ w: 0, h: 0 });
    setViewerRotation(0);
    setViewerZoom(1);
  };

  const primeViewerImageSize = (uri: string) => {
    Image.getSize(
      uri,
      (width, height) => setViewerImageNatural({ w: width, h: height }),
      () => setViewerImageNatural({ w: SCREEN_WIDTH, h: Math.round(SCREEN_HEIGHT * 0.7) }),
    );
  };
  const VIEWER_MIN_ZOOM = 0.5;
  const VIEWER_MAX_ZOOM = 4;
  const VIEWER_ZOOM_STEP = 0.25;
  // Shared cache of upload _id -> signed URL (used by thumbnails and viewer).
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [deletingFileId, setDeletingFileId] = useState<string | null>(null);
  const [downloadingFileId, setDownloadingFileId] = useState<string | null>(null);
  const [selectedBatchItem, setSelectedBatchItem] = useState<HistoryItem | null>(null);

  // ── Book Follow-up modal ──────────────────────────────────────────────────
  // The doctor is chosen from a dropdown, defaulting to the OPD visit's doctor
  // (taken from the screen props).
  const [showFollowupModal, setShowFollowupModal] = useState(false);
  const [followupDate, setFollowupDate] = useState<Date | null>(null);
  const [showFollowupDatePicker, setShowFollowupDatePicker] = useState(false);
  const [doctors, setDoctors] = useState<Doctor[]>([]);
  const [doctorsLoading, setDoctorsLoading] = useState(false);
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null);
  const [doctorDropdownOpen, setDoctorDropdownOpen] = useState(false);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [slotPickerOpen, setSlotPickerOpen] = useState(false);
  const [booking, setBooking] = useState(false);
  const [customStartTime, setCustomStartTime] = useState('');
  const [customDurationMinutes, setCustomDurationMinutes] = useState('');
  const [customBookingErrors, setCustomBookingErrors] = useState<{ startTime?: string; duration?: string } | null>(null);
  const [followupCatalogTreatments, setFollowupCatalogTreatments] = useState<
    FollowupTreatmentOption[]
  >([]);
  const [followupPlanGroups, setFollowupPlanGroups] = useState<
    FollowupPlanGroup[]
  >([]);
  const [followupTreatmentsLoading, setFollowupTreatmentsLoading] =
    useState(false);
  const [selectedFollowupTreatmentKeys, setSelectedFollowupTreatmentKeys] =
    useState<Set<string>>(new Set());
  const [followupTreatmentDropdownOpen, setFollowupTreatmentDropdownOpen] =
    useState(false);
  const [followupTreatmentSearch, setFollowupTreatmentSearch] = useState('');
  const [followupRemark, setFollowupRemark] = useState('');
  const [treatmentPlanOpen, setTreatmentPlanOpen] = useState(false);
  const [editingTreatmentPlan, setEditingTreatmentPlan] =
    useState<TreatmentPlanRecord | null>(null);
  const [treatmentPlans, setTreatmentPlans] = useState<TreatmentPlanRecord[]>(
    [],
  );
  const [editingRemarkId, setEditingRemarkId] = useState<string | null>(null);
  const [remarkDraft, setRemarkDraft] = useState('');
  const [savingRemarkId, setSavingRemarkId] = useState<string | null>(null);

  const historySections = useMemo(
    () => buildHistorySections(history, patientAppointments, treatmentPlans),
    [history, patientAppointments, treatmentPlans],
  );

  // All viewable file parts (including nested batch `files[]`) for the viewer strip.
  const openableItems = useMemo(() => {
    const items: HistoryItem[] = [];
    for (const u of history?.prescriptionUpload || []) {
      for (const part of collectUploadFileParts(u)) {
        const key = viewerPartKey(part);
        if (!key) continue;
        items.push({
          id: key,
          batchParentId: u._id,
          kind: 'upload',
          uploadType: u.type,
          createdAt: u.createdAt,
          category: u.category,
          mimeType: part.mimeType,
          fileName: part.originalName || part.fileName,
          filePath: part.filePath,
          uploadedBy: u.uploadedBy,
          status: u.status,
          sortAt: new Date(u.createdAt || 0).getTime(),
        });
      }
    }
    return items.sort((a, b) => (b.sortAt || 0) - (a.sortAt || 0));
  }, [history]);

  // Bottom strip: always show every patient file, not just the selected card's
  // batch, so the user can jump to any file from the viewer.
  const viewerStripItems = useMemo(() => {
    if (viewerIndex == null) return [];
    return openableItems.length > 1 ? openableItems : [];
  }, [viewerIndex, openableItems]);

  // Fetch signed URLs for image file parts so thumbnails show in cards and strip.
  useEffect(() => {
    if (!token || !patientId || !history) return;
    const images = (history.prescriptionUpload || []).flatMap((u: any) =>
      collectUploadFileParts(u).filter((part: any) => isImageUploadPart(part)),
    );
    if (images.length === 0) return;

    let active = true;
    (async () => {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const entries = await Promise.all(
        images.map(async (part: any) => {
          try {
            const key = viewerPartKey(part);
            const url = await realAuthService.getPatientFileSignedUrl(
              part.filePath,
              patientId,
              token,
            );
            return [key, url] as const;
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
      if (signedUrls[item.filePath]) return signedUrls[item.filePath];
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const url = await realAuthService.getPatientFileSignedUrl(
          item.filePath,
          patientId,
          token,
        );
        setSignedUrls(prev => ({ ...prev, [item.filePath!]: url }));
        return url;
      } catch (error) {
        console.error('Failed to resolve signed URL:', error);
        return null;
      }
    },
    [signedUrls, token, patientId],
  );

  const handleDirectDownload = async (item: HistoryItem) => {
    const parts = getItemParts(item);
    if (parts.length === 0) return;
    
    setDownloadingFileId(item.id || item.filePath || 'downloading');
    try {
      for (const part of parts) {
        if (!part.filePath) continue;
        
        const tempItem: HistoryItem = { ...item, filePath: part.filePath };
        const url = await resolveSignedUrl(tempItem);
        if (!url) {
          Alert.alert('Error', `Unable to resolve download URL for ${part.originalName || 'file'}.`);
          continue;
        }

        const { dirs } = ReactNativeBlobUtil.fs;
        const cleanFileName = (part.originalName || part.fileName || item.fileName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_');
        const destPath = Platform.OS === 'android'
          ? `${dirs.DownloadDir}/${cleanFileName}`
          : `${dirs.DocumentDir}/${cleanFileName}`;

        let mimeType = part.mimeType || item.mimeType || '';
        if (!mimeType || mimeType === 'application/octet-stream') {
          const guessed = guessMimeType(cleanFileName);
          if (guessed) {
            mimeType = guessed;
          }
        }
        if (!mimeType) {
          mimeType = 'application/octet-stream';
        }

        if (Platform.OS === 'android') {
          const res = await ReactNativeBlobUtil.config({
            fileCache: true,
          }).fetch('GET', url);
          try {
            await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
              {
                name: cleanFileName,
                parentFolder: '',
                mimeType: mimeType,
              },
              'Download',
              res.path()
            );
          } catch (copyErr) {
            console.warn('copyToMediaStore failed, trying fallback:', copyErr);
            await ReactNativeBlobUtil.fs.cp(res.path(), destPath);
          } finally {
            try {
              await ReactNativeBlobUtil.fs.unlink(res.path());
            } catch {}
          }
        } else {
          const res = await ReactNativeBlobUtil.config({
            fileCache: true,
            path: destPath,
          }).fetch('GET', url);
          ReactNativeBlobUtil.ios.openDocument(res.data);
        }
      }
      Alert.alert('Success', 'File downloaded successfully.');
    } catch (err) {
      console.error('Download error:', err);
      Alert.alert('Error', 'Failed to download file.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  const handlePartDownload = async (item: HistoryItem, part: any) => {
    if (!part.filePath) return;
    setDownloadingFileId(item.id || item.filePath || 'downloading');
    try {
      const tempItem: HistoryItem = { ...item, filePath: part.filePath };
      const url = await resolveSignedUrl(tempItem);
      if (!url) {
        Alert.alert('Error', 'Unable to resolve download URL.');
        return;
      }
      const { dirs } = ReactNativeBlobUtil.fs;
      const cleanFileName = (part.originalName || part.fileName || 'file').replace(/[^a-zA-Z0-9.-]/g, '_');
      const destPath = Platform.OS === 'android'
        ? `${dirs.DownloadDir}/${cleanFileName}`
        : `${dirs.DocumentDir}/${cleanFileName}`;

      let mimeType = part.mimeType || item.mimeType || '';
      if (!mimeType || mimeType === 'application/octet-stream') {
        const guessed = guessMimeType(cleanFileName);
        if (guessed) {
          mimeType = guessed;
        }
      }
      if (!mimeType) {
        mimeType = 'application/octet-stream';
      }

      if (Platform.OS === 'android') {
        const res = await ReactNativeBlobUtil.config({
          fileCache: true,
        }).fetch('GET', url);
        try {
          await ReactNativeBlobUtil.MediaCollection.copyToMediaStore(
            {
              name: cleanFileName,
              parentFolder: '',
              mimeType: mimeType,
            },
            'Download',
            res.path()
          );
        } catch (copyErr) {
          console.warn('copyToMediaStore failed, trying fallback:', copyErr);
          await ReactNativeBlobUtil.fs.cp(res.path(), destPath);
        } finally {
          try {
            await ReactNativeBlobUtil.fs.unlink(res.path());
          } catch {}
        }
      } else {
        const res = await ReactNativeBlobUtil.config({
          fileCache: true,
          path: destPath,
        }).fetch('GET', url);
        ReactNativeBlobUtil.ios.openDocument(res.data);
      }
      Alert.alert('Success', 'File downloaded successfully.');
    } catch (err) {
      console.error('Download error:', err);
      Alert.alert('Error', 'Failed to download file.');
    } finally {
      setDownloadingFileId(null);
    }
  };

  // When the viewer opens or pages to a new item, load URL and image dimensions.
  useEffect(() => {
    if (viewerIndex == null) return;
    const item = openableItems[viewerIndex];
    if (!item?.filePath) return;

    setViewerImageNatural({ w: 0, h: 0 });
    setViewerRotation(0);
    setViewerZoom(1);

    const url = signedUrls[item.filePath];
    if (!url) {
      resolveSignedUrl(item);
      return;
    }
    if (isImageUploadPart(item)) {
      primeViewerImageSize(url);
    }
  }, [viewerIndex, openableItems, signedUrls, resolveSignedUrl]);

  // Patient header values (prefer the fetched patient record, fall back to appt)
  const name = patientRecord?.name || appointment?.patientName || 'Unknown';
  const mobile = patientRecord?.mobileNo || appointment?.mobileNo || '—';
  const uhid = patientRecord?.uhid || appointment?.uhid || '—';
  const genderAge =
    [
      patientRecord?.gender,
      patientRecord?.age != null ? `${patientRecord.age} Years` : null,
    ]
      .filter(Boolean)
      .join(' / ') || '—';

  const refreshPatientRecord = useCallback(async () => {
    if (!token || !patientId) return;
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const full = await realAuthService.fetchPatientById(String(patientId), token);
      if (full) setPatientRecord(full);
    } catch (err) {
      console.error('Failed to refresh patient record:', err);
    }
  }, [token, patientId]);

  useFocusEffect(
    useCallback(() => {
      refreshPatientRecord();
    }, [refreshPatientRecord]),
  );

  const handleEditPatient = async () => {
    if (!patientId || !token) return;
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const full =
        patientRecord ||
        (await realAuthService.fetchPatientById(String(patientId), token));
      navigation.navigate('AddPatient', {
        patientData: {
          ...(full || {}),
          _id: String(patientId),
          name: full?.name || name,
          mobileNo: full?.mobileNo || mobile,
          uhid: full?.uhid || uhid,
        },
      });
    } catch (err) {
      Alert.alert(
        'Edit Patient',
        err instanceof Error ? err.message : 'Could not open patient editor.',
      );
    }
  };

  // Only DENTAL is offered for prescription uploads.
  const categoryOptions = useMemo(() => ['DENTAL'], []);

  // Default the category to the first option once files are chosen (not for lab).
  useEffect(() => {
    if (selectedFiles.length === 0) return;
    if (uploadFileType === 'lab') {
      setSelectedCategory('COMMON');
      return;
    }
    if (!selectedCategory && categoryOptions.length) {
      setSelectedCategory(categoryOptions[0]);
    }
  }, [selectedFiles, selectedCategory, categoryOptions, uploadFileType]);

  // The visit's doctor from props — used as the dropdown's default selection.
  const defaultDoctor: Doctor | null = useMemo(() => {
    if (!appointment?.doctorId) return null;
    return {
      _id: appointment.doctorId,
      name: appointment.doctorName || appointment.doctorCode || 'Doctor',
      doctorCode: appointment.doctorCode,
    };
  }, [appointment]);

  const openFollowupModal = () => {
    setFollowupDate(null);
    setSelectedSlot(null);
    setSlots([]);
    setSlotPickerOpen(false);
    setDoctorDropdownOpen(false);
    setFollowupTreatmentDropdownOpen(false);
    setFollowupTreatmentSearch('');
    setFollowupRemark('');
    setSelectedFollowupTreatmentKeys(new Set());
    setSelectedDoctor(defaultDoctor);
    setShowFollowupModal(true);
  };

  useEffect(() => {
    if (route.params?.openFollowup) {
      openFollowupModal();
      navigation.setParams({ openFollowup: undefined });
    }
  }, [route.params?.openFollowup]);

  const followupPlanTreatmentOptions = useMemo(
    () => followupPlanGroups.flatMap(group => group.treatments),
    [followupPlanGroups],
  );

  const hasAssignedFollowupTreatments = followupPlanGroups.length > 0;

  const filteredFollowupPlanGroups = useMemo(() => {
    const query = followupTreatmentSearch.trim().toLowerCase();
    if (!query) return followupPlanGroups;
    return followupPlanGroups
      .map(group => ({
        ...group,
        treatments: group.treatments.filter(treatment =>
          treatment.treatmentDesc.toLowerCase().includes(query),
        ),
      }))
      .filter(group => group.treatments.length > 0);
  }, [followupPlanGroups, followupTreatmentSearch]);

  const filteredFollowupCatalogTreatments = useMemo(() => {
    const query = followupTreatmentSearch.trim().toLowerCase();
    if (!query) return followupCatalogTreatments;
    return followupCatalogTreatments.filter(treatment =>
      treatment.treatmentDesc.toLowerCase().includes(query),
    );
  }, [followupCatalogTreatments, followupTreatmentSearch]);

  const selectedFollowupTreatmentSummaries = useMemo(() => {
    const selected = new Set(selectedFollowupTreatmentKeys);
    return [
      ...followupPlanTreatmentOptions.filter(item => selected.has(item.key)),
      ...followupCatalogTreatments.filter(item => selected.has(item.key)),
    ];
  }, [
    selectedFollowupTreatmentKeys,
    followupPlanTreatmentOptions,
    followupCatalogTreatments,
  ]);

  const toggleFollowupTreatment = (key: string) => {
    setSelectedFollowupTreatmentKeys(prev => {
      const next = new Set(prev);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
      }
      return next;
    });
  };

  const followupTreatmentTriggerLabel = useMemo(() => {
    const count = selectedFollowupTreatmentKeys.size;
    if (count === 0) {
      return hasAssignedFollowupTreatments || followupCatalogTreatments.length
        ? 'Select treatments…'
        : 'No treatments available';
    }
    if (count === 1) {
      return selectedFollowupTreatmentSummaries[0]?.treatmentDesc || '1 treatment';
    }
    return `${count} treatments selected`;
  }, [
    selectedFollowupTreatmentKeys.size,
    selectedFollowupTreatmentSummaries,
    hasAssignedFollowupTreatments,
    followupCatalogTreatments.length,
  ]);

  // Sync follow-up treatments from cached manage-service and treatment plans.
  useEffect(() => {
    if (!showFollowupModal) return;

    setFollowupPlanGroups(mapPlanGroups(treatmentPlans));
    setFollowupCatalogTreatments(
      mapCatalogTreatments(
        filterManageServicesByType(manageServiceRecords, 'treatment'),
        'opd',
      ),
    );
    setFollowupTreatmentsLoading(appDataLoading && manageServiceRecords.length === 0);
  }, [
    showFollowupModal,
    treatmentPlans,
    manageServiceRecords,
    appDataLoading,
  ]);

  // Load the doctor list the first time the modal is opened.
  useEffect(() => {
    if (!showFollowupModal || !token || doctors.length > 0) return;
    let active = true;
    (async () => {
      setDoctorsLoading(true);
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const list = await realAuthService.fetchDoctors(token);
        if (!active) return;
        setDoctors(list);
        // Default to the visit's doctor (match the list entry so we get its
        // full record), falling back to the props doctor or first in the list.
        const match = defaultDoctor
          ? list.find((d: Doctor) => d._id === defaultDoctor._id)
          : undefined;
        setSelectedDoctor(match || defaultDoctor || list[0] || null);
      } catch {
        if (active) Alert.alert('Error', 'Could not load doctors.');
      } finally {
        if (active) setDoctorsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showFollowupModal, token, doctors.length, defaultDoctor]);

  // Load slots whenever a slot-enabled doctor and date are both selected.
  useEffect(() => {
    if (!showFollowupModal || !token || !selectedDoctor || !followupDate) {
      return;
    }
    if (!isSlotBookingMode(selectedDoctor)) {
      setSlots([]);
      setSelectedSlot(null);
      setSlotsLoading(false);
      return;
    }
    let active = true;
    (async () => {
      setSlotsLoading(true);
      setSlots([]);
      setSelectedSlot(null);
      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;
        const list = await realAuthService.fetchDoctorSlots(
          selectedDoctor._id,
          toApiDate(followupDate),
          token,
        );
        if (active) setSlots(list);
      } catch {
        if (active) Alert.alert('Error', 'Could not load slots.');
      } finally {
        if (active) setSlotsLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [showFollowupModal, token, selectedDoctor, followupDate]);

  // Initialize custom booking defaults when doctor changes
  useEffect(() => {
    if (!showFollowupModal || !selectedDoctor) {
      setCustomStartTime('');
      setCustomDurationMinutes('');
      setCustomBookingErrors(null);
      return;
    }
    if (isCustomBookingMode(selectedDoctor)) {
      const d = resolveCustomBookingDuration(selectedDoctor);
      setCustomDurationMinutes(String(d));
      setCustomStartTime('');
    } else {
      setCustomStartTime('');
      setCustomDurationMinutes('');
    }
  }, [showFollowupModal, selectedDoctor]);

  // Open the slot picker once doctor and date are set and slots have loaded.
  useEffect(() => {
    if (
      !showFollowupModal ||
      !selectedDoctor ||
      !followupDate ||
      !isSlotBookingMode(selectedDoctor) ||
      slotsLoading
    ) {
      return;
    }
    setSlotPickerOpen(true);
  }, [
    showFollowupModal,
    selectedDoctor,
    followupDate,
    slotsLoading,
  ]);

  const handleBookFollowup = async () => {
    if (!followupDate) {
      Alert.alert('Missing date', 'Please pick a follow-up date.');
      return;
    }
    if (!selectedDoctor) {
      Alert.alert('Missing doctor', 'Please select a doctor.');
      return;
    }
    if (isSlotBookingMode(selectedDoctor) && !selectedSlot) {
      Alert.alert('Missing slot', 'Please pick a slot for the follow-up.');
      return;
    }
    if (
      isSlotBookingMode(selectedDoctor) &&
      selectedSlot &&
      !isSlotSelectable(selectedSlot)
    ) {
      Alert.alert('Slot unavailable', 'Please pick an available slot.');
      return;
    }

    // If doctor uses custom booking mode, require custom start time & duration
    if (isCustomBookingMode(selectedDoctor)) {
      const errors: { startTime?: string; duration?: string } = {};
      if (!customStartTime || !customStartTime.trim()) {
        errors.startTime = 'Please select a start time';
      }
      if (!customDurationMinutes || Number(customDurationMinutes) <= 0) {
        errors.duration = 'Please choose a valid duration';
      }
      if (Object.keys(errors).length) {
        setCustomBookingErrors(errors);
        Alert.alert('Missing details', 'Please select a start time and duration for custom booking.');
        return;
      }
      setCustomBookingErrors(null);
    }
    const followupDetails = collectSelectedFollowupDetails(
      selectedFollowupTreatmentKeys,
      followupPlanGroups,
      followupCatalogTreatments,
      followupDate ? toApiDate(followupDate) : null,
    );
    // Treatment selection is optional for followup booking

    if (!patientId) {
      Alert.alert('Booking Failed', 'No patient is associated with this visit.');
      return;
    }
    if (!token) return;

    setBooking(true);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const payload: any = {
        doctorId: selectedDoctor._id,
        doctorName: selectedDoctor.name,
        patientId,
        date: toApiDate(followupDate),
        details: followupDetails.length ? followupDetails : undefined,
        remark: followupRemark,
      };
      if (isSlotBookingMode(selectedDoctor)) {
        payload.appointmentTime = selectedSlot?.startTime;
        payload.tokenCount = selectedSlot?.tokenCount;
      } else if (isCustomBookingMode(selectedDoctor)) {
        payload.appointmentTime = customStartTime;
        payload.duration = Number(customDurationMinutes) || undefined;
      }

      const result = await realAuthService.bookFollowupToken(payload, token);

      const tokenNumber =
        result?.tokenCount ??
        result?.tokenNumber ??
        result?.token ??
        selectedSlot?.tokenCount;

      setShowFollowupModal(false);
      Alert.alert(
        'Follow-up booked',
        `Token No: ${tokenNumber ?? '—'}\nDoctor: ${
          selectedDoctor.name
        }\nDate: ${formatDate(followupDate.toISOString())}${
          selectedSlot?.startTime ? `\nTime: ${selectedSlot.startTime}` : ''
        }`,
      );

      if (patientId) {
        const { appointments } = await realAuthService
          .fetchPatientAppointments(patientId, token)
          .catch(() => ({ appointments: [] }));
        setPatientAppointments(appointments || []);
      }
    } catch (error) {
      console.error('Follow-up booking error:', error);
      Alert.alert(
        'Booking Failed',
        'Could not book the follow-up. Please try again.',
      );
    } finally {
      setBooking(false);
    }
  };

  const loadOpdData = useCallback(
    async (options?: { showInitialLoader?: boolean }) => {
      if (!token) return;

      const showInitialLoader = options?.showInitialLoader ?? false;
      if (showInitialLoader) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }

      try {
        const realAuthService = (await import('../services/realAuthService'))
          .default;

        realAuthService
          .fetchPrescriptionConfig(PRESCRIPTION_CATEGORIES, token)
          .then(cfg => setConfig(cfg))
          .catch(() => {});

        const [data, appts, plans] = await Promise.all([
          patientId
            ? realAuthService
                .fetchPrescriptionHistory(patientId, 'opd', token)
                .catch(() => null)
            : Promise.resolve(null),
          patientId
            ? realAuthService
                .fetchPatientAppointments(patientId, token)
                .then(result => result.appointments)
                .catch(() => [])
            : Promise.resolve([]),
          patientId
            ? realAuthService
                .fetchTreatmentPlans(patientId, token, 'opd')
                .catch(() => [])
            : Promise.resolve([]),
        ]);

        setHistory(data);
        setPatientAppointments(appts || []);
        setTreatmentPlans(plans || []);
      } finally {
        if (showInitialLoader) {
          setLoading(false);
        } else {
          setRefreshing(false);
        }
      }
    },
    [token, patientId],
  );

  useEffect(() => {
    loadOpdData({ showInitialLoader: true });
  }, [loadOpdData]);

  const onRefresh = useCallback(() => {
    loadOpdData({ showInitialLoader: false });
  }, [loadOpdData]);

  const refreshPrescriptionHistory = useCallback(async () => {
    if (!token || !patientId) return;
    const realAuthService = (await import('../services/realAuthService')).default;
    const data = await realAuthService
      .fetchPrescriptionHistory(patientId, 'opd', token)
      .catch(() => null);
    setHistory(data);
  }, [token, patientId]);

  const refreshTreatmentPlans = useCallback(async () => {
    if (!token || !patientId) return;
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      const plans = await realAuthService.fetchTreatmentPlans(
        patientId,
        token,
        'opd',
      );
      setTreatmentPlans(plans || []);
    } catch (error) {
      console.error('Treatment plans refresh error:', error);
    }
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

  const metaField = (
    label: string,
    value: string,
    variant: 'primary' | 'muted' = 'primary',
  ) => (
    <View style={styles.metaField}>
      <Text
        style={[
          styles.metaLabel,
          variant === 'muted' && styles.metaLabelMuted,
        ]}
      >
        {label}
      </Text>
      <Text style={styles.metaValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );

  const renderUploadGridCell = (
    part: NonNullable<HistoryItem['fileParts']>[number],
    item: HistoryItem,
    index: number,
  ) => {
    const partIsImage = isImageUploadPart(part);
    const uri = part.filePath ? signedUrls[part.filePath] : undefined;
    const name = part.originalName || part.fileName || '';
    const fileIcon = getFileTypeIcon(part.mimeType, name);
    const removing =
      !!part.filePath &&
      deletingFileId === `${item.batchParentId || item.id}:${part.filePath}`;

    return (
      <View
        key={part.filePath || `part-${index}`}
        style={styles.uploadGridCellWrap}
      >
        <TouchableOpacity
          style={styles.uploadGridCell}
          activeOpacity={0.8}
          onPress={() => openFile(item, part.filePath)}
        >
          {partIsImage && uri ? (
            <Image
              source={{ uri }}
              style={styles.uploadGridCellImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.uploadGridCellFallback}>
              <Icon name={fileIcon.icon} size={14} color={fileIcon.color} />
              <Text style={styles.uploadGridCellExt}>{fileIcon.label}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>
    );
  };
  const handlePrintPress = (item: HistoryItem) => {
    if (getItemParts(item).length > 1) {
      setSelectedBatchItem(item);
    } else {
      openFile(item);
    }
  };

  const handleDownloadPress = (item: HistoryItem) => {
    if (getItemParts(item).length > 1) {
      setSelectedBatchItem(item);
    } else {
      handleDirectDownload(item);
    }
  };

  const handleDeletePress = (item: HistoryItem) => {
    if (getItemParts(item).length > 1) {
      setSelectedBatchItem(item);
    } else {
      onDeletePress(item);
    }
  };

  const renderUploadCard = (item: HistoryItem) => {
    const isLab = item.uploadType === 'lab';
    const isProcedure = item.uploadType === 'note';
    const fileIcon = getFileTypeIcon(item.mimeType, item.fileName);
    const isImage = fileIcon.isImage;
    const thumbUri = item.filePath ? signedUrls[item.filePath] : undefined;
    const displayDate = formatDate(item.createdAt).replace(/-/g, '/');
    const categoryLabel = item.category?.trim();
    const badgeText =
      categoryLabel && categoryLabel !== 'COMMON' ? categoryLabel : undefined;
    const multiFile = (item.fileCount || 1) > 1;
    const uploadTitle = isLab
      ? 'Uploaded Lab / Investigation'
      : isProcedure
        ? 'Uploaded Procedure'
        : 'Uploaded Prescription';
    const defaultFileName = isLab
      ? 'Lab file'
      : isProcedure
        ? 'Procedure file'
        : 'Prescription file';

    return (
      <View key={item.id} style={styles.styledUploadCard}>
        <View
          style={[
            styles.styledUploadHeader,
            isLab
              ? styles.styledUploadHeaderLab
              : isProcedure
                ? styles.styledUploadHeaderProcedure
                : styles.styledUploadHeaderPrescription,
          ]}
        >
          <View style={styles.styledUploadHeaderLeft}>
            <Icon name="upload-file" size={16} color={theme.colors.surface} />
            <Text style={styles.styledUploadHeaderTitle}>{uploadTitle}</Text>
          </View>
          {!!badgeText && (
            <View style={styles.styledUploadBadge}>
              <Text style={styles.styledUploadBadgeText}>{badgeText}</Text>
            </View>
          )}
        </View>

        <View
          style={[
            styles.styledUploadPanel,
            isLab
              ? styles.styledUploadPanelLab
              : isProcedure
                ? styles.styledUploadPanelProcedure
                : styles.styledUploadPanelPrescription,
          ]}
        >
          {multiFile ? (
            <>
              <View style={styles.styledUploadMetaRow}>
                <View style={styles.styledUploadMetaItem}>
                  <Text style={styles.styledUploadMetaLabel}>DATE</Text>
                  <Text style={styles.styledUploadMetaValue}>{displayDate}</Text>
                </View>
                <View style={styles.styledUploadMetaItem}>
                  <Text style={styles.styledUploadMetaLabel}>BY</Text>
                  <Text style={styles.styledUploadMetaValue} numberOfLines={1}>
                    {item.uploadedBy || '—'}
                  </Text>
                </View>
                <View style={styles.styledUploadMetaItem}>
                  <Text style={styles.styledUploadMetaLabel}>FILES</Text>
                  <Text style={styles.styledUploadMetaValue}>{item.fileCount}</Text>
                </View>
              </View>

              <View style={styles.uploadFilesGrid}>
                {(item.fileParts || []).map((part, index) =>
                  renderUploadGridCell(part, item, index),
                )}
              </View>
            </>
          ) : (
            <View style={styles.styledUploadContent}>
              <TouchableOpacity
                style={styles.styledUploadThumbnail}
                activeOpacity={0.8}
                onPress={() => openFile(item)}
              >
                {isImage && thumbUri ? (
                  <Image
                    source={{ uri: thumbUri }}
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                  />
                ) : (
                  <>
                    <Icon name={fileIcon.icon} size={28} color={fileIcon.color} />
                    <Text style={styles.styledUploadThumbnailLabel}>
                      {fileIcon.label}
                    </Text>
                  </>
                )}
              </TouchableOpacity>

              <View style={styles.styledUploadInfo}>
                <TouchableOpacity activeOpacity={0.7} onPress={() => openFile(item)}>
                  <Text style={styles.styledUploadFileName} numberOfLines={2}>
                    {displayFileName(item.fileName, defaultFileName)}
                  </Text>
                </TouchableOpacity>
                <View style={styles.styledUploadMetaRow}>
                  <View style={styles.styledUploadMetaItem}>
                    <Text style={styles.styledUploadMetaLabel}>DATE</Text>
                    <Text style={styles.styledUploadMetaValue}>{displayDate}</Text>
                  </View>
                  <View style={styles.styledUploadMetaItem}>
                    <Text style={styles.styledUploadMetaLabel}>BY</Text>
                    <Text style={styles.styledUploadMetaValue} numberOfLines={1}>
                      {item.uploadedBy || '—'}
                    </Text>
                  </View>
                </View>
              </View>
            </View>
          )}

          <View style={styles.styledUploadActions}>
            <TouchableOpacity
              style={[styles.styledUploadActionBtn, styles.styledUploadActionPrint]}
              activeOpacity={0.85}
              onPress={() => handlePrintPress(item)}
            >
              <Icon name="print" size={16} color="#6366F1" />
              <Text style={styles.styledUploadActionText}>Print</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.styledUploadActionBtn,
                styles.styledUploadActionDownload,
              ]}
              activeOpacity={0.85}
              disabled={downloadingFileId === (item.id || item.filePath)}
              onPress={() => handleDownloadPress(item)}
            >
              {downloadingFileId === (item.id || item.filePath) ? (
                <ActivityIndicator size="small" color="#6366F1" />
              ) : (
                <>
                  <Icon name="file-download" size={16} color="#6366F1" />
                  <Text style={styles.styledUploadActionText}>Download</Text>
                </>
              )}
            </TouchableOpacity>
            {canDeleteUploadAccess ? (
              <TouchableOpacity
                style={[styles.styledUploadActionBtn, styles.styledUploadActionDelete]}
                activeOpacity={0.85}
                disabled={deletingFileId === (item.batchParentId || item.id)}
                onPress={() => handleDeletePress(item)}
              >
                {deletingFileId === (item.batchParentId || item.id) ? (
                  <ActivityIndicator size="small" color="#EF4444" />
                ) : (
                  <>
                    <Icon name="delete-outline" size={16} color="#374151" />
                    <Text style={styles.styledUploadActionDeleteText}>Delete</Text>
                  </>
                )}
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </View>
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

  const openRemarkEditor = (item: HistoryItem) => {
    setEditingRemarkId(item.id);
    setRemarkDraft(item.remark || '');
  };

  const cancelRemarkEditor = () => {
    setEditingRemarkId(null);
    setRemarkDraft('');
  };

  const handleSaveAppointmentRemark = async (appointmentId: string) => {
    if (!token) {
      Alert.alert('Save Failed', 'Your session has expired. Please log in again.');
      return;
    }

    setSavingRemarkId(appointmentId);
    try {
      const realAuthService = (await import('../services/realAuthService')).default;
      await realAuthService.saveAppointmentRemark(
        appointmentId,
        remarkDraft.trim(),
        token,
      );
      setPatientAppointments(prev =>
        prev.map(appt =>
          appt._id === appointmentId
            ? { ...appt, remark: remarkDraft.trim() }
            : appt,
        ),
      );
      cancelRemarkEditor();
    } catch (error) {
      console.error('Appointment remark save error:', error);
      Alert.alert('Save Failed', 'Could not save the appointment remark.');
    } finally {
      setSavingRemarkId(null);
    }
  };

  const renderAppointmentCard = (item: HistoryItem) => {
    const statusColor = getApptStatusColor(item.status);
    const isEditingRemark = editingRemarkId === item.id;
    const isSavingRemark = savingRemarkId === item.id;
    const savedRemark = (item.remark || '').trim();
    const treatments = extractAppointmentTreatments({
      details: item.details,
      date: item.appointmentDate,
    });

    return (
      <View key={item.id} style={styles.apptCard}>
        <View style={styles.historyCardHeader}>
          <View style={styles.apptCardHeaderLeft}>
            <Icon name="event" size={18} color={theme.colors.surface} />
            <Text style={[styles.historyCardHeaderTitle, styles.apptHeaderTitle]}>
              Appointment
            </Text>
          </View>
          <View
            style={[styles.apptStatusBadge, { backgroundColor: statusColor }]}
          >
            <Text style={styles.apptStatusText}>
              {getApptStatusLabel(item.status)}
            </Text>
          </View>
        </View>

        <View style={styles.apptCardBody}>
          <View style={styles.apptCardGrid}>
            <View style={styles.apptGridCell}>
              {metaField('DATE', formatApptDate(item.appointmentDate))}
            </View>
            <View style={styles.apptGridCell}>
              {metaField('TIME', item.appointmentTime || '—')}
            </View>
            <View style={styles.apptGridCell}>
              {metaField('TOKEN', formatApptToken(item.slot))}
            </View>
            <View style={styles.apptGridCell}>
              {metaField('VISIT', formatVisitType(item.visitType))}
            </View>
            <View style={styles.apptGridCell}>
              {metaField('DOCTOR', item.doctorName || '—')}
            </View>
          </View>

          {treatments.length > 0 ? (
            <View style={styles.apptTreatmentBlock}>
              <Text style={styles.apptTreatmentLabel}>TREATMENTS</Text>
              {treatments.map((treatment, index) => (
                <View key={`${item.id}-treatment-${index}`} style={styles.apptTreatmentItem}>
                  <Text style={styles.apptTreatmentName} numberOfLines={2}>
                    {treatment.treatmentDesc}
                  </Text>
                  {treatment.date ? (
                    <Text style={styles.apptTreatmentDate}>
                      {formatApptDate(treatment.date)}
                    </Text>
                  ) : null}
                </View>
              ))}
            </View>
          ) : null}

          <View style={styles.apptRemarkBox}>
            <View style={styles.apptRemarkHeader}>
              <Text style={styles.apptRemarkLabel}>REMARK</Text>
              {!isEditingRemark && (
                <TouchableOpacity
                  style={styles.apptRemarkAddBtn}
                  activeOpacity={0.85}
                  onPress={() => openRemarkEditor(item)}
                >
                  <Text style={styles.apptRemarkAddText}>
                    {savedRemark ? 'Edit' : 'Add'}
                  </Text>
                </TouchableOpacity>
              )}
            </View>

            {isEditingRemark ? (
              <>
                <TextInput
                  style={styles.apptRemarkInput}
                  value={remarkDraft}
                  onChangeText={setRemarkDraft}
                  placeholder="Add appointment remark..."
                  placeholderTextColor={theme.colors.textSecondary}
                  multiline
                  editable={!isSavingRemark}
                  textAlignVertical="top"
                />
                <View style={styles.apptRemarkActions}>
                  <TouchableOpacity
                    style={[styles.apptRemarkBtn, styles.apptRemarkCancelBtn]}
                    activeOpacity={0.85}
                    disabled={isSavingRemark}
                    onPress={cancelRemarkEditor}
                  >
                    <Text style={styles.apptRemarkCancelText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.apptRemarkBtn, styles.apptRemarkSaveBtn]}
                    activeOpacity={0.85}
                    disabled={isSavingRemark}
                    onPress={() => handleSaveAppointmentRemark(item.id)}
                  >
                    {isSavingRemark ? (
                      <ActivityIndicator size="small" color={theme.colors.surface} />
                    ) : (
                      <Text style={styles.apptRemarkSaveText}>Save</Text>
                    )}
                  </TouchableOpacity>
                </View>
              </>
            ) : savedRemark ? (
              <Text style={styles.apptRemarkText}>{savedRemark}</Text>
            ) : (
              <Text style={styles.apptRemarkEmpty}>No remark added yet</Text>
            )}
          </View>
        </View>
      </View>
    );
  };

  const renderHistoryItem = (item: HistoryItem) => {
    if (item.kind === 'upload') return renderUploadCard(item);
    if (item.kind === 'appointment') return renderAppointmentCard(item);
    if (item.kind === 'treatmentPlan' && item.treatmentPlan) {
      return (
        <TreatmentPlanCard
          key={item.id}
          plan={item.treatmentPlan}
          patientId={patientId}
          canManage={canManageTreatmentPlanAccess}
          onEdit={handleEditTreatmentPlan}
          onCancelled={refreshTreatmentPlans}
        />
      );
    }
    return renderLabCard(item);
  };

  const openUploadModal = (type: UploadFileType) => {
    setUploadFileType(type);
    setSelectedCategory(type === 'lab' ? 'COMMON' : null);
    setCategoryDropdownOpen(false);
    setShowUploadModal(true);
  };

  const handleCameraCapture = async () => {
    if (Platform.OS === 'android') {
      try {
        // Gallery import lets the user pick an existing photo and still get the
        // same automatic edge-detection + manual crop before it is uploaded.
        const result = await startDocumentScan({ galleryImportAllowed: true });
        if (result.success && result.uri) {
          setSelectedFiles(prev => [
            ...prev,
            {
              name: `scan_${Date.now()}.jpg`,
              uri: result.uri,
              type: result.type || 'image/jpeg',
            },
          ]);
        }
      } catch (err) {
        if (err instanceof Error && err.message.toLowerCase().includes('cancel')) {
          return;
        }
        console.error('Document scanner error:', err);
        Alert.alert('Scanner Error', 'Failed to scan document.');
      }
      return;
    }

    const options: CameraOptions = {
      mediaType: 'photo',
      includeBase64: false,
      saveToPhotos: false,
      quality: 0.8 as any,
      maxWidth: 2048,
      maxHeight: 2048,
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
        setSelectedFiles(prev => [
          ...prev,
          {
            name: asset.fileName || `prescription_${Date.now()}.jpg`,
            uri: asset.uri || '',
            type: asset.type || 'image/jpeg',
          },
        ]);
      }
    });
  };

  const handleFilePick = async () => {
    try {
      // Allow any file type: images, PDFs, and documents (DOC/DOCX/XLS/etc.)
      // are uploaded directly without cropping.
      const result = await pick({
        type: [types.allFiles],
        allowMultiSelection: true,
        copyTo: 'cachesDirectory',
      });
      if (result && result.length > 0) {
        const picked = result.map(file => ({
          name: file.name || 'Upload file',
          uri: file.fileCopyUri || file.uri || '',
          type: file.type || guessMimeType(file.name) || 'application/octet-stream',
        }));
        setSelectedFiles(prev => [...prev, ...picked]);
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

  const handleRemoveFile = (index?: number) => {
    if (uploading) return;
    if (index == null) {
      setSelectedFiles([]);
      setSelectedCategory(null);
      setCategoryDropdownOpen(false);
      setUploadFileType('prescription');
      return;
    }
    setSelectedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const closeTreatmentPlanDrawer = () => {
    setTreatmentPlanOpen(false);
    setEditingTreatmentPlan(null);
  };

  const handleTreatmentPlanPress = () => {
    if (!canManageTreatmentPlanAccess) return;
    setEditingTreatmentPlan(null);
    setTreatmentPlanOpen(true);
  };

  useEffect(() => {
    const uploadType = route.params?.openUpload;
    if (uploadType) {
      openUploadModal(uploadType);
      navigation.setParams({ openUpload: undefined });
    }
  }, [route.params?.openUpload]);

  useEffect(() => {
    if (route.params?.openTreatmentPlan && canManageTreatmentPlanAccess) {
      handleTreatmentPlanPress();
      navigation.setParams({ openTreatmentPlan: undefined });
    }
  }, [route.params?.openTreatmentPlan, canManageTreatmentPlanAccess]);

  const handleEditTreatmentPlan = (plan: TreatmentPlanRecord) => {
    if (!canManageTreatmentPlanAccess) return;
    setEditingTreatmentPlan(plan);
    setTreatmentPlanOpen(true);
  };

  const handleSaveTreatmentPlan = async (payload: {
    treatments: Array<{
      treatmentName: string;
      serviceId?: string;
      amountPerTooth: string;
      selectedTeeth: number[];
      note: string;
      followUpDate: Date;
    }>;
    paidAmount: number;
    discount: number;
    paymentMode: string;
    refId: string;
    remark: string;
    totalAmount: number;
    advanced: boolean;
    planId?: string;
  }) => {
    if (!token || !patientId) {
      Alert.alert(
        'Save Failed',
        'Patient or session information is missing.',
      );
      throw new Error('Missing patient or token');
    }

    const validRows = payload.treatments.filter(row => row.treatmentName.trim());
    const title = validRows[0]?.treatmentName.trim() || 'Treatment Plan';

    const items = validRows.map(row => {
      const treatmentAmount = Number(row.amountPerTooth) || 0;
      const qty = row.selectedTeeth.length;
      const expenseAmount = treatmentAmount * qty;

      const item: Record<string, unknown> = {
        treatmentDesc: row.treatmentName.trim(),
        isAdvanced: payload.advanced,
        teeth: mapTeethForPlan(row.selectedTeeth),
        description: row.note.trim(),
        qty,
        appointment: toApiDate(row.followUpDate),
        treatmentAmount,
        expenseAmount,
        paidAmount: 0,
        discount: 0,
      };

      if (row.serviceId) {
        item.manageServiceId = row.serviceId;
      }

      return item;
    });

    const body = {
      patientId,
      patientName: name,
      title,
      items,
      totalAmount: payload.totalAmount,
      paidAmount: payload.paidAmount,
      discount: payload.discount,
      paymentMode: payload.paymentMode.toLowerCase(),
      remark:
        payload.remark.trim() ||
        validRows
          .map(row => row.note.trim())
          .filter(Boolean)
          .join('; ') ||
        '',
      refId: payload.refId,
      doctorId: appointment?.doctorId || '',
      doctorName: appointment?.doctorName || defaultDoctor?.name || '',
      uhid: uhid === '—' ? '' : String(uhid),
      type: 'opd',
      noSession: true,
      patientType: 'opd',
    };

    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      if (payload.planId) {
        await realAuthService.updateTreatmentPlan(payload.planId, body, token);
        Alert.alert('Success', 'Treatment plan updated.');
      } else {
        await realAuthService.saveTreatmentPlan(body, token);
        Alert.alert('Success', 'Treatment plan saved.');
      }
      await refreshTreatmentPlans();
      closeTreatmentPlanDrawer();
    } catch (error) {
      console.error('Treatment plan save error:', error);
      Alert.alert(
        'Save Failed',
        payload.planId
          ? 'Could not update the treatment plan. Please try again.'
          : 'Could not save the treatment plan. Please try again.',
      );
      throw error;
    }
  };

  const closeFileViewer = () => {
    setViewerIndex(null);
    resetViewerImageState();
  };

  const zoomViewerIn = () => {
    setViewerZoom(prev =>
      Math.min(VIEWER_MAX_ZOOM, Math.round((prev + VIEWER_ZOOM_STEP) * 100) / 100),
    );
  };

  const zoomViewerOut = () => {
    setViewerZoom(prev =>
      Math.max(VIEWER_MIN_ZOOM, Math.round((prev - VIEWER_ZOOM_STEP) * 100) / 100),
    );
  };

  const rotateViewerImage = () => {
    setViewerRotation(prev => (prev + 90) % 360);
    setViewerZoom(1);
  };

  const openFile = (item: HistoryItem, filePath?: string) => {
    const targetPath = filePath || item.filePath;
    if (!targetPath) return;
    const index = openableItems.findIndex(
      i => i.filePath === targetPath || i.id === targetPath,
    );
    if (index >= 0) {
      resetViewerImageState();
      setViewerIndex(index);
    }
  };

  const onDeletePress = (item: HistoryItem) => {
    const parts = getItemParts(item);
    if (parts.length > 1) {
      setDeleteGroupParent(item);
      setDeleteGroupParts(parts);
      setDeleteGroupModalOpen(true);
    } else {
      handleDeletePrescription(item, parts[0]);
    }
  };

  const handleDeletePrescription = (
    item: HistoryItem,
    part?: NonNullable<HistoryItem['fileParts']>[number],
  ) => {
    if (!token || !patientId || deletingFileId) return;

    const multiFile = (item.fileCount || 1) > 1;
    const partialDelete = multiFile && !!part?.filePath;

    const deleteLabel =
      item.uploadType === 'lab'
        ? partialDelete ? 'Remove lab file' : 'Delete lab file'
        : item.uploadType === 'note'
          ? partialDelete ? 'Remove procedure file' : 'Delete procedure'
          : partialDelete ? 'Remove prescription file' : 'Delete prescription';
    const successLabel = partialDelete
      ? 'File removed from upload.'
      : item.uploadType === 'lab'
        ? 'Lab file removed successfully.'
        : item.uploadType === 'note'
          ? 'Procedure removed successfully.'
          : 'Prescription removed successfully.';

    const fileLabel =
      part?.originalName || part?.fileName || item.fileName || 'this file';
    const confirmMessage = partialDelete
      ? `Remove "${fileLabel}" from this upload?`
      : multiFile
        ? `Delete all ${item.fileCount} files in this upload?`
        : `Remove "${fileLabel}"?`;

    Alert.alert(
      deleteLabel,
      confirmMessage,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            const deleteId = item.batchParentId || item.id;
            const deletingKey = partialDelete
              ? `${deleteId}:${part!.filePath}`
              : deleteId;
            setDeletingFileId(deletingKey);
            try {
              const realAuthService = (await import('../services/realAuthService'))
                .default;
              if (partialDelete) {
                await realAuthService.deletePatientFilePart(
                  deleteId,
                  part!.filePath!,
                  token,
                );
              } else {
                await realAuthService.deletePatientFile(deleteId, token);
              }

              if (
                viewerIndex != null &&
                openableItems[viewerIndex]?.batchParentId === deleteId &&
                (!partialDelete ||
                  openableItems[viewerIndex]?.filePath === part?.filePath)
              ) {
                closeFileViewer();
              }

              setSignedUrls(prev => {
                const next = { ...prev };
                if (partialDelete && part?.filePath) {
                  delete next[part.filePath];
                } else {
                  openableItems
                    .filter(i => i.batchParentId === deleteId)
                    .forEach(i => {
                      if (i.filePath) delete next[i.filePath];
                    });
                }
                return next;
              });

              await refreshPrescriptionHistory();
              if (deleteGroupModalOpen && deleteGroupParent) {
                const updatedParts = deleteGroupParts.filter(
                  p => p.filePath !== part?.filePath,
                );
                if (updatedParts.length <= 1 || !partialDelete) {
                  setDeleteGroupModalOpen(false);
                  setDeleteGroupParent(null);
                  setDeleteGroupParts([]);
                } else {
                  setDeleteGroupParts(updatedParts);
                }
              }
              Alert.alert('Deleted', successLabel);
            } catch (error) {
              console.error('Prescription delete error:', error);
              Alert.alert(
                'Delete Failed',
                'Could not delete the prescription. Please try again.',
              );
            } finally {
              setDeletingFileId(null);
            }
          },
        },
      ],
    );
  };

  const handleUpload = async () => {
    if (!selectedFiles.length || !token) return;
    if (!patientId) {
      Alert.alert('Upload Failed', 'No patient is associated with this visit.');
      return;
    }
    const category =
      uploadFileType === 'lab' ? 'COMMON' : selectedCategory;
    if (!category) {
      Alert.alert('Select category', 'Please choose a prescription category.');
      return;
    }

    setUploading(true);
    const uploadingType = uploadFileType;
    const fileCount = selectedFiles.length;
    const kindLabel = uploadKindLabel(uploadingType);
    try {
      const realAuthService = (await import('../services/realAuthService'))
        .default;
      await realAuthService.uploadPatientFiles(
        selectedFiles,
        patientId,
        uploadApiType(uploadingType),
        token,
        category,
      );

      setSelectedFiles([]);
      setSelectedCategory(null);
      setUploadFileType('prescription');
      const countLabel = fileCount > 1 ? `${fileCount} files` : 'File';
      Alert.alert(
        'Success',
        `${kindLabel} uploaded successfully (${countLabel}).`,
      );

      await refreshPrescriptionHistory();
    } catch (error) {
      console.error('File upload error:', error);
      Alert.alert(
        'Upload Failed',
        `Could not upload the ${kindLabel.toLowerCase()}. Please try again.`,
      );
    } finally {
      setUploading(false);
    }
  };

  const uploadModalTitle = `Upload ${uploadKindLabel(uploadFileType)}`;
  const uploadCameraHint =
    uploadFileType === 'lab'
      ? 'Scan or import the lab report — auto-crop'
      : uploadFileType === 'procedure'
        ? 'Scan or import the procedure document — auto-crop'
        : 'Scan or import the prescription — auto-crop';
  const showUploadCategory = uploadFileType !== 'lab';

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
            onPress={() => {
              if (route?.params?.from === 'PatientList') {
                navigation.navigate('PatientList');
              } else {
                navigation.goBack();
              }
            }}
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
        {patientId ? (
          <TouchableOpacity
            style={styles.headerEditBtn}
            onPress={handleEditPatient}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            accessibilityLabel="Edit patient"
          >
            <Icon name="edit" size={16} color={theme.colors.primary} />
          </TouchableOpacity>
        ) : null}
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        <Text style={styles.historyTitle}>Patient History</Text>
        {loading && !refreshing ? (
          <ActivityIndicator
            style={styles.historyLoader}
            color={theme.colors.primary}
          />
        ) : historySections.length === 0 ? (
          <Text style={styles.emptyText}>
            No records found for this patient
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
              {section.items.map(item => renderHistoryItem(item))}
            </View>
          ))
        )}
      </ScrollView>

      {/* Upload source modal */}
      <ModalBackdrop
        visible={showUploadModal}
        onClose={() => setShowUploadModal(false)}
        animationType="slide"
        align="bottom"
      >
        <View
          style={[
            styles.uploadModalContainer,
            { paddingBottom: Math.max(insets.bottom, 20) },
          ]}
        >
          <View style={styles.uploadModalContent}>
            <View style={styles.uploadModalHeader}>
              <Text style={styles.uploadModalTitle}>{uploadModalTitle}</Text>
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
                <Text style={styles.uploadOptionTitle}>Scan Document</Text>
                <Text style={styles.uploadOptionSubtitle}>
                  {uploadCameraHint}
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
                  Upload PDFs, documents or images directly
                </Text>
              </View>
              <Icon
                name="chevron-right"
                size={24}
                color={theme.colors.textSecondary}
              />
            </TouchableOpacity>
          </View>
        </View>
      </ModalBackdrop>

      {/* Selected files → category + confirm upload popup */}
      <ModalBackdrop
        visible={selectedFiles.length > 0}
        onClose={() => handleRemoveFile()}
        animationType="fade"
        align="center"
        dismissOnBackdropPress={!uploading}
      >
        <View style={styles.uploadPopupCard}>
          <View style={styles.uploadPopupBody}>
            <View style={styles.followupHeader}>
              <Text style={styles.uploadPopupTitle}>{uploadModalTitle}</Text>
              <TouchableOpacity
                style={styles.followupClose}
                onPress={() => handleRemoveFile()}
                disabled={uploading}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="close" size={22} color={theme.colors.text} />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={styles.selectedFilesScroll}
              nestedScrollEnabled
              showsVerticalScrollIndicator={false}
            >
              {selectedFiles.map((file, index) => (
                <View key={`${file.uri}-${index}`} style={styles.selectedFileRow}>
                  <Icon
                    name="insert-drive-file"
                    size={20}
                    color={theme.colors.primary}
                  />
                  <Text style={styles.selectedFileName} numberOfLines={1}>
                    {file.name}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleRemoveFile(index)}
                    disabled={uploading}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Icon name="close" size={18} color={theme.colors.textSecondary} />
                  </TouchableOpacity>
                </View>
              ))}
            </ScrollView>

            <TouchableOpacity
              style={styles.addMoreFilesBtn}
              activeOpacity={0.7}
              disabled={uploading}
              onPress={handleFilePick}
            >
              <Icon name="add" size={20} color={theme.colors.primary} />
              <Text style={styles.addMoreFilesText}>Add more files</Text>
            </TouchableOpacity>

            {showUploadCategory ? (
              <>
                <Text style={styles.followupLabel}>Category</Text>
                <TouchableOpacity
                  style={styles.categorySelect}
                  activeOpacity={0.7}
                  disabled={uploading}
                  onPress={() => setCategoryDropdownOpen(o => !o)}
                >
                  <Text
                    style={[
                      styles.categorySelectText,
                      !selectedCategory && styles.followupPlaceholder,
                    ]}
                  >
                    {selectedCategory || 'Select category'}
                  </Text>
                  <Icon
                    name={categoryDropdownOpen ? 'expand-less' : 'expand-more'}
                    size={22}
                    color={theme.colors.textSecondary}
                  />
                </TouchableOpacity>
                {categoryDropdownOpen && (
                  <View style={styles.dropdownList}>
                    <ScrollView
                      style={styles.categoryDropdownScroll}
                      nestedScrollEnabled
                    >
                      {categoryOptions.map(cat => {
                        const active = cat === selectedCategory;
                        return (
                          <TouchableOpacity
                            key={cat}
                            style={styles.dropdownItem}
                            activeOpacity={0.7}
                            onPress={() => {
                              setSelectedCategory(cat);
                              setCategoryDropdownOpen(false);
                            }}
                          >
                            <Text
                              style={[
                                styles.dropdownItemText,
                                active && styles.dropdownItemTextActive,
                              ]}
                            >
                              {cat}
                            </Text>
                            {active && (
                              <Icon
                                name="check"
                                size={18}
                                color={theme.colors.primary}
                              />
                            )}
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </>
            ) : null}

            <TouchableOpacity
              style={[
                styles.confirmBtn,
                styles.uploadPopupConfirmBtn,
                uploading && styles.confirmBtnDisabled,
              ]}
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
                  <Text style={styles.uploadText}>
                    {uploading
                      ? 'Uploading...'
                      : selectedFiles.length > 1
                      ? `Upload ${selectedFiles.length} files`
                      : 'Upload'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ModalBackdrop>

      {/* Book Follow-up modal (UI only) */}
      <ModalBackdrop
        visible={showFollowupModal}
        onClose={() => setShowFollowupModal(false)}
        animationType="slide"
        align="bottom"
      >
        <View style={styles.followupCard}>
          <View style={styles.followupCardHandle} />
          {/* Header */}
          <View style={styles.followupHeader}>
            <Text style={styles.followupTitle}>Book Follow-up</Text>
            <View style={styles.tokenBadge}>
              <Text style={styles.tokenBadgeText}>TOKEN ONLY</Text>
            </View>
            <TouchableOpacity
              style={styles.followupClose}
              onPress={() => setShowFollowupModal(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={followupScrollRef}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: theme.spacing.lg, paddingTop: theme.spacing.md }}
          >
            <Text style={styles.followupSubtitle}>
              Books a queue appointment only — no prescription is created.
            </Text>

            {route.params?.followupLinkedTreatments?.length ? (
              <View style={styles.followupLinkedTreatments}>
                <Text style={styles.followupLabel}>Linked treatments</Text>
                {route.params.followupLinkedTreatments.map((treatment, index) => (
                  <View
                    key={`linked-treatment-${index}`}
                    style={styles.followupLinkedTreatmentRow}
                  >
                    <Text style={styles.followupLinkedTreatmentName}>
                      {treatment.treatmentDesc}
                    </Text>
                    {treatment.date ? (
                      <Text style={styles.followupLinkedTreatmentDate}>
                        {formatDate(treatment.date)}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            ) : null}

            {/* Follow-up date */}
            <Text style={styles.followupLabel}>Follow-up date</Text>
            <TouchableOpacity
              style={styles.followupField}
              activeOpacity={0.7}
              onPress={() => setShowFollowupDatePicker(true)}
            >
              <Text
                style={[
                  styles.followupFieldText,
                  !followupDate && styles.followupPlaceholder,
                ]}
              >
                {followupDate ? formatDate(followupDate.toISOString()) : 'dd/mm/yyyy'}
              </Text>
              <Icon name="event" size={20} color={theme.colors.textSecondary} />
            </TouchableOpacity>

            {/* Doctor */}
            <Text style={styles.followupLabel}>Doctor</Text>
            <TouchableOpacity
              style={styles.followupField}
              activeOpacity={0.7}
              disabled={doctorsLoading}
              onPress={() => setDoctorDropdownOpen(o => !o)}
            >
              <Text
                style={[
                  styles.followupFieldText,
                  !selectedDoctor && styles.followupPlaceholder,
                ]}
              >
                {selectedDoctor
                  ? `${selectedDoctor.name}${
                      selectedDoctor.doctorCode
                        ? ` (${selectedDoctor.doctorCode})`
                        : ''
                    }`
                  : 'Select doctor'}
              </Text>
              {doctorsLoading ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : (
                <Icon
                  name={doctorDropdownOpen ? 'expand-less' : 'expand-more'}
                  size={22}
                  color={theme.colors.textSecondary}
                />
              )}
            </TouchableOpacity>
            {doctorDropdownOpen && (
              <View style={styles.dropdownList}>
                {doctors.map(doc => {
                  const active = doc._id === selectedDoctor?._id;
                  return (
                    <TouchableOpacity
                      key={doc._id}
                      style={styles.dropdownItem}
                      activeOpacity={0.7}
                      onPress={() => {
                        setSelectedDoctor(doc);
                        setDoctorDropdownOpen(false);
                      }}
                    >
                      <Text
                        style={[
                          styles.dropdownItemText,
                          active && styles.dropdownItemTextActive,
                        ]}
                      >
                        {doc.name}
                        {doc.doctorCode ? ` (${doc.doctorCode})` : ''}
                      </Text>
                      {active && (
                        <Icon
                          name="check"
                          size={18}
                          color={theme.colors.primary}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {isSlotBookingMode(selectedDoctor) ? (
              <>
                {/* Slot */}
                <Text style={styles.followupLabel}>Slot</Text>
                <TouchableOpacity
                  style={styles.followupField}
                  activeOpacity={0.7}
                  disabled={!selectedDoctor || !followupDate || slotsLoading}
                  onPress={() => setSlotPickerOpen(true)}
                >
                  <Text
                    style={[
                      styles.followupFieldText,
                      !selectedSlot && styles.followupPlaceholder,
                    ]}
                  >
                    {selectedSlot
                      ? selectedSlot.startTime
                      : !followupDate
                      ? 'Pick a date first'
                      : 'Click to pick a slot'}
                  </Text>
                  {slotsLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary}
                    />
                  ) : (
                    <Icon
                      name="expand-more"
                      size={22}
                      color={theme.colors.textSecondary}
                    />
                  )}
                </TouchableOpacity>
              </>
            ) : null}

            {/* Custom booking: allow staff to set start time and duration */}
            {selectedDoctor && !isSlotBookingMode(selectedDoctor) ? (
              <CustomBookingTimeFields
                startTime={customStartTime}
                durationMinutes={customDurationMinutes}
                onStartTimeChange={setCustomStartTime}
                onDurationChange={setCustomDurationMinutes}
                errors={customBookingErrors || undefined}
              />
            ) : null}

            {/* Treatment (from Manage Service + treatment plans) */}
            <Text style={styles.followupLabel}>
              Treatment
              <Text style={styles.followupLabelOptional}> (optional)</Text>
            </Text>
            <View style={{ zIndex: 999, position: 'relative' }}>
              <TouchableOpacity
                style={styles.followupField}
                activeOpacity={0.7}
                disabled={
                  followupTreatmentsLoading ||
                  (!followupCatalogTreatments.length &&
                    !followupPlanGroups.length)
                }
                onPress={() => {
                  const nextState = !followupTreatmentDropdownOpen;
                  setFollowupTreatmentDropdownOpen(nextState);
                  if (nextState) {
                    setTimeout(() => {
                      followupScrollRef.current?.scrollTo({ y: 350, animated: true });
                    }, 100);
                  }
                }}
              >
                <Text
                  style={[
                    styles.followupFieldText,
                    selectedFollowupTreatmentKeys.size === 0 &&
                      styles.followupPlaceholder,
                  ]}
                  numberOfLines={1}
                >
                  {followupTreatmentTriggerLabel}
                </Text>
                {followupTreatmentsLoading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <Icon
                    name={followupTreatmentDropdownOpen ? "expand-less" : "expand-more"}
                    size={22}
                    color={theme.colors.textSecondary}
                  />
                )}
              </TouchableOpacity>

              {followupTreatmentDropdownOpen && (
                <View style={styles.followupTreatmentDropdown}>
                  {/* Search input container inside the dropdown */}
                  <View style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    borderWidth: 1,
                    borderColor: theme.colors.border,
                    borderRadius: theme.borderRadius.sm,
                    marginHorizontal: theme.spacing.sm,
                    marginTop: theme.spacing.sm,
                    paddingHorizontal: theme.spacing.sm,
                    height: 38,
                    backgroundColor: theme.colors.background,
                  }}>
                    <Icon name="search" size={18} color={theme.colors.textSecondary} style={{ marginRight: 6 }} />
                    <TextInput
                      style={{
                        flex: 1,
                        fontSize: theme.typography.fontSizes.sm,
                        color: theme.colors.text,
                        padding: 0,
                      }}
                      value={followupTreatmentSearch}
                      onChangeText={setFollowupTreatmentSearch}
                      placeholder="Search treatments..."
                      placeholderTextColor={theme.colors.placeholder}
                      autoFocus
                    />
                    {followupTreatmentSearch.trim() ? (
                      <TouchableOpacity onPress={() => setFollowupTreatmentSearch('')}>
                        <Icon name="close" size={18} color={theme.colors.textSecondary} />
                      </TouchableOpacity>
                    ) : null}
                  </View>

                  {followupTreatmentsLoading ? (
                    <ActivityIndicator
                      size="small"
                      color={theme.colors.primary}
                      style={styles.followupTreatmentLoader}
                    />
                  ) : filteredFollowupPlanGroups.length === 0 &&
                    filteredFollowupCatalogTreatments.length === 0 ? (
                    <Text style={styles.followupTreatmentEmpty}>
                      {followupTreatmentSearch.trim()
                        ? 'No treatments match your search'
                        : 'No treatments available'}
                    </Text>
                  ) : (
                    <ScrollView
                      nestedScrollEnabled
                      keyboardShouldPersistTaps="handled"
                      style={[styles.followupTreatmentList, { marginTop: 4 }]}
                    >
                      {filteredFollowupPlanGroups.map(group => (
                        <View key={group.planId}>
                          <Text style={styles.followupTreatmentGroupTitle}>
                            {group.planTitle}
                          </Text>
                          {group.treatments.map(treatment => {
                            const active = selectedFollowupTreatmentKeys.has(
                              treatment.key,
                            );
                            return (
                              <TouchableOpacity
                                key={treatment.key}
                                style={styles.followupTreatmentOption}
                                activeOpacity={0.7}
                                onPress={() =>
                                  toggleFollowupTreatment(treatment.key)
                                }
                              >
                                <Icon
                                  name={
                                    active
                                      ? 'check-box'
                                      : 'check-box-outline-blank'
                                  }
                                  size={20}
                                  color={
                                    active
                                      ? theme.colors.primary
                                      : theme.colors.textSecondary
                                  }
                                />
                                <View style={styles.followupTreatmentOptionBody}>
                                  <Text style={styles.followupTreatmentOptionName}>
                                    {treatment.treatmentDesc}
                                  </Text>
                                  {!!treatment.date && (
                                    <Text style={styles.followupTreatmentOptionMeta}>
                                      {formatDate(treatment.date)}
                                    </Text>
                                  )}
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      ))}

                      {filteredFollowupCatalogTreatments.length > 0 && (
                        <View>
                          <Text style={styles.followupTreatmentGroupTitle}>
                            Manage Service
                          </Text>
                          {filteredFollowupCatalogTreatments.map(treatment => {
                            const active = selectedFollowupTreatmentKeys.has(
                              treatment.key,
                            );
                            return (
                              <TouchableOpacity
                                key={treatment.key}
                                style={styles.followupTreatmentOption}
                                activeOpacity={0.7}
                                onPress={() =>
                                  toggleFollowupTreatment(treatment.key)
                                }
                              >
                                <Icon
                                  name={
                                    active
                                      ? 'check-box'
                                      : 'check-box-outline-blank'
                                  }
                                  size={20}
                                  color={
                                    active
                                      ? theme.colors.primary
                                      : theme.colors.textSecondary
                                  }
                                />
                                <View style={styles.followupTreatmentOptionBody}>
                                  <Text style={styles.followupTreatmentOptionName}>
                                    {treatment.treatmentDesc}
                                  </Text>
                                  <Text style={styles.followupTreatmentOptionMeta}>
                                    ₹ {treatment.expenseAmount}
                                  </Text>
                                </View>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      )}
                    </ScrollView>
                  )}
                </View>
              )}
            </View>



            <Text style={styles.followupLabel}>
              Remark<Text style={styles.followupLabelOptional}> (optional)</Text>
            </Text>
            <TextInput
              style={styles.followupRemarkInput}
              value={followupRemark}
              onChangeText={setFollowupRemark}
              placeholder="Add a remark for this follow-up"
              placeholderTextColor={theme.colors.placeholder}
              multiline
              textAlignVertical="top"
            />
          </ScrollView>

          {/* Footer actions */}
          <View style={[styles.followupFooter, { paddingBottom: Math.max(12, insets.bottom) }]}>
            <TouchableOpacity
              style={[styles.followupFooterBtn, styles.followupCancelBtn]}
              activeOpacity={0.8}
              onPress={() => setShowFollowupModal(false)}
            >
              <Text style={styles.followupCancelText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.followupFooterBtn,
                styles.followupBookBtn,
                booking && styles.confirmBtnDisabled,
              ]}
              activeOpacity={0.8}
              onPress={handleBookFollowup}
              disabled={booking}
            >
              {booking ? (
                <ActivityIndicator size="small" color={theme.colors.surface} />
              ) : (
                <Text style={styles.followupBookText}>Book follow-up</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ModalBackdrop>

      <MonthCalendarPickerModal
        visible={showFollowupDatePicker}
        value={followupDate || new Date()}
        onSelectDate={date => {
          setFollowupDate(date);
        }}
        onClose={() => setShowFollowupDatePicker(false)}
        minDate={new Date()}
      />

      {/* Premium UI Delete File Group Modal */}
      <ModalBackdrop
        visible={deleteGroupModalOpen}
        onClose={() => {
          setDeleteGroupModalOpen(false);
          setDeleteGroupParent(null);
          setDeleteGroupParts([]);
        }}
        animationType="fade"
        align="center"
      >
        <View style={styles.deleteGroupCard}>
          <View style={styles.deleteGroupHeader}>
            <Text style={styles.deleteGroupTitle}>Delete Files</Text>
            <TouchableOpacity
              onPress={() => {
                setDeleteGroupModalOpen(false);
                setDeleteGroupParent(null);
                setDeleteGroupParts([]);
              }}
              style={styles.deleteGroupCloseBtn}
            >
              <Icon name="close" size={20} color="#64748b" />
            </TouchableOpacity>
          </View>

          <Text style={styles.deleteGroupSubtitle}>
            Which file do you want to delete?
          </Text>

          <ScrollView style={styles.deleteGroupList}>
            {deleteGroupParts.map((part, idx) => {
              const rawName = part.originalName || part.fileName;
              const name = displayFileName(rawName, `File ${idx + 1}`);
              const partIcon = getFileTypeIcon(part.mimeType, rawName);
              return (
                <View key={part.filePath || idx} style={styles.deleteGroupItem}>
                  <Icon
                    name={partIcon.icon}
                    size={18}
                    color={partIcon.color}
                    style={styles.deleteGroupItemIcon}
                  />
                  <Text style={styles.deleteGroupItemName} numberOfLines={1}>
                    {name}
                  </Text>
                  <TouchableOpacity
                    style={styles.deleteGroupItemDeleteBtn}
                    onPress={() => {
                      if (deleteGroupParent) {
                        handleDeletePrescription(deleteGroupParent, part);
                      }
                    }}
                  >
                    <Icon name="delete-outline" size={18} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>

          <View style={styles.deleteGroupDivider} />

          <TouchableOpacity
            style={styles.deleteAllBtn}
            activeOpacity={0.8}
            onPress={() => {
              if (deleteGroupParent) {
                handleDeletePrescription(deleteGroupParent);
              }
            }}
          >
            <Icon
              name="delete"
              size={16}
              color="#ffffff"
              style={styles.deleteAllIcon}
            />
            <Text style={styles.deleteAllText}>Delete Entire Upload</Text>
          </TouchableOpacity>
        </View>
      </ModalBackdrop>

      {/* Slot picker popup (cards grid, like the web app) */}
      <ModalBackdrop
        visible={slotPickerOpen}
        onClose={() => setSlotPickerOpen(false)}
        animationType="fade"
        align="center"
      >
        <View style={styles.slotModalCard}>
          <View style={styles.followupHeader}>
            <Text style={styles.followupTitle}>Select Slots</Text>
            <TouchableOpacity
              style={styles.followupClose}
              onPress={() => setSlotPickerOpen(false)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={22} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <SlotPickerGrid
            slots={slots}
            selectedSlotId={selectedSlot?._id}
            loading={slotsLoading}
            onSelect={slot => {
              if (!isSlotSelectable(slot)) return;
              setSelectedSlot(slot);
              setSlotPickerOpen(false);
            }}
          />
        </View>
      </ModalBackdrop>

      {/* In-app file viewer with a bottom strip to move between prescriptions */}
      <Modal
        visible={viewerIndex != null}
        animationType="slide"
        statusBarTranslucent
        presentationStyle="overFullScreen"
        onRequestClose={closeFileViewer}
      >
        {(() => {
          const current =
            viewerIndex != null ? openableItems[viewerIndex] : undefined;
          const currentUrl = current?.filePath
            ? signedUrls[current.filePath]
            : undefined;
          const isPdf = (current?.mimeType || '').includes('pdf');
          const isImage = isImageUploadPart(current);
          return (
            <SafeAreaView
              edges={['top', 'bottom']}
              style={styles.viewerContainer}
            >
              <View style={styles.viewerHeader}>
                <TouchableOpacity
                  onPress={closeFileViewer}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Icon name="arrow-back" size={24} color={theme.colors.text} />
                </TouchableOpacity>
                <Text style={styles.viewerTitle} numberOfLines={1}>
                  {current?.fileName || 'File'}
                </Text>
                {isImage && currentUrl ? (
                  <TouchableOpacity
                    onPress={rotateViewerImage}
                    style={styles.viewerRotateBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Rotate image"
                  >
                    <Icon name="rotate-right" size={22} color={theme.colors.primary} />
                  </TouchableOpacity>
                ) : (
                  <View style={styles.viewerRotatePlaceholder} />
                )}
                <View style={styles.viewerZoomActions}>
                  <TouchableOpacity
                    onPress={zoomViewerOut}
                    disabled={viewerZoom <= VIEWER_MIN_ZOOM}
                    style={[
                      styles.viewerZoomBtn,
                      viewerZoom <= VIEWER_MIN_ZOOM && styles.viewerZoomBtnDisabled,
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Zoom out"
                  >
                    <Text style={styles.viewerZoomBtnText}>−</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={zoomViewerIn}
                    disabled={viewerZoom >= VIEWER_MAX_ZOOM}
                    style={[
                      styles.viewerZoomBtn,
                      viewerZoom >= VIEWER_MAX_ZOOM && styles.viewerZoomBtnDisabled,
                    ]}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityLabel="Zoom in"
                  >
                    <Text style={styles.viewerZoomBtnText}>+</Text>
                  </TouchableOpacity>
                </View>
                <Text style={styles.viewerCount}>
                  {viewerStripItems.length > 1
                    ? `${
                        viewerStripItems.findIndex(
                          it => it.filePath === current?.filePath,
                        ) + 1
                      }/${viewerStripItems.length}`
                    : viewerIndex != null
                      ? `${viewerIndex + 1}/${openableItems.length}`
                      : '0/0'}
                </Text>
              </View>

              <View
                style={styles.viewerBody}
                onLayout={event => {
                  const { width, height } = event.nativeEvent.layout;
                  if (width > 0 && height > 0) {
                    setViewerBodySize({ w: width, h: height });
                  }
                }}
              >
                {!currentUrl ? (
                  <ActivityIndicator
                    size="large"
                    color={theme.colors.surface}
                  />
                ) : isPdf ? (
                  <PinchZoomView
                    key={current?.id || currentUrl}
                    style={styles.viewerImageScroll}
                    zoom={viewerZoom}
                    minZoom={VIEWER_MIN_ZOOM}
                    maxZoom={VIEWER_MAX_ZOOM}
                    onZoomChange={setViewerZoom}
                    viewportWidth={viewerBodySize.w}
                    viewportHeight={viewerBodySize.h}
                    contentWidth={viewerBodySize.w}
                    contentHeight={viewerBodySize.h}
                  >
                    <Pdf
                      source={{ uri: currentUrl, cache: true }}
                      trustAllCerts={false}
                      style={{ width: viewerBodySize.w, height: viewerBodySize.h }}
                      enablePinchZoom={false}
                      enableDoubleTapZoom={false}
                      onError={err => {
                        console.error('PDF render error:', err);
                      }}
                    />
                  </PinchZoomView>
                ) : (
                  <PinchZoomView
                    key={current?.id || currentUrl}
                    style={styles.viewerImageScroll}
                    zoom={viewerZoom}
                    minZoom={VIEWER_MIN_ZOOM}
                    maxZoom={VIEWER_MAX_ZOOM}
                    onZoomChange={setViewerZoom}
                    viewportWidth={viewerBodySize.w}
                    viewportHeight={viewerBodySize.h}
                    contentWidth={viewerImageLayout?.frameWidth || SCREEN_WIDTH}
                    contentHeight={viewerImageLayout?.frameHeight || SCREEN_HEIGHT * 0.7}
                  >
                    <View
                      style={[
                        styles.viewerImageFrame,
                        viewerImageLayout
                          ? {
                              width: viewerImageLayout.frameWidth,
                              height: viewerImageLayout.frameHeight,
                            }
                          : null,
                      ]}
                    >
                      <Image
                        source={{ uri: currentUrl }}
                        style={[
                          styles.viewerImage,
                          viewerImageLayout
                            ? {
                                width: viewerImageLayout.imgWidth,
                                height: viewerImageLayout.imgHeight,
                              }
                            : null,
                          { transform: [{ rotate: `${viewerRotation}deg` }] },
                        ]}
                        resizeMode="contain"
                        onLoad={event => {
                          const { width, height } = event.nativeEvent.source;
                          if (width > 0 && height > 0) {
                            setViewerImageNatural({ w: width, h: height });
                          }
                        }}
                      />
                    </View>
                  </PinchZoomView>
                )}
              </View>

              {/* Bottom glider: compact thumbnails for this batch (or all uploads) */}
              {viewerStripItems.length > 1 && (
                <View style={styles.gliderContainer}>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.gliderContent}
                  >
                    {viewerStripItems.map(it => {
                      const itIcon = getFileTypeIcon(it.mimeType, it.fileName);
                      const itIsImage = itIcon.isImage;
                      const itUri = it.filePath ? signedUrls[it.filePath] : undefined;
                      const active = it.filePath === current?.filePath;
                      return (
                        <TouchableOpacity
                          key={it.id}
                          activeOpacity={0.8}
                          onPress={() => {
                            const globalIndex = openableItems.findIndex(
                              o => o.filePath === it.filePath,
                            );
                            if (globalIndex >= 0) {
                              resetViewerImageState();
                              setViewerIndex(globalIndex);
                            }
                          }}
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
                            <Icon name={itIcon.icon} size={14} color={itIcon.color} />
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

      <Modal
        visible={selectedBatchItem != null}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedBatchItem(null)}
      >
        <Pressable
          style={styles.modalBackdrop}
          onPress={() => setSelectedBatchItem(null)}
        />
        <View style={styles.fileSelectorContainer} pointerEvents="box-none">
          <View style={styles.fileSelectorContent}>
            <View style={styles.fileSelectorHeader}>
              <View style={styles.fileSelectorHeaderText}>
                <Text style={styles.fileSelectorTitle}>Files</Text>
                <Text style={styles.fileSelectorSubtitle}>
                  Print, download or delete individual files
                </Text>
              </View>
              <TouchableOpacity
                style={styles.fileSelectorCloseBtn}
                onPress={() => setSelectedBatchItem(null)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Icon name="close" size={18} color={theme.colors.text} />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.fileSelectorList}>
              {selectedBatchItem &&
                getItemParts(selectedBatchItem).map((part, index) => {
                  const partIsImage = isImageUploadPart(part);
                  const partThumb = part.filePath
                    ? signedUrls[part.filePath]
                    : undefined;
                  const rawName = part.originalName || part.fileName;
                  const partIcon = getFileTypeIcon(part.mimeType, rawName);
                  const partName = displayFileName(rawName, `File ${index + 1}`);
                  return (
                    <View key={part.filePath || index} style={styles.fileSelectorRow}>
                      <View style={styles.fileSelectorIconWrap}>
                        {partIsImage && partThumb ? (
                          <Image
                            source={{ uri: partThumb }}
                            style={styles.fileSelectorThumb}
                            resizeMode="cover"
                          />
                        ) : (
                          <Icon name={partIcon.icon} size={18} color={partIcon.color} />
                        )}
                      </View>
                      <Text style={styles.fileSelectorName} numberOfLines={1}>
                        {partName}
                      </Text>

                      <View style={styles.fileSelectorActions}>
                        <TouchableOpacity
                          style={[styles.fileRowActionBtn, styles.fileRowActionPrint]}
                          activeOpacity={0.7}
                          onPress={() => {
                            setSelectedBatchItem(null);
                            openFile(selectedBatchItem, part.filePath);
                          }}
                        >
                          <Icon name="print" size={16} color="#6366F1" />
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.fileRowActionBtn, styles.fileRowActionDownload]}
                          activeOpacity={0.7}
                          onPress={async () => {
                            setSelectedBatchItem(null);
                            await handlePartDownload(selectedBatchItem, part);
                          }}
                        >
                          <Icon name="file-download" size={16} color="#2563EB" />
                        </TouchableOpacity>

                        {canDeleteUploadAccess && (
                          <TouchableOpacity
                            style={[styles.fileRowActionBtn, styles.fileRowActionDelete]}
                            activeOpacity={0.7}
                            onPress={() => {
                              setSelectedBatchItem(null);
                              handleDeletePrescription(selectedBatchItem, part);
                            }}
                          >
                            <Icon name="delete-outline" size={16} color="#EF4444" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>
                  );
                })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      <TreatmentPlanDrawer
        visible={treatmentPlanOpen}
        onClose={closeTreatmentPlanDrawer}
        editPlan={editingTreatmentPlan}
        onSave={handleSaveTreatmentPlan}
        token={token}
      />

      <OPDActionsFab
        onUploadPrescriptionPress={() => openUploadModal('prescription')}
        onUploadProcedurePress={() => openUploadModal('procedure')}
        onUploadLabPress={() => openUploadModal('lab')}
        onTreatmentPlanPress={handleTreatmentPlanPress}
        onFollowupPress={openFollowupModal}
        showTreatmentPlan={canManageTreatmentPlanAccess}
      />
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
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  headerGrid: {
    flex: 1,
    flexDirection: 'row',
  },
  headerEditBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginLeft: theme.spacing.xs,
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
    flexGrow: 1,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: 96,
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
  selectedFilesScroll: {
    maxHeight: 160,
    marginBottom: theme.spacing.xs,
  },
  addMoreFilesBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderStyle: 'dashed',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  addMoreFilesText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
  },
  styledUploadFileCount: {
    marginTop: 4,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  categorySelect: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  categorySelectText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  categoryDropdownScroll: {
    maxHeight: 220,
  },
  confirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: '#4CAF50',
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  uploadText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
    marginLeft: theme.spacing.sm,
  },
  uploadPopupConfirmBtn: {
    marginTop: theme.spacing.md,
    marginBottom: 0,
  },
  uploadPopupCard: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    overflow: 'hidden',
    ...theme.shadows.sm,
  },
  uploadPopupBody: {
    padding: theme.spacing.md,
  },
  uploadModalContainer: {
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
  },
  uploadModalContent: {
    padding: theme.spacing.md,
  },
  uploadModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  uploadModalTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  uploadOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    marginBottom: theme.spacing.xs,
  },
  uploadOptionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: theme.colors.primary + '15',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
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
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
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
    marginBottom: theme.spacing.sm,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
  },
  sectionLabelPill: {
    backgroundColor: '#ECEFF1',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 3,
    paddingHorizontal: theme.spacing.sm,
  },
  sectionLabelText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#546E7A',
  },
  sectionDivider: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
    marginLeft: theme.spacing.md,
  },
  // Shared info lines (File: / Date: / Time: / Uploaded By:)
  cardInfoLine: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    marginTop: 3,
  },
  cardInfoLabel: {
    fontWeight: theme.typography.fontWeights.bold,
  },
  metaField: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  metaLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    letterSpacing: 0.4,
    marginRight: theme.spacing.sm,
  },
  metaLabelMuted: {
    color: theme.colors.textSecondary,
  },
  metaValue: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  historyCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
  },
  historyCardHeaderTitle: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  thumbnailImage: {
    width: '100%',
    height: '100%',
  },
  // Uploaded prescription / procedure cards
  styledUploadCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    ...theme.shadows.sm,
  },
  styledUploadHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
  },
  styledUploadHeaderPrescription: {
    backgroundColor: '#8B5CF6',
  },
  styledUploadHeaderProcedure: {
    backgroundColor: '#1565C0',
  },
  styledUploadHeaderLab: {
    backgroundColor: '#047857',
  },
  styledUploadHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: theme.spacing.sm,
  },
  styledUploadHeaderTitle: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  styledUploadBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 3,
    paddingHorizontal: theme.spacing.sm,
    marginLeft: theme.spacing.sm,
  },
  styledUploadBadgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
    textTransform: 'uppercase',
  },
  styledUploadPanel: {
    padding: theme.spacing.sm,
  },
  styledUploadPanelPrescription: {
    backgroundColor: theme.colors.surface,
  },
  styledUploadPanelProcedure: {
    backgroundColor: '#F4F7FF',
  },
  styledUploadPanelLab: {
    backgroundColor: '#ECFDF5',
  },
  styledUploadContent: {
    flexDirection: 'row',
  },
  uploadFilesGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: theme.spacing.xs,
  },
  uploadGridCellWrap: {
    position: 'relative',
  },
  uploadGridCell: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  uploadGridCellRemove: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1,
  },
  uploadGridCellImage: {
    width: '100%',
    height: '100%',
  },
  uploadGridCellFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
  },
  uploadGridCellExt: {
    fontSize: 9,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#64748B',
    marginTop: 2,
  },
  styledUploadThumbnail: {
    width: 52,
    height: 52,
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    borderColor: '#E0E7FF',
    backgroundColor: theme.colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.sm,
    overflow: 'hidden',
  },
  styledUploadThumbnailLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#6366F1',
    marginTop: 4,
  },
  styledUploadInfo: {
    flex: 1,
  },
  styledUploadFileName: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#1F2937',
    marginBottom: theme.spacing.xs,
  },
  styledUploadMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  styledUploadMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  styledUploadMetaLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#8091F2',
    letterSpacing: 0.4,
  },
  styledUploadMetaValue: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#1F2937',
  },
  styledUploadActions: {
    flexDirection: 'row',
    marginTop: theme.spacing.sm,
    gap: theme.spacing.xs,
  },
  styledUploadActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.md,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.xs,
    gap: 3,
    borderWidth: 1,
  },
  styledUploadActionPrint: {
    backgroundColor: theme.colors.surface,
    borderColor: '#C7D2FE',
  },
  styledUploadActionDownload: {
    backgroundColor: theme.colors.surface,
    borderColor: '#C7D2FE',
  },
  styledUploadActionDelete: {
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
  },
  styledUploadActionText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#6366F1',
  },
  styledUploadActionDeleteText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#EF4444',
  },
  // Lab report card
  labCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  labBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#D1FAE5',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 3,
    paddingHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  labBadgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#047857',
  },
  apptCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    ...theme.shadows.sm,
  },
  apptCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  apptHeaderTitle: {
    marginLeft: theme.spacing.sm,
  },
  apptStatusBadge: {
    borderRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 3,
    marginLeft: theme.spacing.sm,
  },
  apptStatusText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  apptCardBody: {
    backgroundColor: '#F5F7FA',
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
  },
  apptCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  apptGridCell: {
    width: '50%',
    paddingRight: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
  },
  apptTreatmentBlock: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#C8E6C9',
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
  },
  apptTreatmentLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.xs,
  },
  apptTreatmentItem: {
    paddingVertical: theme.spacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  apptTreatmentName: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  apptTreatmentDate: {
    marginTop: 2,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  apptRemarkBox: {
    marginTop: theme.spacing.sm,
    borderWidth: 1,
    borderColor: '#BBDEFB',
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surface,
    padding: theme.spacing.md,
  },
  apptRemarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  apptRemarkLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
    letterSpacing: 0.4,
  },
  apptRemarkAddBtn: {
    borderWidth: 1,
    borderColor: '#90CAF9',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  apptRemarkAddText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
  },
  apptRemarkEmpty: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontStyle: 'italic',
  },
  apptRemarkText: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    lineHeight: 20,
  },
  apptRemarkInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 96,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  apptRemarkActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.sm,
  },
  apptRemarkBtn: {
    minWidth: 88,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  apptRemarkCancelBtn: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  apptRemarkCancelText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  apptRemarkSaveBtn: {
    backgroundColor: theme.colors.primary,
  },
  apptRemarkSaveText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
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
  viewerRotateBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
    marginLeft: theme.spacing.xs,
  },
  viewerRotatePlaceholder: {
    width: 36,
    marginLeft: theme.spacing.xs,
  },
  viewerZoomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: theme.spacing.sm,
    gap: 4,
  },
  viewerZoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  viewerZoomBtnDisabled: {
    opacity: 0.4,
  },
  viewerZoomBtnText: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
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
    maxWidth: '100%',
    maxHeight: '100%',
  },
  viewerImageFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  // Bottom glider strip
  gliderContainer: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  gliderContent: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 6,
    gap: 6,
  },
  gliderThumb: {
    width: 40,
    height: 40,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: 'transparent',
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
    overflow: 'hidden',
  },
  gliderThumbActive: {
    borderColor: theme.colors.primary,
  },
  gliderThumbImage: {
    width: '100%',
    height: '100%',
  },
  // Book follow-up modal
  followupCard: {
    width: '100%',
    height: SCREEN_HEIGHT * 0.9,
    maxHeight: SCREEN_HEIGHT * 0.9,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    paddingHorizontal: 0,
    paddingBottom: 0,
    overflow: 'hidden',
    ...theme.shadows.lg,
  },
  followupCardHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.colors.border,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
  },
  followupHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.lg,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  uploadPopupTitle: {
    flex: 1,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  followupTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  tokenBadge: {
    backgroundColor: theme.colors.primary + '1A',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  tokenBadgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
    letterSpacing: 0.5,
  },
  followupClose: {
    marginLeft: 'auto',
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
  followupSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.md,
  },
  followupLinkedTreatments: {
    marginBottom: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  followupLinkedTreatmentRow: {
    paddingVertical: theme.spacing.xs,
  },
  followupLinkedTreatmentName: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  followupLinkedTreatmentDate: {
    marginTop: 2,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  followupLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  followupLabelOptional: {
    fontWeight: theme.typography.fontWeights.normal,
    color: theme.colors.textSecondary,
  },
  followupField: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  followupFieldText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  followupPlaceholder: {
    color: theme.colors.textSecondary,
  },
  followupRemarkInput: {
    minHeight: 60,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dropdownItemText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  dropdownItemTextActive: {
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.primary,
  },
  followupSelectedTreatments: {
    marginTop: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.background,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.xs,
    maxHeight: 120,
  },
  followupSelectedTreatmentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: theme.spacing.xs,
  },
  followupSelectedTreatmentText: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  followupTreatmentDropdown: {
    position: 'absolute',
    top: 42,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.surface,
    zIndex: 9999,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 6,
    overflow: 'hidden',
  },
  followupTreatmentSearch: {
    margin: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  followupTreatmentLoader: {
    paddingVertical: theme.spacing.lg,
  },
  followupTreatmentEmpty: {
    textAlign: 'center',
    color: theme.colors.textSecondary,
    paddingVertical: theme.spacing.lg,
    paddingHorizontal: theme.spacing.md,
    fontSize: theme.typography.fontSizes.sm,
  },
  followupTreatmentList: {
    maxHeight: 220,
  },
  followupTreatmentGroupTitle: {
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.xs,
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    backgroundColor: theme.colors.background,
  },
  followupTreatmentOption: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  followupTreatmentOptionBody: {
    flex: 1,
    marginLeft: theme.spacing.sm,
  },
  followupTreatmentOptionName: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  followupTreatmentOptionMeta: {
    marginTop: 2,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  // Slot picker popup (cards grid)
  slotModalCard: {
    width: '100%',
    maxWidth: 560,
    maxHeight: '85%',
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.xl,
    padding: theme.spacing.lg,
    ...theme.shadows.sm,
  },
  slotCardGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  slotCard: {
    width: '48%',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
    backgroundColor: '#86EFAC',
  },
  slotCardActive: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  slotCardDisabled: {
    backgroundColor: theme.colors.border,
    opacity: 0.5,
  },
  slotCardLine: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginBottom: 2,
  },
  followupFooter: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingTop: theme.spacing.md,
    paddingBottom: 12,
    paddingHorizontal: theme.spacing.lg,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  followupFooterBtn: {
    borderRadius: theme.borderRadius.md,
    paddingVertical: 10,
    paddingHorizontal: theme.spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 100,
  },
  followupCancelBtn: {
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginRight: theme.spacing.md,
  },
  followupCancelText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  followupBookBtn: {
    backgroundColor: theme.colors.primary,
  },
  followupBookText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  deleteGroupCard: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 5,
  },
  deleteGroupHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  deleteGroupTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#0f172a',
  },
  deleteGroupCloseBtn: {
    padding: 4,
    borderRadius: 4,
    backgroundColor: '#f1f5f9',
  },
  deleteGroupSubtitle: {
    fontSize: 13,
    color: '#64748b',
    marginBottom: 16,
  },
  deleteGroupList: {
    maxHeight: 200,
  },
  deleteGroupItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f5f9',
  },
  deleteGroupItemIcon: {
    marginRight: 10,
  },
  deleteGroupItemName: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
    color: '#334155',
  },
  deleteGroupItemDeleteBtn: {
    padding: 6,
    borderRadius: 6,
    backgroundColor: '#fef2f2',
  },
  deleteGroupDivider: {
    height: 1,
    backgroundColor: '#f1f5f9',
    marginVertical: 12,
  },
  deleteAllBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EF4444',
    borderRadius: 8,
    paddingVertical: 10,
  },
  deleteAllIcon: {
    marginRight: 6,
  },
  deleteAllText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  fileSelectorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  fileSelectorContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    width: '100%',
    maxWidth: 380,
    padding: 14,
    maxHeight: '78%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  fileSelectorHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  fileSelectorHeaderText: {
    flex: 1,
    paddingRight: 8,
  },
  fileSelectorTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  fileSelectorSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  fileSelectorCloseBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fileSelectorList: {
    marginBottom: 2,
  },
  fileSelectorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 8,
    marginBottom: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  fileSelectorIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#EEF2FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  fileSelectorThumb: {
    width: '100%',
    height: '100%',
  },
  fileSelectorName: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    fontWeight: '600',
  },
  fileSelectorActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fileRowActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 6,
  },
  fileRowActionPrint: {
    backgroundColor: '#EEF2FF',
  },
  fileRowActionDownload: {
    backgroundColor: '#EFF6FF',
  },
  fileRowActionDelete: {
    backgroundColor: '#FEF2F2',
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.4)',
  },
});

export default OPDScreen;
