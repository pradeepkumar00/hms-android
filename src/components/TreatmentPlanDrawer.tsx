import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Switch,
  TextInput,
  Dimensions,
  Image,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { theme } from '../constants/theme';
import ModalBackdrop from './ModalBackdrop';
import { useAppSelector, selectManageServices, selectAppDataLoading } from '../store';
import {
  filterManageServicesByType,
  toManageServiceSummaries,
} from '../utils/manageServices';

const PAYMENT_MODES = ['Cash', 'UPI', 'Card', 'Cheque', 'Online'];
const SHEET_MAX_HEIGHT = Math.round(Dimensions.get('window').height * 0.92);
const TEETH_IMAGE_BASE = 'https://hms.octusai.com/assets/images/teeth';

// Primary teeth reuse permanent tooth artwork on the server.
const PRIMARY_TOOTH_IMAGE_MAP: Record<number, number> = {
  55: 15,
  54: 14,
  53: 13,
  52: 12,
  51: 11,
  61: 21,
  62: 22,
  63: 23,
  64: 24,
  65: 25,
  85: 45,
  84: 44,
  83: 43,
  82: 42,
  81: 41,
  71: 31,
  72: 32,
  73: 33,
  74: 34,
  75: 35,
};

const getToothImageUri = (tooth: number) => {
  const imageTooth = PRIMARY_TOOTH_IMAGE_MAP[tooth] ?? tooth;
  return `${TEETH_IMAGE_BASE}/${imageTooth}_.png`;
};

