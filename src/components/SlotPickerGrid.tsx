import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { theme } from '../constants/theme';
import {
  BookableSlot,
  isSlotSelectable,
  SLOT_AVAILABLE_COLOR,
  SLOT_BOOKED_COLOR,
  SLOT_BORDER_COLOR,
} from '../utils/slot.util';

interface SlotPickerGridProps {
  slots: BookableSlot[];
  selectedSlotId?: string | null;
  loading?: boolean;
  emptyMessage?: string;
  onSelect: (slot: BookableSlot) => void;
}

const SlotPickerGrid: React.FC<SlotPickerGridProps> = ({
  slots,
  selectedSlotId,
  loading = false,
  emptyMessage = 'No slots available for this doctor on the selected date.',
  onSelect,
}) => {
  if (loading) {
    return (
      <ActivityIndicator
        style={styles.loader}
        size="large"
        color={theme.colors.primary}
      />
    );
  }

  const visibleSlots = slots.filter(slot => !slot.isDisable);

  if (visibleSlots.length === 0) {
    return <Text style={styles.empty}>{emptyMessage}</Text>;
  }

  return (
    <ScrollView showsVerticalScrollIndicator={false}>
      <View style={styles.grid}>
        {visibleSlots.map(slot => {
          const selectable = isSlotSelectable(slot);
          const booked = !!slot.user && !selectable;
          const active = slot._id === selectedSlotId;
          const bg = booked ? SLOT_BOOKED_COLOR : SLOT_AVAILABLE_COLOR;
          const textColor = booked ? '#FFFFFF' : theme.colors.text;

          return (
            <TouchableOpacity
              key={slot._id}
              style={[
                styles.card,
                { backgroundColor: bg, borderColor: SLOT_BORDER_COLOR },
                active && styles.cardActive,
                !selectable && styles.cardBlocked,
              ]}
              activeOpacity={selectable ? 0.8 : 1}
              disabled={!selectable}
              onPress={() => onSelect(slot)}
            >
              <Text style={[styles.line, { color: textColor }]}>
                Time: {slot.startTime}
              </Text>
              <Text style={[styles.line, { color: textColor }]}>
                Duration: {slot.duration ?? 30}
              </Text>
              <Text style={[styles.line, { color: textColor }]}>
                Token: {slot.tokenCount ?? '—'}
              </Text>
              {booked ? (
                <Text style={[styles.bookedHint, { color: textColor }]}>
                  Booked
                </Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  loader: {
    paddingVertical: theme.spacing.xl,
  },
  empty: {
    fontSize: theme.typography.fontSizes.md,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingVertical: theme.spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  card: {
    width: '48%',
    borderRadius: theme.borderRadius.md,
    borderWidth: 1,
    paddingVertical: theme.spacing.md,
    paddingHorizontal: theme.spacing.md,
    marginBottom: theme.spacing.md,
  },
  cardActive: {
    borderWidth: 2,
    borderColor: theme.colors.primary,
  },
  cardBlocked: {
    opacity: 0.95,
  },
  line: {
    fontSize: theme.typography.fontSizes.md,
    marginBottom: 2,
  },
  bookedHint: {
    marginTop: 4,
    fontSize: theme.typography.fontSizes.sm,
    fontWeight: theme.typography.fontWeights.semiBold,
  },
});

export default SlotPickerGrid;
