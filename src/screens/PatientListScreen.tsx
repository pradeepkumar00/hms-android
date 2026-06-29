import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
  RefreshControl,
  TextInput,
  Linking,
  Alert,
  Pressable,
  Modal,
  Dimensions,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAppSelector, selectAuthToken } from '../store';
import { theme } from '../constants/theme';
import { Header } from '../components';
import Icon from 'react-native-vector-icons/MaterialIcons';
import realAuthService from '../services/realAuthService';
import { Appointment, Patient } from '../types';
import { buildPatientSearchFetchParams } from '../utils/patientSearchParams.util';

const PAGE_SIZE = 20;
const OPD_LIST_TYPE = 'opd';
const PAGE_OPTION_HEIGHT = 36;
const PAGE_DROPDOWN_FOOTER_HEIGHT = 34;
const PAGE_DROPDOWN_LIST_HEIGHT = Math.min(
  Dimensions.get('window').height * 0.42,
  PAGE_OPTION_HEIGHT * 12,
);
const PAGE_DROPDOWN_TOTAL_HEIGHT =
  PAGE_DROPDOWN_LIST_HEIGHT + PAGE_DROPDOWN_FOOTER_HEIGHT;

interface PagePickerAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface PatientListScreenProps {
  navigation: any;
}

const normalizePatient = (raw: any): Patient => {
  const source = raw?.user ?? raw?.patient ?? raw;
  const firstName = source.firstName || source.fname || '';
  const lastName = source.lastName || source.lname || '';
  const combinedName = [firstName, lastName].filter(Boolean).join(' ').trim();

  return {
    _id: source._id || source.id || raw._id || raw.id,
    id: source.id || raw.id,
    name:
      source.name ||
      source.patientName ||
      source.fullName ||
      combinedName ||
      'Unknown',
    mobileNo:
      source.mobileNo ||
      source.mobile ||
      source.phone ||
      source.phoneNo ||
      '',
    uhid: source.uhid ?? source.UHID ?? source.uhId ?? raw.uhid ?? null,
    gender: source.gender,
    age: source.age,
    type: source.type || source.patientType || raw.type,
  };
};

