import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
} from 'react-native';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { theme } from '../constants/theme';
import ModalBackdrop from './ModalBackdrop';

interface MonthCalendarPickerModalProps {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onSelectDate: (date: Date) => void;
  minDate?: Date;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export const MonthCalendarPickerModal: React.FC<MonthCalendarPickerModalProps> = ({
  visible,
  onClose,
  value,
  onSelectDate,
  minDate,
}) => {
  const [currentMonth, setCurrentMonth] = useState<Date>(() => new Date(value || new Date()));

  useEffect(() => {
    if (visible && value) {
      setCurrentMonth(new Date(value));
    }
  }, [visible, value]);

  const year = currentMonth.getFullYear();
  const month = currentMonth.getMonth();

  const firstDayOfMonth = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const handlePrevMonth = () => {
    setCurrentMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    setCurrentMonth(new Date(year, month + 1, 1));
  };

  const handleSelectDay = (day: number) => {
    const selected = new Date(year, month, day);
    onSelectDate(selected);
    onClose();
  };

  const monthLabel = currentMonth.toLocaleString('default', {
    month: 'long',
    year: 'numeric',
  });

  const cells: any[] = [];
  // Trailing empty slots
  for (let i = 0; i < firstDayOfMonth; i++) {
    cells.push({ day: null, key: `empty-${i}` });
  }

  // Days of month
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${today.getMonth()}-${today.getDate()}`;
  const selectedKey = value
    ? `${value.getFullYear()}-${value.getMonth()}-${value.getDate()}`
    : '';

  for (let day = 1; day <= daysInMonth; day++) {
    const dateStr = `${year}-${month}-${day}`;
    const isToday = dateStr === todayKey;
    const isSelected = dateStr === selectedKey;

    // Check minDate constraint
    let isDisabled = false;
    if (minDate) {
      // Set to end of day to allow selecting today's date if minDate is today
      const cellDate = new Date(year, month, day, 23, 59, 59);
      if (cellDate.getTime() < minDate.getTime()) {
        isDisabled = true;
      }
    }

    cells.push({
      day,
      key: `day-${day}`,
      isToday,
      isSelected,
      isDisabled,
    });
  }

  // Split into rows of 7
  const rows: any[] = [];
  let currentRow: any[] = [];
  cells.forEach((cell, idx) => {
    currentRow.push(cell);
    if (currentRow.length === 7 || idx === cells.length - 1) {
      while (currentRow.length < 7) {
        currentRow.push({ day: null, key: `pad-${currentRow.length}` });
      }
      rows.push(currentRow);
      currentRow = [];
    }
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <ModalBackdrop onPress={onClose} />
      <View style={styles.modalContainer}>
        <View style={styles.calendarCard}>
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity onPress={handlePrevMonth} style={styles.arrowBtn}>
              <Icon name="chevron-left" size={24} color="#475569" />
            </TouchableOpacity>
            <Text style={styles.monthTitle}>{monthLabel}</Text>
            <TouchableOpacity onPress={handleNextMonth} style={styles.arrowBtn}>
              <Icon name="chevron-right" size={24} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* Weekdays */}
          <View style={styles.weekdaysRow}>
            {WEEKDAYS.map((day) => (
              <Text key={day} style={styles.weekdayText}>
                {day}
              </Text>
            ))}
          </View>

          {/* Grid */}
          <View style={styles.grid}>
            {rows.map((row, rIdx) => (
              <View key={`row-${rIdx}`} style={styles.gridRow}>
                {row.map((cell: any) => {
                  if (cell.day === null) {
                    return <View key={cell.key} style={styles.cellEmpty} />;
                  }

                  return (
                    <TouchableOpacity
                      key={cell.key}
                      style={[
                        styles.cellBtn,
                        cell.isToday && styles.cellToday,
                        cell.isSelected && styles.cellSelected,
                        cell.isDisabled && styles.cellDisabled,
                      ]}
                      disabled={cell.isDisabled}
                      onPress={() => handleSelectDay(cell.day)}
                    >
                      <Text
                        style={[
                          styles.cellText,
                          cell.isSelected && styles.cellTextSelected,
                          cell.isDisabled && styles.cellTextDisabled,
                        ]}
                      >
                        {cell.day}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  arrowBtn: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f1f5f9',
  },
  monthTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1e293b',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  weekdayText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 12,
    fontWeight: 'bold',
    color: '#64748b',
  },
  grid: {
    gap: 4,
  },
  gridRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cellEmpty: {
    flex: 1,
    aspectRatio: 1,
  },
  cellBtn: {
    flex: 1,
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  cellToday: {
    backgroundColor: '#eef2ff',
  },
  cellSelected: {
    backgroundColor: '#4f46e5',
  },
  cellDisabled: {
    opacity: 0.35,
  },
  cellText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#334155',
  },
  cellTextSelected: {
    color: '#ffffff',
  },
  cellTextDisabled: {
    color: '#cbd5e1',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#f1f5f9',
    paddingTop: 12,
  },
  closeBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  closeBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#64748b',
  },
});
