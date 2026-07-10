import React, { useEffect, useRef, useCallback } from 'react';
import {
  Animated,
  StyleProp,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import {
  GestureHandlerRootView,
  PanGestureHandler,
  PinchGestureHandler,
  State,
} from 'react-native-gesture-handler';

interface PinchZoomViewProps {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  zoom?: number;
  minZoom?: number;
  maxZoom?: number;
  onZoomChange?: (zoom: number) => void;
  viewportWidth?: number;
  viewportHeight?: number;
  contentWidth?: number;
  contentHeight?: number;
}

const clampZoom = (value: number, minZoom: number, maxZoom: number) =>
  Math.max(minZoom, Math.min(maxZoom, Math.round(value * 100) / 100));

const PinchZoomView: React.FC<PinchZoomViewProps> = ({
  children,
  style,
  contentStyle,
  zoom = 1,
  minZoom = 0.5,
  maxZoom = 4,
  onZoomChange,
  viewportWidth = 0,
  viewportHeight = 0,
  contentWidth = 0,
  contentHeight = 0,
}) => {
  const pinchRef = useRef(null);
  const panRef = useRef(null);

  const baseScale = useRef(new Animated.Value(1)).current;
  const pinchScale = useRef(new Animated.Value(1)).current;
  const scale = Animated.multiply(baseScale, pinchScale);
  const lastScale = useRef(1);

  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastOffset = useRef({ x: 0, y: 0 });

  const getMaxTranslation = useCallback((currentScale: number) => {
    if (!viewportWidth || !viewportHeight || !contentWidth || !contentHeight) {
      return { maxX: 0, maxY: 0 };
    }
    const scaledW = contentWidth * currentScale;
    const scaledH = contentHeight * currentScale;

    const maxX = Math.max(0, (scaledW - viewportWidth) / 2);
    const maxY = Math.max(0, (scaledH - viewportHeight) / 2);
    return { maxX, maxY };
  }, [viewportWidth, viewportHeight, contentWidth, contentHeight]);

  const resetPan = useCallback((animated = true) => {
    lastOffset.current = { x: 0, y: 0 };
    if (animated) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          bounciness: 0,
        }),
      ]).start();
    } else {
      translateX.setValue(0);
      translateY.setValue(0);
    }
  }, [translateX, translateY]);

  const clampPan = useCallback((animated = true) => {
    const { maxX, maxY } = getMaxTranslation(lastScale.current);
    const targetX = Math.min(maxX, Math.max(-maxX, lastOffset.current.x));
    const targetY = Math.min(maxY, Math.max(-maxY, lastOffset.current.y));

    lastOffset.current = { x: targetX, y: targetY };

    if (animated) {
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: targetX,
          useNativeDriver: true,
          bounciness: 0,
        }),
        Animated.spring(translateY, {
          toValue: targetY,
          useNativeDriver: true,
          bounciness: 0,
        }),
      ]).start();
    } else {
      translateX.setValue(targetX);
      translateY.setValue(targetY);
    }
  }, [translateX, translateY, getMaxTranslation]);

  const applyZoom = useCallback((next: number, notify = true, animated = true) => {
    const clamped = clampZoom(next, minZoom, maxZoom);
    lastScale.current = clamped;

    if (animated) {
      Animated.spring(baseScale, {
        toValue: clamped,
        useNativeDriver: true,
        bounciness: 0,
      }).start();
    } else {
      baseScale.setValue(clamped);
    }

    pinchScale.setValue(1);
    if (clamped <= 1) {
      resetPan(animated);
    } else {
      clampPan(animated);
    }
    if (notify) {
      onZoomChange?.(clamped);
    }
  }, [baseScale, pinchScale, minZoom, maxZoom, resetPan, clampPan, onZoomChange]);

  useEffect(() => {
    const clamped = clampZoom(zoom, minZoom, maxZoom);
    if (Math.abs(clamped - lastScale.current) > 0.001) {
      applyZoom(clamped, false, true);
    }
  }, [zoom, minZoom, maxZoom, applyZoom]);

  useEffect(() => {
    resetPan(false);
  }, [contentWidth, contentHeight, viewportWidth, viewportHeight, resetPan]);

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true },
  );

  const onPinchStateChange = (event: any) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    applyZoom(lastScale.current * event.nativeEvent.scale, true, false);
  };

  const onPanGestureEvent = (event: any) => {
    if (event.nativeEvent.state !== State.ACTIVE) return;
    if (lastScale.current <= 1) return;

    const { maxX, maxY } = getMaxTranslation(lastScale.current);
    const targetX = lastOffset.current.x + event.nativeEvent.translationX;
    const targetY = lastOffset.current.y + event.nativeEvent.translationY;

    const clampedX = Math.min(maxX, Math.max(-maxX, targetX));
    const clampedY = Math.min(maxY, Math.max(-maxY, targetY));

    translateX.setValue(clampedX);
    translateY.setValue(clampedY);
  };

  const onPanStateChange = (event: any) => {
    if (
      event.nativeEvent.state === State.END ||
      event.nativeEvent.state === State.CANCELLED ||
      event.nativeEvent.state === State.FAILED
    ) {
      if (lastScale.current <= 1) {
        resetPan(true);
        return;
      }
      const { maxX, maxY } = getMaxTranslation(lastScale.current);
      const targetX = lastOffset.current.x + event.nativeEvent.translationX;
      const targetY = lastOffset.current.y + event.nativeEvent.translationY;

      lastOffset.current = {
        x: Math.min(maxX, Math.max(-maxX, targetX)),
        y: Math.min(maxY, Math.max(-maxY, targetY)),
      };

      clampPan(true);
    }
  };

  return (
    <GestureHandlerRootView style={[styles.root, style]}>
      <PanGestureHandler
        ref={panRef}
        simultaneousHandlers={pinchRef}
        onGestureEvent={onPanGestureEvent}
        onHandlerStateChange={onPanStateChange}
        minPointers={1}
        maxPointers={1}
      >
        <Animated.View style={styles.flex}>
          <PinchGestureHandler
            ref={pinchRef}
            simultaneousHandlers={panRef}
            onGestureEvent={onPinchEvent}
            onHandlerStateChange={onPinchStateChange}
          >
            <Animated.View
              style={[
                styles.content,
                contentStyle,
                {
                  transform: [
                    { translateX },
                    { translateY },
                    { scale },
                  ],
                },
              ]}
            >
              {children}
            </Animated.View>
          </PinchGestureHandler>
        </Animated.View>
      </PanGestureHandler>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    overflow: 'hidden',
  },
  flex: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PinchZoomView;
