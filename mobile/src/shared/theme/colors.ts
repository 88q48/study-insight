import { createContext, useContext } from 'react';

export interface AppColors {
  background: string;
  surface: string;
  surfaceAlt: string;
  surfaceMuted: string;
  border: string;
  borderStrong: string;
  text: string;
  textSecondary: string;
  textMuted: string;
  primary: string;
  primaryStrong: string;
  primarySoft: string;
  onPrimary: string;
  success: string;
  successStrong: string;
  successSoft: string;
  danger: string;
  dangerSoft: string;
  shadow: string;
  placeholder: string;
  dock: string;
  glass: string;
  glassStrong: string;
  glassBorder: string;
  glassHighlight: string;
  glassEdge: string;
}

/**
 * 灰白液态玻璃主题（浅色备用）。
 */
export const lightColors: AppColors = {
  background: '#EDEFF2',
  // 白底上白卡片会糊成一片，加厚一点并配深色描边才分得开
  surface: 'rgba(255,255,255,0.82)',
  surfaceAlt: '#E3E6EA',
  surfaceMuted: 'rgba(32,35,39,0.05)',
  border: 'rgba(32,35,39,0.1)',
  borderStrong: 'rgba(32,35,39,0.18)',
  text: '#202327',
  textSecondary: '#555B63',
  textMuted: '#8B9199',
  primary: '#34383D',
  primaryStrong: '#23262A',
  primarySoft: 'rgba(255,255,255,0.46)',
  onPrimary: '#FFFFFF',
  success: '#3D8B5F',
  successStrong: '#337550',
  successSoft: 'rgba(76,155,105,0.14)',
  danger: '#B45454',
  dangerSoft: 'rgba(180,84,84,0.12)',
  shadow: '#5C626B',
  placeholder: '#9DA3AA',
  dock: 'rgba(248,249,251,0.86)',
  glass: 'rgba(255,255,255,0.68)',
  glassStrong: 'rgba(255,255,255,0.9)',
  glassBorder: 'rgba(32,35,39,0.12)',
  glassHighlight: 'rgba(255,255,255,0.96)',
  glassEdge: 'rgba(255,255,255,1)',
};

/**
 * 默认深色液态玻璃主题。
 * 固定使用该套令牌，不跟随系统深色/浅色设置切换。
 */
export const darkColors: AppColors = {
  background: '#000000',
  // 半透明玻璃：壁纸能透出来一点，卡片才有厚度
  surface: 'rgba(43,46,51,0.76)',
  surfaceAlt: '#15171A',
  surfaceMuted: 'rgba(255,255,255,0.07)',
  border: 'rgba(255,255,255,0.13)',
  borderStrong: 'rgba(255,255,255,0.2)',
  text: '#F2F3F5',
  textSecondary: '#C4C8CE',
  textMuted: '#8D939B',
  primary: '#E4E6E9',
  primaryStrong: '#E7E9EC',
  primarySoft: 'rgba(255,255,255,0.1)',
  onPrimary: '#1C1E21',
  success: '#63B784',
  successStrong: '#3F8E61',
  successSoft: 'rgba(99,183,132,0.16)',
  danger: '#D98282',
  dangerSoft: 'rgba(217,130,130,0.14)',
  shadow: '#000000',
  placeholder: '#777D85',
  dock: 'rgba(44,47,51,0.62)',
  glass: 'rgba(255,255,255,0.08)',
  glassStrong: 'rgba(255,255,255,0.16)',
  glassBorder: 'rgba(255,255,255,0.22)',
  glassHighlight: 'rgba(255,255,255,0.16)',
  glassEdge: 'rgba(255,255,255,0.24)',
};

/** 主题模式：auto 跟着壁纸走，dark/light 由用户决定。 */
export type ThemeMode = 'auto' | 'dark' | 'light';

/** 实际渲染出来的是深还是浅。auto 时由壁纸亮度决定。 */
export type ResolvedTheme = 'dark' | 'light';

export interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  colors: AppColors;
  setMode: (mode: ThemeMode) => void;
  /** 壁纸太亮时 auto 会切浅色，这里给设置页显示判断依据 */
  wallpaperLuminance: number;
}

export const ThemeContext = createContext<ThemeContextValue | null>(null);

/**
 * 取当前主题色。
 *
 * 没套 Provider 时退回深色——组件漏包不会白屏，只是不跟随主题。
 * 这样调试单个页面时不用每次都补 Provider。
 */
export function useAppColors(): AppColors {
  const value = useContext(ThemeContext);
  return value ? value.colors : darkColors;
}

/** 需要知道当前是深还是浅时用这个（比如状态栏文字颜色）。 */
export function useTheme(): ThemeContextValue | null {
  return useContext(ThemeContext);
}