const PatientListScreen: React.FC<PatientListScreenProps> = ({ navigation }) => {
  const token = useAppSelector(selectAuthToken);

  const [patients, setPatients] = useState<Patient[]>([]);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [totalPages, setTotalPages] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [pagePickerOpen, setPagePickerOpen] = useState(false);
  const [pagePickerAnchor, setPagePickerAnchor] = useState<PagePickerAnchor | null>(
    null,
  );
  const [movingPatientId, setMovingPatientId] = useState<string | null>(null);
  const pageListRef = useRef<FlatList<number>>(null);
  const pageSelectRef = useRef<View>(null);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchQuery.trim()), 400);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const pageOptions = useMemo(
    () => Array.from({ length: totalPages }, (_, index) => index + 1),
    [totalPages],
  );

  const canGoBack = page > 0;
  const canGoForward = page < totalPages - 1;

  const fetchPatients = useCallback(
    async (pageToLoad: number, search: string) => {
      if (!token) {
        setError('Authentication required');
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await realAuthService.fetchPatients(token, {
          page: pageToLoad,
          limit: PAGE_SIZE,
          type: OPD_LIST_TYPE,
          ...buildPatientSearchFetchParams(search),
        });

        const normalized = result.patients.map(normalizePatient);
        setPatients(normalized);
        setPage(result.page);
        setTotal(result.total);
        setTotalPages(result.totalPages);
        setHasMore(result.hasMore);
      } catch (err) {
        console.error('Error fetching patients:', err);
        setError(
          err instanceof Error ? err.message : 'Failed to fetch patients',
        );
        setPatients([]);
        setTotal(0);
        setTotalPages(1);
        setHasMore(false);
      } finally {
        setIsLoading(false);
      }
    },
    [token],
  );

  useFocusEffect(
    useCallback(() => {
      if (!token) {
        setError('Authentication required');
        return;
      }
      fetchPatients(page, debouncedSearch);
    }, [token, fetchPatients, page, debouncedSearch]),
  );

  useEffect(() => {
    setPage(0);
  }, [debouncedSearch]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    setPage(0);
    await fetchPatients(0, debouncedSearch);
    setRefreshing(false);
  }, [fetchPatients, debouncedSearch]);

  const goToPage = useCallback(
    (nextPage: number) => {
      if (nextPage < 0 || nextPage >= totalPages || isLoading) return;
      setPage(nextPage);
    },
    [totalPages, isLoading],
  );

  const togglePagePicker = useCallback(() => {
    if (totalPages <= 1 || isLoading) return;

    if (pagePickerOpen) {
      setPagePickerOpen(false);
      return;
    }

    pageSelectRef.current?.measureInWindow((x, y, width, height) => {
      setPagePickerAnchor({ x, y, width, height });
      setPagePickerOpen(true);
      setTimeout(() => {
        pageListRef.current?.scrollToIndex({
          index: Math.min(page, Math.max(totalPages - 1, 0)),
          animated: false,
          viewPosition: 0.5,
        });
      }, 100);
    });
  }, [totalPages, isLoading, pagePickerOpen, page]);

  const closePagePicker = useCallback(() => {
    setPagePickerOpen(false);
  }, []);

  const handleSelectPage = useCallback(
    (pageNumber: number) => {
      closePagePicker();
      goToPage(pageNumber - 1);
    },
    [closePagePicker, goToPage],
  );

  const renderPageDropdown = () => {
    if (!pagePickerAnchor) return null;

    const dropdownTop = Math.max(
      theme.spacing.sm,
      pagePickerAnchor.y - PAGE_DROPDOWN_TOTAL_HEIGHT - theme.spacing.xs,
    );

    return (
      <View
        style={[
          styles.pageDropdown,
          {
            top: dropdownTop,
            left: pagePickerAnchor.x,
          },
        ]}
      >
        <FlatList
          ref={pageListRef}
          data={pageOptions}
          keyExtractor={item => `page-option-${item}`}
          style={styles.pageDropdownList}
          contentContainerStyle={styles.pageDropdownListContent}
          scrollEnabled
          nestedScrollEnabled
          showsVerticalScrollIndicator
          bounces
          keyboardShouldPersistTaps="handled"
          initialNumToRender={24}
          maxToRenderPerBatch={32}
          windowSize={12}
          removeClippedSubviews={false}
          getItemLayout={(_, index) => ({
            length: PAGE_OPTION_HEIGHT,
            offset: PAGE_OPTION_HEIGHT * index,
            index,
          })}
          onScrollToIndexFailed={info => {
            pageListRef.current?.scrollToOffset({
              offset: PAGE_OPTION_HEIGHT * info.index,
              animated: false,
            });
          }}
          renderItem={({ item }) => {
            const isActive = item === page + 1;
            return (
              <Pressable
                style={({ pressed }) => [
                  styles.pageDropdownItem,
                  isActive && styles.pageDropdownItemActive,
                  pressed && styles.pageDropdownItemPressed,
                ]}
                onPress={() => handleSelectPage(item)}
              >
                <Text
                  style={[
                    styles.pageDropdownItemText,
                    isActive && styles.pageDropdownItemTextActive,
                  ]}
                >
                  {item}
                </Text>
              </Pressable>
            );
          }}
        />
        <View style={styles.pageDropdownFooter}>
          <Icon name="expand-more" size={18} color={theme.colors.textInverse} />
          <Text style={styles.pageDropdownFooterText}>
            1–{totalPages.toLocaleString()}
          </Text>
        </View>
      </View>
    );
  };

  const renderPageNavigator = () => (
    <SafeAreaView edges={['bottom']} style={styles.pageNavigatorSafeArea}>
      <View style={styles.pageNavigator}>
        <Text style={styles.pageNavigatorSummary}>
          {total > 0
            ? `${total.toLocaleString()} OPD patient${total === 1 ? '' : 's'}`
            : 'No OPD patients'}
        </Text>

        <View style={styles.pageNavigatorControls}>
          <TouchableOpacity
            style={[styles.pageButton, !canGoBack && styles.pageButtonDisabled]}
            onPress={() => goToPage(0)}
            disabled={!canGoBack || isLoading}
            accessibilityLabel="First page"
          >
            <Icon
              name="first-page"
              size={22}
              color={canGoBack ? theme.colors.primary : theme.colors.disabled}
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.pageButton, !canGoBack && styles.pageButtonDisabled]}
            onPress={() => goToPage(page - 1)}
            disabled={!canGoBack || isLoading}
            accessibilityLabel="Previous page"
          >
            <Icon
              name="chevron-left"
              size={24}
              color={canGoBack ? theme.colors.primary : theme.colors.disabled}
            />
          </TouchableOpacity>

          <View ref={pageSelectRef} collapsable={false} style={styles.pageSelectGroup}>
            <View style={styles.pageNumberBox}>
              <Text style={styles.pageNumberText}>{page + 1}</Text>
            </View>

            <TouchableOpacity
              style={[
                styles.pageDropdownTrigger,
                (totalPages <= 1 || isLoading) && styles.pageDropdownTriggerDisabled,
              ]}
              onPress={togglePagePicker}
              disabled={totalPages <= 1 || isLoading}
              accessibilityLabel="Select page"
            >
              <Icon
                name={pagePickerOpen ? 'expand-less' : 'expand-more'}
                size={22}
                color={
                  totalPages <= 1 || isLoading
                    ? theme.colors.disabled
                    : theme.colors.primary
                }
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[
              styles.pageButton,
              !canGoForward && styles.pageButtonDisabled,
            ]}
            onPress={() => goToPage(page + 1)}
            disabled={!canGoForward || isLoading}
            accessibilityLabel="Next page"
          >
            <Icon
              name="chevron-right"
              size={24}
              color={
                canGoForward ? theme.colors.primary : theme.colors.disabled
              }
            />
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.pageButton,
              !canGoForward && styles.pageButtonDisabled,
            ]}
            onPress={() => goToPage(totalPages - 1)}
            disabled={!canGoForward || isLoading}
            accessibilityLabel="Last page"
          >
            <Icon
              name="last-page"
              size={22}
              color={
                canGoForward ? theme.colors.primary : theme.colors.disabled
              }
            />
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );

  const handleCall = useCallback((mobileNo?: string) => {
    const phone = mobileNo?.trim();
    if (!phone) {
      Alert.alert('Call', 'No mobile number available for this patient.');
      return;
    }

    Linking.openURL(`tel:${phone}`).catch(() => {
      Alert.alert('Call', 'Unable to open the phone dialer.');
    });
  }, []);

  const handleOpenOpd = useCallback(
    async (patient: Patient) => {
      const patientId = patient._id || patient.id;
      if (!patientId || !token || movingPatientId) return;

      setMovingPatientId(patientId);
      try {
        const fullPatient = await realAuthService.moveToOpd(patientId, token);
        const resolvedPatient = fullPatient || patient;

        // Fetch patient's appointments to get the latest one
        const apptData = await realAuthService.fetchPatientAppointments(patientId, token);
        const appointmentsList = apptData?.appointments || [];

        // Find latest appointment
        const latestAppt = appointmentsList.reduce((latest: any, current: any) => {
          if (!latest) return current;
          const latestTime = new Date(latest.date).getTime();
          const currentTime = new Date(current.date).getTime();
          return currentTime > latestTime ? current : latest;
        }, null);

        const appointment: Appointment = {
          _id: `patient-list-${patientId}`,
          patientId,
          patientName: resolvedPatient.name || patient.name,
          mobileNo: resolvedPatient.mobileNo || patient.mobileNo,
          uhid: resolvedPatient.uhid ?? patient.uhid,
          date: new Date().toISOString().slice(0, 10),
        };

        navigation.navigate('Calendar', {
          selectedAppointment: latestAppt || appointment,
        });
      } catch (err) {
        console.error('Open OPD failed:', err);
        Alert.alert(
          'Error',
          'Failed to open the OPD view for this patient. Please try again.',
        );
      } finally {
        setMovingPatientId(null);
      }
    },
    [token, navigation, movingPatientId],
  );

  const renderPatientRow = ({ item }: { item: Patient }) => {
    const patientId = item._id || item.id || '';
    const isMoving = movingPatientId === patientId;

    return (
      <Pressable
        style={({ pressed }) => [
          styles.row,
          pressed && !isMoving && styles.rowPressed,
          isMoving && styles.rowDisabled,
        ]}
        onPress={() => handleOpenOpd(item)}
        disabled={isMoving}
        accessibilityRole="button"
        accessibilityLabel={`Open OPD for ${item.name}`}
      >
        <Text style={[styles.cell, styles.nameCell]} numberOfLines={2}>
          {item.name}
        </Text>
        <Text style={[styles.cell, styles.uhidCell]} numberOfLines={1}>
          {item.uhid || '—'}
        </Text>
        <Text style={[styles.cell, styles.mobileCell]} numberOfLines={1}>
          {item.mobileNo || '—'}
        </Text>
        <View style={styles.actionsCell}>
          {isMoving ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <TouchableOpacity
              style={[
                styles.actionButton,
                !item.mobileNo && styles.actionButtonDisabled,
              ]}
              onPress={() => handleCall(item.mobileNo)}
              disabled={!item.mobileNo}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel={`Call ${item.name}`}
            >
              <Icon
                name="phone"
                size={18}
                color={item.mobileNo ? theme.colors.success : theme.colors.disabled}
              />
            </TouchableOpacity>
          )}
        </View>
      </Pressable>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Icon name="people-outline" size={64} color={theme.colors.disabled} />
      <Text style={styles.emptyStateTitle}>No OPD Patients Found</Text>
      <Text style={styles.emptyStateText}>
        {searchQuery.trim()
          ? `No OPD patients match "${searchQuery}"`
          : 'There are no OPD patients to display.'}
      </Text>
    </View>
  );

  if (error && !refreshing && patients.length === 0) {
    return (
      <View style={styles.container}>
        <Header
          title="OPD Patients"
          showHomeIcon
          onHomePress={() => navigation.popToTop()}
          onNotificationPress={() => navigation.navigate('Inbox')}
        />
        <View style={styles.errorContainer}>
          <Icon name="error" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity
            style={styles.retryButton}
            onPress={() => fetchPatients(0, debouncedSearch)}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Header
        title="Patients"
        showHomeIcon
        onHomePress={() => navigation.popToTop()}
        onNotificationPress={() => navigation.navigate('Inbox')}
      />

      <View style={styles.searchContainer}>
        <Icon name="search" size={20} color={theme.colors.textSecondary} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by name, number or UHID/PID"
          placeholderTextColor={theme.colors.placeholder}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={() => setSearchQuery('')}>
            <Icon name="close" size={20} color={theme.colors.textSecondary} />
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.listSection}>
        <View style={styles.tableHeader}>
          <Text style={[styles.headerCell, styles.nameCell]}>NAME</Text>
          <Text style={[styles.headerCell, styles.uhidCell]}>UHID</Text>
          <Text style={[styles.headerCell, styles.mobileCell]}>MOBILE</Text>
          <Text style={[styles.headerCell, styles.actionsCell]}>CALL</Text>
        </View>

        <FlatList
          style={styles.list}
          data={patients}
          renderItem={renderPatientRow}
          keyExtractor={(item, index) => item._id || item.id || `patient-${index}`}
          contentContainerStyle={[
            styles.listContainer,
            patients.length === 0 && styles.emptyListContainer,
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
              tintColor={theme.colors.primary}
            />
          }
          ListEmptyComponent={!isLoading ? renderEmptyState : null}
        />
      </View>

      {renderPageNavigator()}

      <Modal
        visible={pagePickerOpen}
        transparent
        animationType="fade"
        onRequestClose={closePagePicker}
      >
        <View style={styles.pagePickerModalRoot}>
          <Pressable
            style={styles.pagePickerModalBackdrop}
            onPress={closePagePicker}
          />
          {renderPageDropdown()}
        </View>
      </Modal>

      {isLoading && !refreshing && (
        <View style={styles.loadingOverlay}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: theme.colors.surface,
    marginHorizontal: theme.spacing.md,
    marginTop: theme.spacing.sm,
    marginBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
    borderRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  searchInput: {
    flex: 1,
    marginLeft: theme.spacing.sm,
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.text,
  },
  listSection: {
    flex: 1,
    marginHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.xs,
  },
  list: {
    flex: 1,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: theme.colors.secondary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderTopLeftRadius: theme.borderRadius.md,
    borderTopRightRadius: theme.borderRadius.md,
  },
  headerCell: {
    fontSize: theme.typography.fontSizes.xs,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textInverse,
    letterSpacing: 0.5,
  },
  listContainer: {
    backgroundColor: theme.colors.surface,
    borderBottomLeftRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
    ...theme.shadows.sm,
  },
  emptyListContainer: {
    flexGrow: 1,
    minHeight: 200,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
  },
  rowPressed: {
    backgroundColor: theme.colors.background,
  },
  rowDisabled: {
    opacity: 0.7,
  },
  cell: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.text,
  },
  nameCell: {
    flex: 1.4,
    paddingRight: theme.spacing.xs,
  },
  uhidCell: {
    flex: 0.8,
    paddingRight: theme.spacing.xs,
  },
  mobileCell: {
    flex: 1,
    paddingRight: theme.spacing.xs,
  },
  actionsCell: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    minWidth: 40,
  },
  actionButton: {
    width: 32,
    height: 32,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  actionButtonDisabled: {
    opacity: 0.5,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.spacing.xxl,
    paddingHorizontal: theme.spacing.xl,
  },
  emptyStateTitle: {
    fontSize: theme.typography.fontSizes.xl,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.text,
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.sm,
  },
  emptyStateText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  pageNavigatorSafeArea: {
    backgroundColor: theme.colors.surface,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    ...theme.shadows.md,
  },
  pageNavigator: {
    paddingTop: theme.spacing.sm,
    paddingBottom: theme.spacing.sm,
    paddingHorizontal: theme.spacing.md,
  },
  pageNavigatorSummary: {
    fontSize: theme.typography.fontSizes.sm,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.sm,
  },
  pageNavigatorControls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: theme.spacing.sm,
  },
  pageSelectGroup: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  pagePickerModalRoot: {
    flex: 1,
  },
  pagePickerModalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
  },
  pageDropdown: {
    position: 'absolute',
    width: 64,
    height: PAGE_DROPDOWN_TOTAL_HEIGHT,
    backgroundColor: '#4A4A4A',
    borderRadius: theme.borderRadius.md,
    overflow: 'hidden',
    elevation: 12,
    zIndex: 2,
    ...theme.shadows.lg,
  },
  pageDropdownList: {
    height: PAGE_DROPDOWN_LIST_HEIGHT,
    flexGrow: 0,
  },
  pageDropdownListContent: {
    paddingVertical: 2,
  },
  pageDropdownItem: {
    height: PAGE_OPTION_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pageDropdownItemActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  pageDropdownItemPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  pageDropdownItemText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.medium,
    color: theme.colors.textInverse,
  },
  pageDropdownItemTextActive: {
    fontWeight: theme.typography.fontWeights.bold,
  },
  pageDropdownFooter: {
    height: PAGE_DROPDOWN_FOOTER_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: theme.spacing.xs,
  },
  pageDropdownFooterText: {
    fontSize: theme.typography.fontSizes.xs,
    color: 'rgba(255, 255, 255, 0.75)',
    marginBottom: 1,
  },
  pageNumberBox: {
    minWidth: 40,
    height: 36,
    borderRadius: theme.borderRadius.md,
    backgroundColor: theme.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: theme.spacing.sm,
  },
  pageNumberText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.bold,
    color: theme.colors.textInverse,
  },
  pageDropdownTrigger: {
    width: 32,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  pageDropdownTriggerDisabled: {
    opacity: 0.45,
  },
  pageButton: {
    width: 40,
    height: 40,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  pageButtonDisabled: {
    opacity: 0.45,
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.xl,
  },
  errorText: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.error,
    textAlign: 'center',
    marginVertical: theme.spacing.md,
  },
  retryButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.sm,
    paddingHorizontal: theme.spacing.lg,
    borderRadius: theme.borderRadius.md,
  },
  retryButtonText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.surface,
  },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default PatientListScreen;
