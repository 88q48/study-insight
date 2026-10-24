import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { Image, StyleSheet, View } from 'react-native';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import {
  readNumberPreference,
  readPreference,
  writeNumberPreference,
  writePreference,
} from '../storage/preferences';

export type WallpaperId =
  | 'black'
  | 'graphite'
  | 'aurora'
  | 'dusk'
  | 'snow'
  | 'sand'
  | 'custom';

export interface WallpaperPreset {
  id: WallpaperId;
  label: string;
  colors: string[];
}

export const WALLPAPER_OPTIONS: WallpaperPreset[] = [
  {id: 'black', label: '深空黑', colors: []},
  {id: 'graphite', label: '石墨灰', colors: ['#050607', '#1A1E23', '#070809']},
  {id: 'aurora', label: '极光蓝', colors: ['#03070A', '#0F2B30', '#050709']},
  {id: 'dusk', label: '暮光棕', colors: ['#0B0708', '#2A171A', '#070506']},
  // 浅色系：选这两个的时候主题会自动切成深色字
  {id: 'snow', label: '雪原白', colors: ['#F6F7F9', '#DFE4EA', '#F1F3F6']},
  {id: 'sand', label: '暖沙色', colors: ['#FAF6EE', '#E8DFD0', '#F6F1E7']},
];

const DEFAULT_WALLPAPER: WallpaperId = 'black';
const DEFAULT_OPACITY = 0.8;
const KEY_WALLPAPER = 'home_wallpaper_id';
const KEY_CUSTOM_URI = 'home_wallpaper_custom_uri';
const KEY_OPACITY = 'home_wallpaper_opacity';

/**
 * 壁纸整体亮度（0~1）。
 *
 * 浅色壁纸要用白遮罩降低存在感，深色壁纸要用黑遮罩。统一用黑会把
 * 雪原白压成灰的，看着像褪色。
 */
function presetLuminance(colors: string[]): number {
  if (colors.length === 0) {
    return 0;
  }
  let sum = 0;
  let count = 0;
  for (const color of colors) {
    const body = color.replace('#', '');
    if (body.length !== 6) {
      continue;
    }
    const r = parseInt(body.slice(0, 2), 16);
    const g = parseInt(body.slice(2, 4), 16);
    const b = parseInt(body.slice(4, 6), 16);
    if ([r, g, b].some(n => Number.isNaN(n))) {
      continue;
    }
    sum += (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    count += 1;
  }
  return count === 0 ? 0 : sum / count;
}

/** 自定义壁纸的模糊半径。相机照片太锐利，模糊后卡片上的文字才读得舒服。 */
const BLUR_RADIUS = 18;

function clampOpacity(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_OPACITY;
  }
  return Math.max(0, Math.min(1, value));
}

function isWallpaperId(value: string): value is WallpaperId {
  return (
    value === 'black' ||
    value === 'graphite' ||
    value === 'aurora' ||
    value === 'dusk' ||
    value === 'snow' ||
    value === 'sand' ||
    value === 'custom'
  );
}

type WallpaperContextValue = {
  wallpaperId: WallpaperId;
  customUri: string;
  opacity: number;
  setWallpaper: (id: WallpaperId) => void;
  setCustomWallpaper: (uri: string) => void;
  setOpacity: (value: number) => void;
};

const WallpaperContext = createContext<WallpaperContextValue | null>(null);

