import React, { useCallback, useEffect, useMemo, useState } from 'react';

import {
  ThemeContext,
  darkColors,
  lightColors,
} from './colors';
import type { ResolvedTheme, ThemeMode } from './colors';
import { readPreference, writePreference } from '../storage/preferences';
import { WALLPAPER_OPTIONS, useWallpaper } from './Wallpaper';

/**
 * 主题跟随壁纸。
 *
 * 原来 useAppColors() 直接 return darkColors，等于没有主题这回事。
 * 现在按壁纸亮度算：底色深就深色主题（浅色字），底色浅就浅色主题
 * （深色字），文字自然和背景反色。
 *
 * 自动判断的原理是读壁纸预设的 colors 数组算平均亮度。自定义图片
 * 读不到像素（RN 没有 canvas），所以按遮罩浓度估——遮罩越重越暗。
 * 这种情况下给用户留了手动开关。
 */

const KEY_MODE = 'theme_mode_v1';

/** 亮度超过这个值就当浅色背景。0.5 是常见分界，实测 0.58 更稳。 */
const LIGHT_THRESHOLD = 0.58;

/** 把 #RRGGBB 转成 0~1 的相对亮度。 */
function hexLuminance(hex: string): number | null {
  const value = hex.trim();
  if (!value.startsWith('#')) {
    return null;
  }
  let body = value.slice(1);
  if (body.length === 3) {
    body = body
      .split('')
      .map(ch => ch + ch)
      .join('');
  }
  if (body.length !== 6) {
    return null;
  }
  const r = parseInt(body.slice(0, 2), 16);
  const g = parseInt(body.slice(2, 4), 16);
  const b = parseInt(body.slice(4, 6), 16);
  if ([r, g, b].some(n => Number.isNaN(n))) {
    return null;
  }
  // sRGB 加权亮度，人眼对绿最敏感
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * 算当前壁纸整体的亮度。
 *
 * 预设壁纸：取三档渐变色的平均值。
 * 自定义图片：读不到像素，用「黑色遮罩厚度」反推——可见度越低背景越黑。
 * 返回 0~1，越大越亮。
 */
function wallpaperLuminance(
  wallpaperId: string,
  opacity: number,
): number {
  if (wallpaperId === 'custom') {
    // 可见度 1 时不知道图片多亮，按中性偏暗处理；
    // 可见度低时黑色遮罩重，必然更暗。
    return 0.22 * Math.max(0, Math.min(1, opacity));
  }
  const preset = WALLPAPER_OPTIONS.find(item => item.id === wallpaperId);
  if (!preset || preset.colors.length === 0) {
    // 深空黑
    return 0;
  }
  const values = preset.colors
    .map(hexLuminance)
    .filter((value): value is number => value !== null);
  if (values.length === 0) {
    return 0;
  }
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function ThemeProvider({children}: {children: React.ReactNode}) {
  const { wallpaperId, opacity } = useWallpaper();
  const [mode, setModeState] = useState<ThemeMode>('auto');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    readPreference(KEY_MODE, 'auto')
      .then(saved => {
        if (!mounted) {
          return;
        }
        if (saved === 'dark' || saved === 'light' || saved === 'auto') {
          setModeState(saved);
        }
        setLoading(false);
      })
      .catch(() => {
        if (mounted) {
          setLoading(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    void writePreference(KEY_MODE, next);
  }, []);

  const luminance = useMemo(
    () => wallpaperLuminance(wallpaperId, opacity),
    [wallpaperId, opacity],
  );

  const resolved: ResolvedTheme = useMemo(() => {
    if (mode === 'dark' || mode === 'light') {
      return mode;
    }
    return luminance >= LIGHT_THRESHOLD ? 'light' : 'dark';
  }, [mode, luminance]);

  const value = useMemo(
    () => ({
      mode,
      resolved,
      colors: resolved === 'light' ? lightColors : darkColors,
      setMode,
      wallpaperLuminance: luminance,
    }),
    [mode, resolved, setMode, luminance],
  );

  // 等读完存储再渲染，否则会先闪一下深色再跳浅色
  if (loading) {
    return null;
  }

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
