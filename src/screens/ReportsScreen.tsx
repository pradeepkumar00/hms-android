import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Modal,
  TextInput,
  ActivityIndicator,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  pick,
  types,
  isErrorWithCode,
  errorCodes,
} from '@react-native-documents/picker';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { useNavigation } from '@react-navigation/native';
import Header from '../components/Header';
import { theme } from '../constants/theme';
import FileViewerModal from '../components/FileViewerModal';
import { useAppSelector, selectAuthToken } from '../store';
import realAuthService from '../services/realAuthService';

interface ReportFile {
  id: string;
  name: string;
  description: string;
  fileName: string;
  fileType: string;
  fileSize: string;
  url?: string;
  uploadedBy: string;
  uploadedAt: string;
}

type PickedFile = { uri: string; name: string; type: string };

const ReportsScreen: React.FC = () => {
  const navigation = useNavigation<any>();
  const token = useAppSelector(selectAuthToken);

  const [files, setFiles] = useState<ReportFile[]>([]);
  const [perms, setPerms] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [accessDenied, setAccessDenied] = useState(false);

  // Modal / form
  const [modalOpen, setModalOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formName, setFormName] = useState('');
  const [formDescription, setFormDescription] = useState('');
  const [pickedFile, setPickedFile] = useState<PickedFile | null>(null);
  const [pickedFileName, setPickedFileName] = useState('');
  const [saving, setSaving] = useState(false);

  const [viewerVisible, setViewerVisible] = useState(false);
  const [viewerItem, setViewerItem] = useState<any | null>(null);
  const [viewerUrl, setViewerUrl] = useState<string | null>(null);

  // Date filter state
  const [dateFilterType, setDateFilterType] = useState<'week' | 'month' | 'today' | 'all'>('week');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const canAdd = perms.has('report.create');
  const canEdit = perms.has('report.update');
  const canDelete = perms.has('report.delete');

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setAccessDenied(false);
    try {
      const res = await realAuthService.getReportFiles(token);
      setFiles(res.files || []);
      setPerms(new Set(res.permissions || []));
    } catch (e: any) {
      if (/403|permission|not enabled/i.test(e?.message || '')) {
        setAccessDenied(true);
      } else {
        Alert.alert('Error', e?.message || 'Failed to load reports');
      }
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const openUpload = () => {
    setEditId(null);
    setFormName('');
    setFormDescription('');
    setPickedFile(null);
    setPickedFileName('');
    setModalOpen(true);
  };

  const openEdit = (file: ReportFile) => {
    setEditId(file.id);
    setFormName(file.name);
    setFormDescription(file.description);
    setPickedFile(null);
    setPickedFileName(file.fileName);
    setModalOpen(true);
  };

  const handlePick = async () => {
    try {
      const result = await pick({
        type: [types.allFiles],
        copyTo: 'cachesDirectory',
      });
      const f: any = result?.[0];
      if (f) {
        setPickedFile({
          uri: f.fileCopyUri || f.uri || '',
          name: f.name || 'file',
          type: f.type || 'application/octet-stream',
        });
        setPickedFileName(f.name || 'file');
      }
    } catch (error) {
      if (isErrorWithCode(error) && error.code === errorCodes.OPERATION_CANCELED) {
        return;
      }
      Alert.alert('Error', 'Failed to select file. Please try again.');
    }
  };

  const isImageFile = (type: string): boolean => {
    if (!type) return false;
    const lower = type.toLowerCase();
    return lower.startsWith('image/') || ['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(lower);
  };

  const formatDateForInput = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const initCurrentWeek = useCallback(() => {
    const today = new Date();
    const day = today.getDay();
    const diff = today.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(today.setDate(diff));
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    setStartDate(formatDateForInput(monday));
    setEndDate(formatDateForInput(sunday));
  }, []);

  useEffect(() => {
    const today = new Date();
    if (dateFilterType === 'today') {
      setStartDate(formatDateForInput(today));
      setEndDate(formatDateForInput(today));
    } else if (dateFilterType === 'week') {
      initCurrentWeek();
    } else if (dateFilterType === 'month') {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
      setStartDate(formatDateForInput(first));
      setEndDate(formatDateForInput(last));
    } else if (dateFilterType === 'all') {
      setStartDate('');
      setEndDate('');
    }
  }, [dateFilterType, initCurrentWeek]);

  const filteredFiles = useMemo(() => {
    if (dateFilterType === 'all') return files;
    const start = startDate ? new Date(startDate + 'T00:00:00') : null;
    const end = endDate ? new Date(endDate + 'T23:59:59') : null;
    return files.filter(f => {
      const date = new Date(f.uploadedAt);
      if (start && date < start) return false;
      if (end && date > end) return false;
      return true;
    });
  }, [files, dateFilterType, startDate, endDate]);

  const formatUploadDate = (dateStr: string): string => {
    if (!dateStr) return '';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return dateStr;
      return d.toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  const handleSave = async () => {
    if (!token) return;
    if (!editId && !pickedFile) {
      Alert.alert('Required', 'Please select a file to upload.');
      return;
    }
    const finalName = formName.trim() || pickedFileName || 'Untitled';
    setSaving(true);
    try {
      if (editId) {
        await realAuthService.updateReportFile(
          editId,
          { name: finalName, description: formDescription, file: pickedFile },
          token,
        );
      } else {
        await realAuthService.uploadReportFile(
          { name: finalName, description: formDescription, file: pickedFile! },
          token,
        );
      }
      setModalOpen(false);
      await load();
    } catch (e: any) {
      Alert.alert('Error', e?.message || 'Failed to save file');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (file: ReportFile) => {
    Alert.alert(
      'Delete file',
      `Delete "${file.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            if (!token) return;
            try {
              await realAuthService.deleteReportFile(file.id, token);
              await load();
            } catch (e: any) {
              Alert.alert('Error', e?.message || 'Failed to delete file');
            }
          },
        },
      ],
    );
  };

  const handleOpen = (file: ReportFile) => {
    if (!file.url) {
      Alert.alert('Unavailable', 'No file link available.');
      return;
    }
    const fileType = file.fileType || '';
    const normalizedMime = isImageFile(fileType)
      ? 'image/jpeg'
      : fileType.toLowerCase() === 'pdf'
      ? 'application/pdf'
      : fileType;

    const item = {
      id: file.id,
      title: file.name,
      filePath: file.fileName,
      mimeType: normalizedMime,
      signedUrl: file.url,
    };
    setViewerItem(item);
    setViewerUrl(file.url);
    setViewerVisible(true);
  };

  const iconFor = (type: string): string => {
    if (!type) return 'insert-drive-file';
    const lower = type.toLowerCase();
    if (isImageFile(lower)) return 'image';
    if (lower === 'application/pdf' || lower === 'pdf') return 'picture-as-pdf';
    if (lower.includes('csv') || lower.includes('sheet') || lower.includes('excel') || lower === 'csv' || lower === 'xls' || lower === 'xlsx') return 'grid-on';
    return 'insert-drive-file';
  };

  const renderItem = ({ item }: { item: ReportFile }) => (
    <TouchableOpacity style={styles.card} activeOpacity={0.7} onPress={() => handleOpen(item)}>
      <View style={styles.cardIcon}>
        <Icon name={iconFor(item.fileType)} size={20} color={theme.colors.primary} />
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={1}>{item.name}</Text>
        {item.description ? (
          <Text style={styles.cardDesc} numberOfLines={2}>{item.description}</Text>
        ) : null}
        <Text style={styles.cardMeta} numberOfLines={1}>
          {item.fileName}{item.fileSize ? ` · ${item.fileSize}` : ''}
        </Text>
        <Text style={styles.cardMeta} numberOfLines={1}>
          {formatUploadDate(item.uploadedAt)}{item.uploadedBy ? ` · By ${item.uploadedBy}` : ''}
        </Text>
      </View>
      <View style={styles.cardActions}>
        {canEdit ? (
          <TouchableOpacity style={styles.actionBtn} onPress={() => openEdit(item)}>
            <Icon name="edit" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        ) : null}
        {canDelete ? (
          <TouchableOpacity style={styles.actionBtn} onPress={() => handleDelete(item)}>
            <Icon name="delete-outline" size={20} color={theme.colors.error} />
          </TouchableOpacity>
        ) : null}
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <Header
        title="Reports"
        showNotificationIcon={false}
        showHomeIcon
        onHomePress={() => navigation.goBack()}
      />

      {loading && !refreshing ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={theme.colors.primary} />
      ) : accessDenied ? (
        <View style={styles.emptyWrap}>
          <Icon name="lock" size={48} color={theme.colors.textSecondary} />
          <Text style={styles.emptyTitle}>Access Denied</Text>
          <Text style={styles.emptyText}>
            You do not have permission to view reports. Ask your administrator to grant the
            report.view permission.
          </Text>
        </View>
      ) : (
        <FlatList
          data={filteredFiles}
          keyExtractor={(it) => it.id}
          renderItem={renderItem}
          contentContainerStyle={filteredFiles.length ? styles.listContent : styles.listEmpty}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
          ListHeaderComponent={
            <View style={styles.filterChipsRow}>
              {(['week', 'month', 'today', 'all'] as const).map(type => {
                const active = dateFilterType === type;
                const label =
                  type === 'week'
                    ? 'This Week'
                    : type === 'month'
                    ? 'This Month'
                    : type === 'today'
                    ? 'Today'
                    : 'All';
                return (
                  <TouchableOpacity
                    key={type}
                    style={[styles.filterChip, active && styles.filterChipActive]}
                    onPress={() => setDateFilterType(type)}
                  >
                    <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          }
          ListEmptyComponent={
            <View style={styles.emptyWrap}>
              <Icon name="folder-open" size={48} color={theme.colors.textSecondary} />
              <Text style={styles.emptyTitle}>No Private Files</Text>
              <Text style={styles.emptyText}>
                {canAdd ? 'Tap + to upload your first confidential document.' : 'No files have been uploaded yet.'}
              </Text>
            </View>
          }
        />
      )}

      {canAdd && !accessDenied ? (
        <TouchableOpacity style={styles.fab} activeOpacity={0.85} onPress={openUpload}>
          <Icon name="add" size={28} color="#FFFFFF" />
        </TouchableOpacity>
      ) : null}

      <Modal visible={modalOpen} transparent animationType="fade" onRequestClose={() => setModalOpen(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{editId ? 'Edit File Details' : 'Upload Private File'}</Text>
              <TouchableOpacity onPress={() => setModalOpen(false)}>
                <Icon name="close" size={22} color={theme.colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.label}>Document Name (Optional)</Text>
            <TextInput
              style={styles.input}
              value={formName}
              onChangeText={setFormName}
              placeholder="e.g. Q1 Audit Report (Defaults to filename)"
              placeholderTextColor={theme.colors.textSecondary}
            />

            <Text style={styles.label}>Description</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={formDescription}
              onChangeText={setFormDescription}
              placeholder="Brief explanation of contents"
              placeholderTextColor={theme.colors.textSecondary}
              multiline
            />

            <Text style={styles.label}>{editId ? 'Replace File (optional)' : 'Select File *'}</Text>
            <TouchableOpacity style={styles.filePicker} onPress={handlePick} activeOpacity={0.7}>
              <Icon name="attach-file" size={18} color={theme.colors.primary} />
              <Text style={styles.filePickerText} numberOfLines={1}>
                {pickedFileName || 'Choose file'}
              </Text>
            </TouchableOpacity>

            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
                onPress={handleSave}
                disabled={saving}
              >
                <Text style={styles.saveText}>{saving ? 'Saving...' : editId ? 'Save' : 'Upload'}</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <FileViewerModal
        visible={viewerVisible}
        item={viewerItem}
        url={viewerUrl}
        onClose={() => {
          setViewerVisible(false);
          setViewerItem(null);
          setViewerUrl(null);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  listContent: { padding: theme.spacing.md },
  listEmpty: { flexGrow: 1, justifyContent: 'center' },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  cardIcon: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#EEF1FF',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  cardBody: { flex: 1 },
  cardName: { fontSize: 15, fontWeight: '600', color: theme.colors.text },
  cardDesc: { fontSize: 12, color: theme.colors.textSecondary, marginTop: 2 },
  cardMeta: { fontSize: 11, color: theme.colors.textSecondary, marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center' },
  actionBtn: { padding: 6, marginLeft: 2 },
  emptyWrap: { alignItems: 'center', padding: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text, marginTop: 12 },
  emptyText: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 6, textAlign: 'center' },
  fab: {
    position: 'absolute',
    right: 20,
    bottom: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalBox: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: theme.colors.surface,
    borderRadius: 16,
    padding: theme.spacing.md,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.sm,
  },
  modalTitle: { fontSize: 16, fontWeight: '600', color: theme.colors.text },
  label: { fontSize: 13, color: theme.colors.textSecondary, marginTop: 10, marginBottom: 4 },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  textArea: { minHeight: 70, textAlignVertical: 'top' },
  filePicker: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: theme.colors.primary,
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  filePickerText: { flex: 1, fontSize: 14, color: theme.colors.text, marginLeft: 6 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', marginTop: 16 },
  cancelBtn: { paddingVertical: 10, paddingHorizontal: 16 },
  cancelText: { fontSize: 14, fontWeight: '600', color: theme.colors.textSecondary },
  saveBtn: {
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
    marginLeft: 8,
  },
  saveBtnDisabled: { opacity: 0.5 },
  saveText: { fontSize: 14, fontWeight: 'bold', color: '#FFFFFF' },
  filterChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: theme.colors.surface,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: theme.colors.border,
    marginBottom: 10,
  },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: {
    backgroundColor: theme.colors.primary,
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
});

export default ReportsScreen;
