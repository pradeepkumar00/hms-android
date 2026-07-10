import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
  Modal,
  Image,
  Dimensions,
  ScrollView,
  Linking,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Pdf from 'react-native-pdf';
import Icon from 'react-native-vector-icons/MaterialIcons';
import { theme } from '../constants/theme';
import PinchZoomView from './PinchZoomView';
import { isImageUploadPart } from '../utils/uploadFileParts.util';
import { getFileTypeIcon } from '../utils/fileTypeIcon.util';
import { layoutUploadViewerImage } from '../utils/uploadViewerImageLayout.util';

const SCREEN_WIDTH = Dimensions.get('window').width;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 4;
const ZOOM_STEP = 0.25;

export interface FileViewerItem {
  id?: string;
  title?: string;
  filePath?: string | null;
  mimeType?: string | null;
  thumbUrl?: string | null;
  signedUrl?: string | null;
}

interface FileViewerModalProps {
  visible: boolean;
  item: FileViewerItem | null;
  url: string | null;
  loading?: boolean;
  stripItems?: FileViewerItem[];
  signedUrls?: Record<string, string>;
  onSelectStrip?: (item: FileViewerItem) => void;
  onClose: () => void;
}

const FileViewerModal: React.FC<FileViewerModalProps> = ({
  visible,
  item,
  url,
  loading = false,
  stripItems = [],
  signedUrls = {},
  onSelectStrip,
  onClose,
}) => {
  const [rotation, setRotation] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [bodySize, setBodySize] = useState({ w: SCREEN_WIDTH, h: SCREEN_HEIGHT * 0.7 });
  const [imageNatural, setImageNatural] = useState({ w: 0, h: 0 });

  useEffect(() => {
    setRotation(0);
    setZoom(1);
    setImageNatural({ w: 0, h: 0 });
  }, [item?.filePath]);

  const stripPositionLabel = useMemo(() => {
    if (!item?.filePath || stripItems.length <= 1) return '';
    const idx = stripItems.findIndex(it => it.filePath === item.filePath);
    return idx >= 0 ? `${idx + 1}/${stripItems.length}` : '';
  }, [item?.filePath, stripItems]);

  const isPdf =
    (item?.mimeType || '').includes('pdf') ||
    String(item?.title || item?.filePath || '')
      .toLowerCase()
      .endsWith('.pdf');
  const isImage = isImageUploadPart(item);

  const imageLayout = useMemo(() => {
    const naturalW = imageNatural.w || SCREEN_WIDTH;
    const naturalH = imageNatural.h || Math.round(SCREEN_HEIGHT * 0.7);
    return layoutUploadViewerImage(
      naturalW,
      naturalH,
      Math.max(1, bodySize.w - 16),
      Math.max(1, bodySize.h - 16),
      rotation,
      1,
    );
  }, [imageNatural, bodySize, rotation]);

  const handleClose = () => {
    setRotation(0);
    setZoom(1);
    onClose();
  };

  const zoomIn = () => {
    setZoom(prev => Math.min(MAX_ZOOM, Math.round((prev + ZOOM_STEP) * 100) / 100));
  };

  const zoomOut = () => {
    setZoom(prev => Math.max(MIN_ZOOM, Math.round((prev - ZOOM_STEP) * 100) / 100));
  };

  const rotate = () => {
    setRotation(prev => (prev + 90) % 360);
    setZoom(1);
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      statusBarTranslucent
      presentationStyle="overFullScreen"
      onRequestClose={handleClose}
    >
      <SafeAreaView edges={['top', 'bottom']} style={styles.container}>
        <View style={styles.header}>
          <TouchableOpacity
            onPress={handleClose}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Icon name="close" size={24} color={theme.colors.text} />
          </TouchableOpacity>
          <Text style={styles.title} numberOfLines={1}>
            {item?.title || 'File'}
            {stripPositionLabel ? `  ${stripPositionLabel}` : ''}
          </Text>
          {isImage && url ? (
            <TouchableOpacity
              onPress={rotate}
              style={styles.iconBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              accessibilityLabel="Rotate image"
            >
              <Icon name="rotate-right" size={22} color={theme.colors.primary} />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconPlaceholder} />
          )}
          <View style={styles.zoomActions}>
            <TouchableOpacity
              onPress={zoomOut}
              disabled={zoom <= MIN_ZOOM}
              style={[styles.zoomBtn, zoom <= MIN_ZOOM && styles.zoomBtnDisabled]}
            >
              <Text style={styles.zoomBtnText}>−</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={zoomIn}
              disabled={zoom >= MAX_ZOOM}
              style={[styles.zoomBtn, zoom >= MAX_ZOOM && styles.zoomBtnDisabled]}
            >
              <Text style={styles.zoomBtnText}>+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View
          style={styles.body}
          onLayout={event => {
            const { width, height } = event.nativeEvent.layout;
            if (width > 0 && height > 0) {
              setBodySize({ w: width, h: height });
            }
          }}
        >
          {loading || !url ? (
            <ActivityIndicator size="large" color={theme.colors.surface} />
          ) : isPdf ? (
            <PinchZoomView
              style={styles.imageScroll}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              onZoomChange={setZoom}
              viewportWidth={bodySize.w}
              viewportHeight={bodySize.h}
              contentWidth={bodySize.w}
              contentHeight={bodySize.h}
            >
              <Pdf
                source={{ uri: url, cache: true }}
                trustAllCerts={false}
                style={{ width: bodySize.w, height: bodySize.h }}
                enablePinchZoom={false}
                enableDoubleTapZoom={false}
                onError={err => {
                  console.error('PDF loading error:', err);
                  Alert.alert('Error', 'Failed to load PDF file.');
                }}
              />
            </PinchZoomView>
          ) : isImage ? (
            <PinchZoomView
              style={styles.imageScroll}
              zoom={zoom}
              minZoom={MIN_ZOOM}
              maxZoom={MAX_ZOOM}
              onZoomChange={setZoom}
              viewportWidth={bodySize.w}
              viewportHeight={bodySize.h}
              contentWidth={imageLayout?.frameWidth || SCREEN_WIDTH}
              contentHeight={imageLayout?.frameHeight || SCREEN_HEIGHT * 0.7}
            >
              <View
                style={[
                  styles.imageFrame,
                  imageLayout
                    ? {
                        width: imageLayout.frameWidth,
                        height: imageLayout.frameHeight,
                      }
                    : null,
                ]}
              >
                <Image
                  source={{ uri: url }}
                  style={[
                    styles.image,
                    imageLayout
                      ? {
                          width: imageLayout.imgWidth,
                          height: imageLayout.imgHeight,
                        }
                      : null,
                    { transform: [{ rotate: `${rotation}deg` }] },
                  ]}
                  resizeMode="contain"
                  onLoad={event => {
                    const { width, height } = event.nativeEvent.source;
                    if (width > 0 && height > 0) {
                      setImageNatural({ w: width, h: height });
                    }
                  }}
                />
              </View>
            </PinchZoomView>
          ) : (
            <View style={styles.unsupportedContainer}>
              <Icon name="insert-drive-file" size={64} color="#94A3B8" />
              <Text style={styles.unsupportedText}>
                Preview not available for this file type.
              </Text>
              <TouchableOpacity
                style={styles.openBtn}
                onPress={() => {
                  Linking.openURL(url).catch(() => {
                    Alert.alert('Error', 'Unable to open file link.');
                  });
                }}
              >
                <Text style={styles.openBtnText}>Open in Browser</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>

        {stripItems.length > 1 && (
          <View style={styles.gliderContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.gliderContent}
            >
              {stripItems.map(it => {
                const itIsImage = isImageUploadPart(it);
                const itIcon = getFileTypeIcon(it.mimeType, it.title || it.filePath);
                const itUri =
                  it.thumbUrl ||
                  (it.filePath ? signedUrls[it.filePath] : undefined) ||
                  it.signedUrl ||
                  undefined;
                const active = it.filePath === item?.filePath;
                return (
                  <TouchableOpacity
                    key={it.id || it.filePath || it.title}
                    activeOpacity={0.8}
                    onPress={() => onSelectStrip?.(it)}
                    style={[styles.gliderThumb, active && styles.gliderThumbActive]}
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
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.surface,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.md,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    gap: theme.spacing.sm,
  },
  title: {
    flex: 1,
    fontSize: theme.typography.fontSizes.lg,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.background,
  },
  iconPlaceholder: {
    width: 36,
  },
  zoomActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  zoomBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.surface,
  },
  zoomBtnDisabled: {
    opacity: 0.4,
  },
  zoomBtnText: {
    fontSize: 20,
    lineHeight: 22,
    fontWeight: theme.typography.fontWeights.semiBold,
    color: theme.colors.text,
  },
  body: {
    flex: 1,
    backgroundColor: '#000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pdf: {
    flex: 1,
    width: SCREEN_WIDTH,
    backgroundColor: '#525659',
  },
  imageScroll: {
    flex: 1,
    width: SCREEN_WIDTH,
    backgroundColor: '#000',
  },
  imageFrame: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  image: {
    maxWidth: '100%',
    maxHeight: '100%',
  },
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
  unsupportedContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing.lg,
    backgroundColor: '#000',
  },
  unsupportedText: {
    fontSize: theme.typography.fontSizes.md,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: theme.spacing.md,
    marginBottom: theme.spacing.lg,
  },
  openBtn: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: theme.colors.primary,
  },
  openBtnText: {
    fontSize: theme.typography.fontSizes.md,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
});

export default FileViewerModal;
