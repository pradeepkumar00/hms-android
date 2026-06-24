import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  TextInput,
  ActivityIndicator,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { theme } from '../constants/theme';
import ModalBackdrop from './ModalBackdrop';
import { useAppSelector, selectAuthToken } from '../store';

export interface TreatmentPlanItem {
  treatmentDesc?: string;
  title?: string;
  treatmentAmount?: number;
  expenseAmount?: number;
  qty?: number;
  teeth?: Record<string, number[]>;
  description?: string;
  appointment?: string;
  manageServiceId?: string;
  isAdvanced?: boolean;
}

export interface TreatmentPlanPayment {
  amount?: number;
  paidAmount?: number;
  paymentMode?: string;
  createdAt?: string;
  date?: string;
}

export interface TreatmentPlanRecord {
  _id?: string;
  groupId?: string;
  refId?: string;
  patientId?: string;
  title?: string;
  items?: TreatmentPlanItem[];
  totalAmount?: number;
  paidAmount?: number;
  discount?: number;
  dueAmount?: number;
  doctorName?: string;
  paymentMode?: string;
  status?: string;
  cancelRemark?: string;
  remark?: string;
  payments?: TreatmentPlanPayment[];
  paymentHistory?: TreatmentPlanPayment[];
  createdAt?: string;
  updatedAt?: string;
}

interface TreatmentPlanCardProps {
  plan: TreatmentPlanRecord;
  patientId?: string;
  canManage?: boolean;
  onEdit?: (plan: TreatmentPlanRecord) => void;
  onCancelled?: () => void | Promise<void>;
}

const countTeeth = (items: TreatmentPlanItem[] = []) =>
  items.reduce((sum, item) => {
    const teeth = item.teeth || {};
    return (
      sum +
      Object.values(teeth).reduce(
        (archSum, nums) => archSum + (nums?.length || 0),
        0,
      )
    );
  }, 0);

const formatPaymentWhen = (value?: string) => {
  if (!value) return '';
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  const datePart = d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
  });
  const timePart = d.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
};

const planPayments = (plan: TreatmentPlanRecord): TreatmentPlanPayment[] => {
  if (plan.payments?.length) return plan.payments;
  if (plan.paymentHistory?.length) return plan.paymentHistory;
  if ((plan.paidAmount ?? 0) > 0) {
    return [
      {
        amount: plan.paidAmount,
        paymentMode: plan.paymentMode,
        createdAt: plan.updatedAt || plan.createdAt,
      },
    ];
  }
  return [];
};

const isCancelled = (plan: TreatmentPlanRecord) => {
  const status = (plan.status || '').toLowerCase();
  return status === 'cancelled' || status === 'canceled';
};

const planDueAmount = (plan: TreatmentPlanRecord) => {
  if (typeof plan.dueAmount === 'number') {
    return Math.max(0, plan.dueAmount);
  }
  if (isCancelled(plan)) return 0;
  const total = plan.totalAmount ?? 0;
  const paid = plan.paidAmount ?? 0;
  const discount = plan.discount ?? 0;
  return Math.max(0, total - discount - paid);
};

const isSettled = (plan: TreatmentPlanRecord) => {
  if (isCancelled(plan)) return false;
  if (plan.status?.toLowerCase() === 'settled') return true;
  const due = planDueAmount(plan);
  const netBill = (plan.totalAmount ?? 0) - (plan.discount ?? 0);
  return due === 0 && netBill > 0;
};

const isDue = (plan: TreatmentPlanRecord) => {
  if (isCancelled(plan)) return false;
  if ((plan.status || '').toLowerCase() === 'due') return true;
  if (isSettled(plan)) return false;
  return planDueAmount(plan) > 0;
};

const planCancelRemark = (plan: TreatmentPlanRecord) =>
  (plan.cancelRemark || plan.remark || '').trim();

const planGroupId = (plan: TreatmentPlanRecord) =>
  plan.groupId || plan.refId || plan._id || '';

const CancelNoteBox = ({
  text,
  style,
}: {
  text: string;
  style?: object;
}) => (
  <View style={[styles.cancelNoteBox, style]}>
    <Text style={styles.cancelNoteText}>{text}</Text>
  </View>
);