export function WallpaperProvider({children}: {children: React.ReactNode}) {
  const [wallpaperId, setWallpaperId] = useState<WallpaperId>(DEFAULT_WALLPAPER);
  const [customUri, setCustomUri] = useState('');
  const [opacity, setOpacityState] = useState(DEFAULT_OPACITY);

  useEffect(() => {
    let mounted = true;
    Promise.all([
      readPreference(KEY_WALLPAPER, DEFAULT_WALLPAPER),
      readPreference(KEY_CUSTOM_URI, ''),
      readNumberPreference(KEY_OPACITY, DEFAULT_OPACITY),
    ]).then(([savedId, savedUri, savedOpacity]) => {
      if (!mounted) {
        return;
      }
      if (isWallpaperId(savedId)) {
        setWallpaperId(savedId);
      }
      setCustomUri(savedUri);
      setOpacityState(clampOpacity(savedOpacity));
    });
    return () => {
      mounted = false;
    };
  }, []);

  const setWallpaper = useCallback((id: WallpaperId) => {
    setWallpaperId(id);
    void writePreference(KEY_WALLPAPER, id);
  }, []);

  const setCustomWallpaper = useCallback((uri: string) => {
    setCustomUri(uri);
    setWallpaperId('custom');
    void writePreference(KEY_CUSTOM_URI, uri);
    void writePreference(KEY_WALLPAPER, 'custom');
  }, []);

  const setOpacity = useCallback((value: number) => {
    const next = clampOpacity(value);
    setOpacityState(next);
    void writeNumberPreference(KEY_OPACITY, next);
  }, []);

  const value = useMemo(
    () => ({
      wallpaperId,
      customUri,
      opacity,
      setWallpaper,
      setCustomWallpaper,
      setOpacity,
    }),
    [
      wallpaperId,
      customUri,
      opacity,
      setWallpaper,
      setCustomWallpaper,
      setOpacity,
    ],
  );

  return (
    <WallpaperContext.Provider value={value}>
      {children}
    </WallpaperContext.Provider>
  );
}

export function useWallpaper(): WallpaperContextValue {
  const value = useContext(WallpaperContext);
  if (!value) {
    throw new Error('useWallpaper 必须在 WallpaperProvider 内使用');
  }
  return value;
}

type WallpaperVisualProps = {
  wallpaperId: WallpaperId;
  customUri?: string;
  opacity: number;
};

/**
 * 壁纸绘制层。预设使用 SVG 渐变，自定义图片使用 Image；
 * opacity 表示壁纸可见度，底部叠加黑色遮罩降低存在感。
 */
export function WallpaperVisual({
  wallpaperId,
  customUri,
  opacity,
}: WallpaperVisualProps) {
  const preset = WALLPAPER_OPTIONS.find(item => item.id === wallpaperId);
  const shade = 1 - clampOpacity(opacity);
  const gradientId = `home-wallpaper-${wallpaperId}`;
  // 浅色壁纸配白遮罩，深色壁纸配黑遮罩，压暗的方向才对
  const shadeColor =
    preset && presetLuminance(preset.colors) >= 0.55 ? '#FFFFFF' : '#000000';

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      {wallpaperId === 'custom' && customUri ? (
        // blurRadius 走原生层，不占 JS 线程。
        // 卡片是半透明的，底下这层糊一点，透出来的才像磨砂玻璃而不是照片。
        <Image
          source={{uri: customUri}}
          resizeMode="cover"
          blurRadius={BLUR_RADIUS}
          style={StyleSheet.absoluteFill}
        />
      ) : preset && preset.colors.length ? (
        <Svg
          width="100%"
          height="100%"
          viewBox="0 0 100 100"
          preserveAspectRatio="none"
          style={StyleSheet.absoluteFill}>
          <Defs>
            <LinearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
              {preset.colors.map((color, index) => (
                <Stop
                  key={color}
                  offset={`${(index / (preset.colors.length - 1)) * 100}%`}
                  stopColor={color}
                  stopOpacity={1}
                />
              ))}
            </LinearGradient>
          </Defs>
          <Rect width="100" height="100" fill={`url(#${gradientId})`} />
        </Svg>
      ) : (
        <View style={[StyleSheet.absoluteFill, {backgroundColor: '#000000'}]} />
      )}
      <View
        style={[
          StyleSheet.absoluteFill,
          {backgroundColor: shadeColor, opacity: shade},
        ]}
      />
    </View>
  );
}

/** 页面级背景，使用当前保存的壁纸设置。 */
export function WallpaperBackdrop() {
  const { wallpaperId, customUri, opacity } = useWallpaper();
  return (
    <WallpaperVisual
      wallpaperId={wallpaperId}
      customUri={customUri}
      opacity={opacity}
    />
  );
}