const UPPER_RIGHT = [18, 17, 16, 15, 14, 13, 12, 11];
const UPPER_LEFT = [21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_RIGHT = [48, 47, 46, 45, 44, 43, 42, 41];
const LOWER_LEFT = [31, 32, 33, 34, 35, 36, 37, 38];
const UPPER_PRIMARY_RIGHT = [55, 54, 53, 52, 51];
const UPPER_PRIMARY_LEFT = [61, 62, 63, 64, 65];
const LOWER_PRIMARY_RIGHT = [85, 84, 83, 82, 81];
const LOWER_PRIMARY_LEFT = [71, 72, 73, 74, 75];

// Fixed slots per quadrant half so the midline divider aligns across all arches.
const TEETH_SLOTS_PER_SIDE = 8;
const TOOTH_SLOT_WIDTH = 36;
const TEETH_SIDE_WIDTH = TEETH_SLOTS_PER_SIDE * TOOTH_SLOT_WIDTH;

interface TreatmentRow {
  id: string;
  expanded: boolean;
  treatmentName: string;
  serviceId?: string;
  amountPerTooth: string;
  selectedTeeth: number[];
  note: string;
  followUpDate: Date;
}

interface ManageServiceItem {
  _id: string;
  name: string;
  price: number;
}

interface TreatmentPlanSavePayload {
  treatments: TreatmentRow[];
  paidAmount: number;
  discount: number;
  paymentMode: string;
  refId: string;
  totalAmount: number;
  advanced: boolean;
}

interface TreatmentPlanDrawerProps {
  visible: boolean;
  onClose: () => void;
  token?: string | null;
  onSave?: (payload: TreatmentPlanSavePayload) => Promise<void> | void;
}

const defaultFollowUpDate = () => new Date();

const formatFollowUpDate = (date: Date) =>
  date.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

const rowTotal = (row: TreatmentRow) => {
  const perTooth = Number(row.amountPerTooth) || 0;
  return perTooth * row.selectedTeeth.length;
};

const rowNoteLabel = (row: TreatmentRow) =>
  row.treatmentName.trim() || row.note.trim() || '—';

const serviceAmount = (service: ManageServiceItem) => service.price;

const createRow = (): TreatmentRow => ({
  id: `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
  expanded: false,
  treatmentName: '',
  amountPerTooth: '0',
  selectedTeeth: [],
  note: '',
  followUpDate: defaultFollowUpDate(),
});

interface TeethSelectorProps {
  selectedTeeth: number[];
  onToggle: (tooth: number) => void;
  advanced?: boolean;
}

const ToothButton: React.FC<{
  tooth: number;
  selected: boolean;
  onToggle: (tooth: number) => void;
}> = ({ tooth, selected, onToggle }) => (
  <TouchableOpacity
    style={styles.toothItem}
    activeOpacity={0.8}
    onPress={() => onToggle(tooth)}
  >
    <View style={[styles.toothImageWrap, selected && styles.toothImageWrapSelected]}>
      <Image
        source={{ uri: getToothImageUri(tooth) }}
        style={styles.toothImage}
        resizeMode="contain"
      />
    </View>
    <Text style={[styles.toothNumber, selected && styles.toothNumberSelected]}>
      {tooth}
    </Text>
  </TouchableOpacity>
);

const TeethArch: React.FC<{
  rightTeeth: number[];
  leftTeeth: number[];
  selectedTeeth: number[];
  onToggle: (tooth: number) => void;
}> = ({ rightTeeth, leftTeeth, selectedTeeth, onToggle }) => (
  <View style={styles.teethArchRow}>
    <View style={[styles.teethGroup, styles.teethGroupRight]}>
      {rightTeeth.map(tooth => (
        <ToothButton
          key={tooth}
          tooth={tooth}
          selected={selectedTeeth.includes(tooth)}
          onToggle={onToggle}
        />
      ))}
    </View>
    <View style={styles.teethDivider} />
    <View style={[styles.teethGroup, styles.teethGroupLeft]}>
      {leftTeeth.map(tooth => (
        <ToothButton
          key={tooth}
          tooth={tooth}
          selected={selectedTeeth.includes(tooth)}
          onToggle={onToggle}
        />
      ))}
    </View>
  </View>
);

const TeethSelector: React.FC<TeethSelectorProps> = ({
  selectedTeeth,
  onToggle,
  advanced = false,
}) => (
  <View style={styles.teethSelector}>
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.teethChartScroll}
    >
      <View style={styles.teethChart}>
        {advanced && (
          <TeethArch
            rightTeeth={UPPER_PRIMARY_RIGHT}
            leftTeeth={UPPER_PRIMARY_LEFT}
            selectedTeeth={selectedTeeth}
            onToggle={onToggle}
          />
        )}
        <TeethArch
          rightTeeth={UPPER_RIGHT}
          leftTeeth={UPPER_LEFT}
          selectedTeeth={selectedTeeth}
          onToggle={onToggle}
        />
        <TeethArch
          rightTeeth={LOWER_RIGHT}
          leftTeeth={LOWER_LEFT}
          selectedTeeth={selectedTeeth}
          onToggle={onToggle}
        />
        {advanced && (
          <TeethArch
            rightTeeth={LOWER_PRIMARY_RIGHT}
            leftTeeth={LOWER_PRIMARY_LEFT}
            selectedTeeth={selectedTeeth}
            onToggle={onToggle}
          />
        )}
      </View>
    </ScrollView>
  </View>
);

const TreatmentPlanDrawer: React.FC<TreatmentPlanDrawerProps> = ({
  visible,
  onClose,
  token,
  onSave,
}) => {
  const insets = useSafeAreaInsets();
  const manageServiceRecords = useAppSelector(selectManageServices);
  const appDataLoading = useAppSelector(selectAppDataLoading);
  const [advanced, setAdvanced] = useState(false);
  const [rows, setRows] = useState<TreatmentRow[]>([createRow()]);
  const [paidAmount, setPaidAmount] = useState('0');
  const [discount, setDiscount] = useState('0');
  const [paymentMode, setPaymentMode] = useState('Cash');
  const [paymentModeOpen, setPaymentModeOpen] = useState(false);
  const [refId, setRefId] = useState('');
  const [saving, setSaving] = useState(false);
  const [servicePickerRowId, setServicePickerRowId] = useState<string | null>(
    null,
  );

  const treatmentServices = useMemo(
    () =>
      toManageServiceSummaries(
        filterManageServicesByType(manageServiceRecords, 'treatment'),
      ),
    [manageServiceRecords],
  );

  const totalAmount = useMemo(
    () => rows.reduce((sum, row) => sum + rowTotal(row), 0),
    [rows],
  );

  const activePickerRow = useMemo(
    () => rows.find(row => row.id === servicePickerRowId),
    [rows, servicePickerRowId],
  );

  const filteredServices = useMemo(() => {
    if (!servicePickerRowId) return [];
    const query = (activePickerRow?.treatmentName || '').trim().toLowerCase();
    if (!query) return treatmentServices;
    return treatmentServices.filter(service =>
      (service.name || '').toLowerCase().includes(query),
    );
  }, [servicePickerRowId, activePickerRow, treatmentServices]);

  const updateRow = (id: string, patch: Partial<TreatmentRow>) => {
    setRows(prev =>
      prev.map(row => (row.id === id ? { ...row, ...patch } : row)),
    );
  };

  const openServicePicker = (rowId: string) => {
    setServicePickerRowId(rowId);
  };

  const selectService = (rowId: string, service: ManageServiceItem) => {
    updateRow(rowId, {
      treatmentName: service.name,
      serviceId: service._id,
      amountPerTooth: String(serviceAmount(service)),
    });
    setServicePickerRowId(null);
  };

  const toggleRowExpanded = (id: string, expanded: boolean) => {
    setRows(prev =>
      prev.map(row => (row.id === id ? { ...row, expanded } : row)),
    );
  };

  const toggleTooth = (rowId: string, tooth: number) => {
    setRows(prev =>
      prev.map(row => {
        if (row.id !== rowId) return row;
        const selected = row.selectedTeeth.includes(tooth)
          ? row.selectedTeeth.filter(t => t !== tooth)
          : [...row.selectedTeeth, tooth];
        return { ...row, selectedTeeth: selected };
      }),
    );
  };

  const resetForm = () => {
    setAdvanced(false);
    setRows([createRow()]);
    setPaidAmount('0');
    setDiscount('0');
    setPaymentMode('Cash');
    setPaymentModeOpen(false);
    setRefId('');
    setServicePickerRowId(null);
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleAddRow = () => {
    setRows(prev => [...prev, createRow()]);
  };

  const handleRemoveRow = (id: string) => {
    setRows(prev => {
      if (prev.length <= 1) return prev;
      return prev.filter(row => row.id !== id);
    });
  };

  const handleSave = async () => {
    const validRows = rows.filter(row => row.treatmentName.trim());
    if (validRows.length === 0) {
      Alert.alert('Missing treatment', 'Please enter at least one treatment name.');
      return;
    }

    setSaving(true);
    try {
      await onSave?.({
        treatments: rows,
        paidAmount: Number(paidAmount) || 0,
        discount: Number(discount) || 0,
        paymentMode,
        refId: refId.trim(),
        totalAmount,
        advanced,
      });
      resetForm();
      onClose();
    } catch {
      // Parent shows the error alert.
    } finally {
      setSaving(false);
    }
  };

  const renderTreatmentFields = (row: TreatmentRow) => (
    <>
      <Text style={styles.formLabel}>Treatment Name</Text>
      <TextInput
        style={styles.formInput}
        value={row.treatmentName}
        onChangeText={text => {
          updateRow(row.id, {
            treatmentName: text,
            serviceId: undefined,
          });
          setServicePickerRowId(row.id);
        }}
        onFocus={() => openServicePicker(row.id)}
        placeholder="Search treatment name"
        placeholderTextColor={theme.colors.placeholder}
      />
      {servicePickerRowId === row.id && (
        <View style={styles.serviceDropdown}>
          {appDataLoading ? (
            <ActivityIndicator
              size="small"
              color={theme.colors.primary}
              style={styles.serviceLoader}
            />
          ) : filteredServices.length === 0 ? (
            <Text style={styles.serviceEmptyText}>No treatments found</Text>
          ) : (
            <ScrollView
              nestedScrollEnabled
              keyboardShouldPersistTaps="handled"
              style={styles.serviceDropdownScroll}
            >
              {filteredServices.map(service => (
                <TouchableOpacity
                  key={service._id}
                  style={styles.serviceOption}
                  activeOpacity={0.8}
                  onPress={() => selectService(row.id, service)}
                >
                  <Text style={styles.serviceOptionName}>{service.name}</Text>
                  <Text style={styles.serviceOptionPrice}>
                    ₹ {serviceAmount(service)}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>
      )}

      <Text style={styles.formLabel}>Treatment Amount(/per teeth)</Text>
      <TextInput
        style={styles.formInput}
        value={row.amountPerTooth}
        onChangeText={text => updateRow(row.id, { amountPerTooth: text })}
        keyboardType="numeric"
        placeholder="0"
        placeholderTextColor={theme.colors.placeholder}
      />

      <TeethSelector
        selectedTeeth={row.selectedTeeth}
        onToggle={tooth => toggleTooth(row.id, tooth)}
        advanced={advanced}
      />

      <Text style={styles.formLabel}>Total Amount</Text>
      <TextInput
        style={styles.formInput}
        value={String(rowTotal(row))}
        editable={false}
      />

      <Text style={styles.formLabel}>Note</Text>
      <TextInput
        style={styles.formInput}
        value={row.note}
        onChangeText={text => updateRow(row.id, { note: text })}
        placeholder="Add Note"
        placeholderTextColor={theme.colors.placeholder}
      />
    </>
  );

  const renderExpandedRow = (row: TreatmentRow, index: number) => (
    <View key={row.id} style={styles.expandedRow}>
      <View style={[styles.tableRow, styles.expandedHeaderRow]}>
        <View style={styles.colSerial}>
          <Text style={styles.tableCell}>{index + 1}.</Text>
        </View>
        <View style={styles.colNote}>
          <Text
            style={[styles.tableCell, styles.noteMuted]}
            numberOfLines={2}
          >
            {rowNoteLabel(row)}
          </Text>
        </View>
        <View style={styles.colFollowUp}>
          <Text style={styles.tableCell} numberOfLines={2}>
            {formatFollowUpDate(row.followUpDate)}
          </Text>
        </View>
        <View style={[styles.colActions, styles.actionCell]}>
          <TouchableOpacity
            style={styles.actionBtn}
            activeOpacity={0.8}
            onPress={() => toggleRowExpanded(row.id, false)}
          >
            <Icon name="remove" size={18} color={theme.colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.actionBtn,
              rows.length <= 1 && styles.actionBtnDisabled,
            ]}
            activeOpacity={0.8}
            disabled={rows.length <= 1}
            onPress={() => handleRemoveRow(row.id)}
          >
            <Icon
              name="delete-outline"
              size={18}
              color={
                rows.length <= 1 ? theme.colors.disabled : theme.colors.error
              }
            />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.expandedBody}>
        {renderTreatmentFields(row)}
      </View>
    </View>
  );

  const renderCollapsedRow = (row: TreatmentRow, index: number) => (
    <View key={row.id} style={styles.tableRow}>
      <View style={styles.colSerial}>
        <Text style={styles.tableCell}>{index + 1}.</Text>
      </View>
      <View style={styles.colNote}>
        <Text
          style={[styles.tableCell, styles.noteMuted]}
          numberOfLines={2}
        >
          {rowNoteLabel(row)}
        </Text>
      </View>
      <View style={styles.colFollowUp}>
        <Text style={styles.tableCell} numberOfLines={2}>
          {formatFollowUpDate(row.followUpDate)}
        </Text>
      </View>
      <View style={[styles.colActions, styles.actionCell]}>
        <TouchableOpacity
          style={styles.actionBtn}
          activeOpacity={0.8}
          onPress={() => toggleRowExpanded(row.id, true)}
        >
          <Icon name="add" size={18} color={theme.colors.primary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.actionBtn, rows.length <= 1 && styles.actionBtnDisabled]}
          activeOpacity={0.8}
          disabled={rows.length <= 1}
          onPress={() => handleRemoveRow(row.id)}
        >
          <Icon
            name="delete-outline"
            size={18}
            color={
              rows.length <= 1 ? theme.colors.disabled : theme.colors.error
            }
          />
        </TouchableOpacity>
      </View>
    </View>
  );

  return (
    <ModalBackdrop
      visible={visible}
      onClose={handleClose}
      animationType="slide"
      align="bottom"
    >
      <View
        style={[
          styles.sheet,
          {
            maxHeight: SHEET_MAX_HEIGHT,
            paddingBottom: Math.max(insets.bottom, theme.spacing.md),
          },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.headerRow}>
            <View style={styles.headerTextWrap}>
              <Text style={styles.title}>Treatment Plan</Text>
              <Text style={styles.subtitle}>
                Pick treatments from Manage Service, select teeth, and generate
                bill
              </Text>
            </View>
            <TouchableOpacity
              style={styles.closeBtn}
              onPress={handleClose}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Icon name="close" size={20} color={theme.colors.text} />
            </TouchableOpacity>
          </View>

          <View style={styles.treatmentCard}>
            <View style={styles.treatmentTopRow}>
              <Text style={styles.treatmentLabel}>Treatment</Text>
              <TouchableOpacity
                style={styles.manageServiceBtn}
                activeOpacity={0.8}
                onPress={() => {
                  const expandedRow = rows.find(r => r.expanded);
                  if (expandedRow) {
                    openServicePicker(expandedRow.id);
                  }
                }}
              >
                <Text style={styles.manageServiceText}>From Manage Service</Text>
              </TouchableOpacity>
              <View style={styles.advancedWrap}>
                <Text style={styles.advancedLabel}>Advanced</Text>
                <Switch
                  value={advanced}
                  onValueChange={setAdvanced}
                  trackColor={{
                    false: theme.colors.border,
                    true: `${theme.colors.primary}55`,
                  }}
                  thumbColor={
                    advanced ? theme.colors.primary : theme.colors.textSecondary
                  }
                />
              </View>
            </View>

            <View style={styles.tableWrap}>
              <View style={styles.tableHeader}>
                <View style={styles.colSerial}>
                  <Text style={styles.tableHeaderCell}>S. No.</Text>
                </View>
                <View style={styles.colNote}>
                  <Text style={styles.tableHeaderCell}>Treatment Note</Text>
                </View>
                <View style={styles.colFollowUp}>
                  <Text style={styles.tableHeaderCell}>Follow Up</Text>
                </View>
                <View style={styles.colActions}>
                  <Text style={[styles.tableHeaderCell, styles.tableHeaderActions]}>
                    Actions
                  </Text>
                </View>
              </View>

              {rows.map((row, index) =>
                row.expanded
                  ? renderExpandedRow(row, index)
                  : renderCollapsedRow(row, index),
              )}
            </View>

            <TouchableOpacity
              style={styles.addMoreBtn}
              activeOpacity={0.85}
              onPress={handleAddRow}
            >
              <Icon name="add" size={18} color={theme.colors.surface} />
              <Text style={styles.addMoreText}>Add More</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.totalBar}>
            <Text style={styles.totalLabel}>Total amount</Text>
            <Text style={styles.totalValue}>₹ {totalAmount}</Text>
          </View>

          <Text style={styles.fieldLabel}>PAID AMOUNT</Text>
          <TextInput
            style={styles.fieldInput}
            value={paidAmount}
            onChangeText={setPaidAmount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={theme.colors.placeholder}
          />

          <Text style={styles.fieldLabel}>DISCOUNT</Text>
          <TextInput
            style={styles.fieldInput}
            value={discount}
            onChangeText={setDiscount}
            keyboardType="numeric"
            placeholder="0"
            placeholderTextColor={theme.colors.placeholder}
          />

          <Text style={styles.fieldLabel}>PAYMENT MODE</Text>
          <TouchableOpacity
            style={styles.fieldInput}
            activeOpacity={0.8}
            onPress={() => setPaymentModeOpen(open => !open)}
          >
            <View style={styles.paymentModeRow}>
              <Text style={styles.paymentModeText}>{paymentMode}</Text>
              <Icon
                name={paymentModeOpen ? 'expand-less' : 'expand-more'}
                size={22}
                color={theme.colors.textSecondary}
              />
            </View>
          </TouchableOpacity>
          {paymentModeOpen && (
            <View style={styles.dropdownList}>
              {PAYMENT_MODES.map(mode => {
                const active = mode === paymentMode;
                return (
                  <TouchableOpacity
                    key={mode}
                    style={styles.dropdownItem}
                    activeOpacity={0.8}
                    onPress={() => {
                      setPaymentMode(mode);
                      setPaymentModeOpen(false);
                    }}
                  >
                    <Text
                      style={[
                        styles.dropdownItemText,
                        active && styles.dropdownItemTextActive,
                      ]}
                    >
                      {mode}
                    </Text>
                    {active && (
                      <Icon name="check" size={18} color={theme.colors.primary} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          <Text style={styles.fieldLabel}>REF ID</Text>
          <TextInput
            style={styles.fieldInput}
            value={refId}
            onChangeText={setRefId}
            placeholder=""
            placeholderTextColor={theme.colors.placeholder}
            autoCapitalize="characters"
          />

          <TouchableOpacity
            style={[styles.saveBtn, saving && styles.saveBtnDisabled]}
            activeOpacity={0.85}
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={theme.colors.surface} />
            ) : (
              <Text style={styles.saveBtnText}>Save plan & bill</Text>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.cancelBtn}
            activeOpacity={0.85}
            onPress={handleClose}
          >
            <Text style={styles.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>
    </ModalBackdrop>
  );
};

const styles = StyleSheet.create({
  sheet: {
    zIndex: 1,
    backgroundColor: theme.colors.surface,
    borderTopLeftRadius: theme.borderRadius.xl,
    borderTopRightRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.md,
  },
  headerTextWrap: {
    flex: 1,
    paddingRight: theme.spacing.sm,
  },
  title: {
    fontSize: theme.typography.fontSizes.xxl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  subtitle: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  treatmentCard: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  treatmentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginBottom: theme.spacing.md,
    gap: theme.spacing.sm,
  },
  treatmentLabel: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  manageServiceBtn: {
    borderWidth: 1,
    borderColor: '#90CAF9',
    backgroundColor: '#E3F2FD',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 6,
    paddingHorizontal: theme.spacing.sm,
  },
  manageServiceText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#1565C0',
  },
  advancedWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
  },
  advancedLabel: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginRight: theme.spacing.xs,
  },
  tableWrap: {
    borderWidth: 1,
    borderColor: '#D1C4E9',
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: '#F3E5F5',
  },
  tableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: '#EDE7F6',
    borderBottomWidth: 1,
    borderBottomColor: '#D1C4E9',
  },
  tableHeaderCell: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#5E35B1',
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 44,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: '#D1C4E9',
  },
  tableCell: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
    lineHeight: 20,
  },
  noteMuted: {
    color: theme.colors.textSecondary,
  },
  colSerial: {
    width: 44,
    justifyContent: 'center',
  },
  colNote: {
    flex: 1.2,
    paddingRight: theme.spacing.xs,
    justifyContent: 'center',
  },
  colFollowUp: {
    flex: 1,
    paddingRight: theme.spacing.xs,
    justifyContent: 'center',
  },
  colActions: {
    width: 72,
    justifyContent: 'center',
  },
  tableHeaderActions: {
    textAlign: 'right',
  },
  actionCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  actionBtn: {
    width: 30,
    height: 30,
    borderRadius: theme.borderRadius.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  actionBtnDisabled: {
    opacity: 0.5,
  },
  expandedRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#D1C4E9',
    backgroundColor: theme.colors.surface,
  },
  expandedHeaderRow: {
    backgroundColor: '#EDE7F6',
  },
  expandedBody: {
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  formLabel: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  formInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
    ...theme.shadows.sm,
  },
  serviceDropdown: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.xs,
    backgroundColor: theme.colors.surface,
    overflow: 'hidden',
  },
  serviceDropdownScroll: {
    maxHeight: 180,
  },
  serviceLoader: {
    paddingVertical: theme.spacing.md,
  },
  serviceEmptyText: {
    padding: theme.spacing.md,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  serviceOption: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  serviceOptionName: {
    flex: 1,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  serviceOptionPrice: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
  },
  teethSelector: {
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: theme.colors.border,
  },
  teethChartScroll: {
    paddingHorizontal: theme.spacing.xs,
  },
  teethChart: {
    flexDirection: 'column',
    alignSelf: 'center',
    width: TEETH_SIDE_WIDTH * 2 + 9,
  },
  teethArchRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    marginVertical: theme.spacing.xs,
  },
  teethGroup: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    width: TEETH_SIDE_WIDTH,
  },
  teethGroupRight: {
    justifyContent: 'flex-end',
  },
  teethGroupLeft: {
    justifyContent: 'flex-start',
  },
  teethDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: theme.colors.border,
    marginHorizontal: 4,
  },
  toothItem: {
    alignItems: 'center',
    width: TOOTH_SLOT_WIDTH,
  },
  toothImageWrap: {
    width: 28,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.borderRadius.sm,
    padding: 2,
  },
  toothImageWrapSelected: {
    backgroundColor: `${theme.colors.primary}22`,
    borderWidth: 1.5,
    borderColor: theme.colors.primary,
  },
  toothImage: {
    width: 24,
    height: 32,
  },
  toothNumber: {
    marginTop: 2,
    fontSize: 10,
    color: theme.colors.textSecondary,
  },
  toothNumberSelected: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.bold,
  },
  addMoreBtn: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111827',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    marginTop: theme.spacing.md,
    gap: 4,
  },
  addMoreText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  totalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#E3F2FD',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  totalLabel: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  totalValue: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#1565C0',
  },
  fieldLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.textSecondary,
    letterSpacing: 0.5,
    marginBottom: theme.spacing.xs,
    marginTop: theme.spacing.sm,
  },
  fieldInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.surface,
  },
  paymentModeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentModeText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  dropdownList: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    marginTop: theme.spacing.xs,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  dropdownItemText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  dropdownItemTextActive: {
    color: theme.colors.primary,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  saveBtn: {
    marginTop: theme.spacing.lg,
    backgroundColor: theme.colors.primary,
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.7,
  },
  saveBtnText: {
    color: theme.colors.surface,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
  cancelBtn: {
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    backgroundColor: '#ECEFF1',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: theme.spacing.md,
    alignItems: 'center',
  },
  cancelBtnText: {
    color: theme.colors.text,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default TreatmentPlanDrawer;