const TreatmentPlanCard: React.FC<TreatmentPlanCardProps> = ({
  plan,
  patientId,
  canManage = true,
  onEdit,
  onCancelled,
}) => {
  const token = useAppSelector(selectAuthToken);
  const [expanded, setExpanded] = useState(false);
  const [cancelModalVisible, setCancelModalVisible] = useState(false);
  const [cancelRemark, setCancelRemark] = useState('');
  const [cancelling, setCancelling] = useState(false);

  const items = plan.items || [];
  const treatmentCount = items.length;
  const teethCount = countTeeth(items);
  const payments = planPayments(plan);
  const settled = isSettled(plan);
  const cancelled = isCancelled(plan);
  const due = isDue(plan);
  const cancellationRemark = planCancelRemark(plan);
  const dueAmount = planDueAmount(plan);
  const resolvedPatientId = patientId || plan.patientId || '';
  const groupId = planGroupId(plan);
  const canEdit = canManage && !!plan._id && !cancelled;
  const canCancel =
    !!groupId && !cancelled && (plan.totalAmount ?? 0) > 0;

  const toggleExpanded = () => setExpanded(prev => !prev);

  const handleEditPress = () => {
    if (!canEdit) return;
    onEdit?.(plan);
  };

  const openCancelModal = () => {
    if (!resolvedPatientId || !groupId) {
      Alert.alert(
        'Cancel Failed',
        'Treatment plan details are incomplete. Please refresh and try again.',
      );
      return;
    }
    if (!token) {
      Alert.alert('Cancel Failed', 'Your session has expired. Please log in again.');
      return;
    }
    setCancelRemark('');
    setCancelModalVisible(true);
  };

  const closeCancelModal = () => {
    if (cancelling) return;
    setCancelModalVisible(false);
    setCancelRemark('');
  };

  const handleConfirmCancel = async () => {
    const remark = cancelRemark.trim();
    if (!remark) {
      Alert.alert('Remark required', 'Please enter a reason for cancellation.');
      return;
    }
    if (!token || !resolvedPatientId || !groupId) return;

    setCancelling(true);
    try {
      const realAuthService = (await import('../services/realAuthService')).default;
      await realAuthService.cancelTreatment(
        {
          patientId: resolvedPatientId,
          groupId,
          cancelRemark: remark,
        },
        token,
      );
      setCancelModalVisible(false);
      setCancelRemark('');
      Alert.alert('Success', 'Treatment cancelled successfully.');
      await onCancelled?.();
    } catch (error) {
      console.error('Cancel treatment error:', error);
      Alert.alert(
        'Cancel Failed',
        'Could not cancel the treatment. Please try again.',
      );
    } finally {
      setCancelling(false);
    }
  };

  return (
    <>
      <View style={styles.card}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.headerLeft}
            activeOpacity={0.9}
            onPress={toggleExpanded}
          >
            <Icon name="credit-card" size={16} color={theme.colors.surface} />
            <View style={styles.headerTextWrap}>
              <Text style={styles.headerTitle}>Treatment Plan</Text>
              <Text style={styles.headerSubtitle}>
                {treatmentCount} treatment{treatmentCount === 1 ? '' : 's'} ·{' '}
                {teethCount} teeth
              </Text>
            </View>
          </TouchableOpacity>
          <View style={styles.headerRight}>
            {canEdit ? (
              <TouchableOpacity
                style={styles.editBtn}
                activeOpacity={0.85}
                onPress={handleEditPress}
              >
                <Text style={styles.editBtnText}>Edit</Text>
              </TouchableOpacity>
            ) : null}
            {cancelled ? (
              <View style={styles.cancelledBadge}>
                <Text style={styles.cancelledBadgeText}>Cancelled</Text>
              </View>
            ) : settled ? (
              <View style={styles.statusBadge}>
                <Text style={styles.statusBadgeText}>Settled</Text>
              </View>
            ) : due ? (
              <View style={styles.dueBadge}>
                <Text style={styles.dueBadgeText}>Due</Text>
              </View>
            ) : null}
            <TouchableOpacity onPress={toggleExpanded} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Icon
                name={expanded ? 'expand-more' : 'chevron-right'}
                size={20}
                color={theme.colors.surface}
              />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity
          style={styles.summaryBody}
          activeOpacity={0.9}
          onPress={toggleExpanded}
        >
          <View style={styles.summaryRow}>
            <View style={styles.summaryField}>
              <Text style={styles.summaryLabel}>BILL</Text>
              <Text style={styles.summaryBillValue}>₹ {plan.totalAmount ?? 0}</Text>
            </View>
            <View style={styles.summaryField}>
              <Text style={styles.summaryLabel}>PAID</Text>
              <Text style={styles.summaryValue}>₹ {plan.paidAmount ?? 0}</Text>
            </View>
          </View>
          <View style={styles.summaryRow}>
            <View style={styles.summaryField}>
              <Text style={styles.summaryLabel}>DISCOUNT</Text>
              <Text style={styles.summaryValue}>₹ {plan.discount ?? 0}</Text>
            </View>
            <View style={styles.summaryField}>
              <Text style={styles.summaryLabel}>DUE</Text>
              <Text
                style={[
                  styles.summaryValue,
                  dueAmount > 0 && styles.summaryDueValue,
                ]}
              >
                ₹ {dueAmount}
              </Text>
            </View>
          </View>
          <View style={styles.summaryFieldRow}>
            <Text style={styles.summaryLabel}>DOCTOR</Text>
            <Text style={[styles.summaryValue, styles.summaryValueFlex]} numberOfLines={1}>
              {plan.doctorName || '—'}
            </Text>
          </View>
          {cancelled && !!cancellationRemark && !expanded && (
            <CancelNoteBox text={cancellationRemark} style={styles.cancelNoteCollapsed} />
          )}
        </TouchableOpacity>

        {expanded && (
          <View style={styles.expandedContent}>
            <Text style={styles.sectionLabel}>TREATMENTS</Text>
            {items.map((item, index) => {
              const name =
                item.treatmentDesc || item.title || plan.title || 'Treatment';
              const amount = item.expenseAmount ?? 0;
              const rate = item.treatmentAmount ?? 0;
              const qty = item.qty ?? 0;
              const teethEntries = Object.entries(item.teeth || {});

              return (
                <View key={`${name}-${index}`} style={styles.treatmentCard}>
                  <View style={styles.treatmentTopRow}>
                    <Text style={styles.treatmentName}>{name}</Text>
                    <Text
                      style={[
                        styles.treatmentAmount,
                        cancelled && styles.treatmentAmountCancelled,
                      ]}
                    >
                      ₹ {amount}
                    </Text>
                  </View>
                  <View style={styles.treatmentMetaRow}>
                    <Text style={styles.treatmentMeta}>Rate ₹{rate}</Text>
                    <Text style={styles.treatmentMetaDot}>·</Text>
                    <Text style={styles.treatmentMeta}>Qty {qty}</Text>
                  </View>
                  {teethEntries.map(([arch, nums]) =>
                    nums?.length ? (
                      <View key={arch} style={styles.teethRow}>
                        <Text style={styles.teethArchLabel}>
                          {arch.toUpperCase()}
                        </Text>
                        <View style={styles.teethBadges}>
                          {nums.map(num => (
                            <View key={num} style={styles.toothBadge}>
                              <Text style={styles.toothBadgeText}>{num}</Text>
                            </View>
                          ))}
                        </View>
                      </View>
                    ) : null,
                  )}
                </View>
              );
            })}

            {payments.length > 0 && (
              <>
                <Text style={styles.sectionLabel}>PAYMENT HISTORY</Text>
                {payments.map((payment, index) => {
                  const amount = payment.amount ?? payment.paidAmount ?? 0;
                  const mode = (payment.paymentMode || plan.paymentMode || 'cash')
                    .toString()
                    .toLowerCase();
                  const when = formatPaymentWhen(
                    payment.createdAt || payment.date,
                  );

                  return (
                    <View key={index} style={styles.paymentCard}>
                      <View style={styles.paymentTopRow}>
                        <Text style={styles.paymentTitle}>Payment</Text>
                        <Text style={styles.paymentAmount}>₹ {amount}</Text>
                      </View>
                      <Text style={styles.paymentMeta}>
                        {mode}
                        {when ? ` · ${when}` : ''}
                      </Text>
                    </View>
                  );
                })}
              </>
            )}

            {!cancelled && canCancel && (
              <TouchableOpacity
                style={styles.cancelBtn}
                activeOpacity={0.85}
                onPress={openCancelModal}
              >
                <Text style={styles.cancelBtnText}>Cancel Treatment</Text>
              </TouchableOpacity>
            )}

            {canEdit ? (
              <TouchableOpacity
                style={styles.editPlanBtn}
                activeOpacity={0.85}
                onPress={handleEditPress}
              >
                <Text style={styles.editPlanBtnText}>Edit Plan</Text>
              </TouchableOpacity>
            ) : null}

            {cancelled && !!cancellationRemark && (
              <CancelNoteBox
                text={`Cancelled: ${cancellationRemark}`}
                style={styles.cancelNoteExpanded}
              />
            )}
          </View>
        )}
      </View>

      <ModalBackdrop
        visible={cancelModalVisible}
        onClose={closeCancelModal}
        align="center"
        dismissOnBackdropPress={!cancelling}
      >
        <View style={styles.cancelModal}>
          <Text style={styles.cancelModalTitle}>Cancel Treatment</Text>
          <Text style={styles.cancelModalSubtitle}>
            Bill amount will become ₹0. Paid amount stays as credit — refund at
            counter if needed.
          </Text>
          <View style={styles.cancelRemarkLabelRow}>
            <Text style={styles.cancelRemarkLabel}>Cancel remark</Text>
            <Text style={styles.cancelRemarkRequired}>*</Text>
          </View>
          <TextInput
            style={styles.cancelRemarkInput}
            value={cancelRemark}
            onChangeText={setCancelRemark}
            placeholder="Reason for cancellation"
            placeholderTextColor={theme.colors.textSecondary}
            multiline
            editable={!cancelling}
          />
          <View style={styles.cancelModalActions}>
            <TouchableOpacity
              style={[styles.cancelModalBtn, styles.cancelModalBtnSecondary]}
              activeOpacity={0.85}
              disabled={cancelling}
              onPress={closeCancelModal}
            >
              <Text style={styles.cancelModalBtnSecondaryText}>Close</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.cancelModalBtn, styles.cancelModalBtnDanger]}
              activeOpacity={0.85}
              disabled={cancelling}
              onPress={handleConfirmCancel}
            >
              {cancelling ? (
                <ActivityIndicator size="small" color={theme.colors.surface} />
              ) : (
                <Text style={styles.cancelModalBtnDangerText}>
                  Cancel Treatment
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ModalBackdrop>
    </>
  );
};

