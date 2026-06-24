import React, { useEffect, useRef } from 'react';
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

  const resetPan = () => {
    lastOffset.current = { x: 0, y: 0 };
    translateX.setOffset(0);
    translateY.setOffset(0);
    translateX.setValue(0);
    translateY.setValue(0);
  };

  const clampPan = () => {
    if (!viewportWidth || !viewportHeight || !contentWidth || !contentHeight) {
      return;
    }

    const scaledW = contentWidth * lastScale.current;
    const scaledH = contentHeight * lastScale.current;

    if (scaledW <= viewportWidth && scaledH <= viewportHeight) {
      resetPan();
      return;
    }

    const maxX = Math.max(0, (scaledW - viewportWidth) / 2);
    const maxY = Math.max(0, (scaledH - viewportHeight) / 2);
    lastOffset.current = {
      x: Math.min(maxX, Math.max(-maxX, lastOffset.current.x)),
      y: Math.min(maxY, Math.max(-maxY, lastOffset.current.y)),
    };
    translateX.setOffset(lastOffset.current.x);
    translateY.setOffset(lastOffset.current.y);
    translateX.setValue(0);
    translateY.setValue(0);
  };

  const applyZoom = (next: number, notify = true) => {
    const clamped = clampZoom(next, minZoom, maxZoom);
    lastScale.current = clamped;
    baseScale.setValue(clamped);
    pinchScale.setValue(1);
    if (clamped <= 1) {
      resetPan();
    } else {
      clampPan();
    }
    if (notify) {
      onZoomChange?.(clamped);
    }
  };

  useEffect(() => {
    const clamped = clampZoom(zoom, minZoom, maxZoom);
    if (Math.abs(clamped - lastScale.current) > 0.001) {
      applyZoom(clamped, false);
    }
  }, [zoom, minZoom, maxZoom]);

  useEffect(() => {
    resetPan();
  }, [contentWidth, contentHeight, viewportWidth, viewportHeight]);

  const onPinchEvent = Animated.event(
    [{ nativeEvent: { scale: pinchScale } }],
    { useNativeDriver: true },
  );

  const onPinchStateChange = (event: any) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    applyZoom(lastScale.current * event.nativeEvent.scale);
  };

  const onPanEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX, translationY: translateY } }],
    { useNativeDriver: true },
  );

  const onPanStateChange = (event: any) => {
    if (event.nativeEvent.oldState !== State.ACTIVE) return;
    if (lastScale.current <= 1) {
      resetPan();
      return;
    }
    lastOffset.current = {
      x: lastOffset.current.x + event.nativeEvent.translationX,
      y: lastOffset.current.y + event.nativeEvent.translationY,
    };
    clampPan();
  };

  return (
    <GestureHandlerRootView style={[styles.root, style]}>
      <PanGestureHandler
        ref={panRef}
        simultaneousHandlers={pinchRef}
        onGestureEvent={onPanEvent}
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
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default PinchZoomView;
