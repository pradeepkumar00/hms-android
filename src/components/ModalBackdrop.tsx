import React from 'react';
import {
  Modal,
  View,
  Pressable,
  StyleSheet,
  ViewStyle,
  StyleProp,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { theme } from '../constants/theme';

interface ModalBackdropProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  animationType?: 'none' | 'slide' | 'fade';
  contentStyle?: StyleProp<ViewStyle>;
  align?: 'bottom' | 'center' | 'full';
  dismissOnBackdropPress?: boolean;
}

const ModalBackdrop: React.FC<ModalBackdropProps> = ({
  visible,
  onClose,
  children,
  animationType = 'fade',
  contentStyle,
  align = 'bottom',
  dismissOnBackdropPress = true,
}) => {
  const insets = useSafeAreaInsets();

  return (
    <Modal
      visible={visible}
      transparent
      animationType={animationType}
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View
        style={[
          styles.root,
          align === 'center' && styles.rootCenter,
          align === 'full' && styles.rootFull,
          contentStyle,
        ]}
      >
        {align !== 'full' && (
          <Pressable
            style={[
              styles.backdrop,
              {
                top: -insets.top,
                bottom: -insets.bottom,
              },
            ]}
            onPress={dismissOnBackdropPress ? onClose : undefined}
            accessibilityRole="button"
            accessibilityLabel="Close"
          />
        )}
        <View style={[styles.content, align === 'full' && styles.contentFull]}>
          {children}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  rootCenter: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.lg,
  },
  rootFull: {
    justifyContent: 'flex-start',
    backgroundColor: theme.colors.background,
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    zIndex: 0,
  },
  content: {
    zIndex: 1,
    width: '100%',
  },
  contentFull: {
    flex: 1,
  },
});

export default ModalBackdrop;