const styles = StyleSheet.create({
  card: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    backgroundColor: theme.colors.surface,
    marginBottom: theme.spacing.sm,
    ...theme.shadows.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: theme.colors.primary,
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: 8,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerTextWrap: {
    marginLeft: theme.spacing.sm,
    flex: 1,
  },
  headerTitle: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.surface,
  },
  headerSubtitle: {
    fontSize: theme.typography.fontSizes.xs,
    color: 'rgba(255,255,255,0.92)',
    marginTop: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.xs,
  },
  editBtn: {
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.55)',
    borderRadius: theme.borderRadius.sm,
    paddingVertical: 3,
    paddingHorizontal: theme.spacing.sm,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  editBtnText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  statusBadge: {
    backgroundColor: '#43A047',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  statusBadgeText: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  dueBadge: {
    backgroundColor: '#F57C00',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  dueBadgeText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  cancelledBadge: {
    backgroundColor: '#D32F2F',
    borderRadius: theme.borderRadius.lg,
    paddingVertical: 4,
    paddingHorizontal: theme.spacing.sm,
  },
  cancelledBadgeText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  summaryBody: {
    paddingHorizontal: theme.spacing.sm,
    paddingVertical: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  summaryRow: {
    flexDirection: 'row',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.md,
  },
  summaryField: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.sm,
  },
  summaryFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.sm,
    gap: theme.spacing.sm,
  },
  summaryLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
    letterSpacing: 0.4,
  },
  summaryBillValue: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.success,
  },
  summaryValue: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  summaryDueValue: {
    color: '#D32F2F',
  },
  summaryValueFlex: {
    flex: 1,
  },
  expandedContent: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  sectionLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#5E35B1',
    letterSpacing: 0.6,
    paddingHorizontal: theme.spacing.md,
    paddingTop: theme.spacing.md,
    paddingBottom: theme.spacing.sm,
  },
  treatmentCard: {
    marginHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    padding: theme.spacing.sm,
    backgroundColor: theme.colors.surface,
  },
  treatmentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  treatmentName: {
    flex: 1,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginRight: theme.spacing.sm,
  },
  treatmentAmount: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  treatmentAmountCancelled: {
    color: theme.colors.success,
  },
  treatmentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.xs,
  },
  treatmentMeta: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  treatmentMetaDot: {
    marginHorizontal: 6,
    color: theme.colors.textSecondary,
  },
  teethRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: theme.spacing.sm,
    flexWrap: 'wrap',
  },
  teethArchLabel: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#5E35B1',
    marginRight: theme.spacing.sm,
  },
  teethBadges: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  toothBadge: {
    minWidth: 28,
    height: 28,
    borderRadius: theme.borderRadius.sm,
    backgroundColor: '#E3F2FD',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
  },
  toothBadgeText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#1565C0',
  },
  paymentCard: {
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.md,
    backgroundColor: theme.colors.surface,
  },
  paymentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paymentTitle: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#1565C0',
  },
  paymentAmount: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
  },
  paymentMeta: {
    marginTop: theme.spacing.xs,
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  cancelBtn: {
    marginHorizontal: theme.spacing.sm,
    marginTop: theme.spacing.xs,
    marginBottom: theme.spacing.sm,
    borderWidth: 1,
    borderColor: theme.colors.primary,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    backgroundColor: '#EEF0FF',
  },
  cancelBtnText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.primary,
  },
  editPlanBtn: {
    marginHorizontal: theme.spacing.sm,
    marginBottom: theme.spacing.xs,
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    alignItems: 'center',
    backgroundColor: '#EEF2FF',
  },
  editPlanBtnText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#4F46E5',
  },
  cancelNoteBox: {
    borderWidth: 1,
    borderColor: '#FFDAB9',
    borderRadius: theme.borderRadius.lg,
    backgroundColor: '#FFF4E5',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  cancelNoteCollapsed: {
    marginTop: theme.spacing.sm,
  },
  cancelNoteExpanded: {
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.md,
  },
  cancelNoteText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: '#A65D1F',
  },
  cancelModal: {
    marginHorizontal: theme.spacing.lg,
    backgroundColor: theme.colors.surface,
    borderRadius: theme.borderRadius.lg,
    padding: theme.spacing.lg,
    ...theme.shadows.md,
  },
  cancelModalTitle: {
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginBottom: theme.spacing.xs,
  },
  cancelModalSubtitle: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    marginBottom: theme.spacing.md,
  },
  cancelRemarkLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.xs,
  },
  cancelRemarkLabel: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  cancelRemarkRequired: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.bold,
    color: '#D32F2F',
    marginLeft: 2,
  },
  cancelRemarkInput: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.borderRadius.md,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    minHeight: 88,
    textAlignVertical: 'top',
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
    backgroundColor: theme.colors.background,
  },
  cancelModalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: theme.spacing.sm,
    marginTop: theme.spacing.md,
  },
  cancelModalBtn: {
    minWidth: 96,
    borderRadius: theme.borderRadius.md,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelModalBtnSecondary: {
    backgroundColor: '#E5E9F0',
  },
  cancelModalBtnSecondaryText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  cancelModalBtnDanger: {
    backgroundColor: '#D32F2F',
  },
  cancelModalBtnDangerText: {
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
});

export default TreatmentPlanCard;
