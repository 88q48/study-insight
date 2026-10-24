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
 * 灰白液态玻璃主题。
 * 产品固定使用浅色方案，避免系统深色模式破坏玻璃层的通透感。
 */
export const lightColors: AppColors = {
  background: '#EDEFF2',
  surface: 'rgba(255,255,255,0.58)',
  surfaceAlt: '#E7E9ED',
  surfaceMuted: 'rgba(255,255,255,0.34)',
  border: 'rgba(255,255,255,0.72)',
  borderStrong: 'rgba(173,179,188,0.44)',
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
  dock: 'rgba(255,255,255,0.56)',
  glass: 'rgba(255,255,255,0.52)',
  glassStrong: 'rgba(255,255,255,0.78)',
  glassBorder: 'rgba(255,255,255,0.82)',
  glassHighlight: 'rgba(255,255,255,0.72)',
  glassEdge: 'rgba(255,255,255,0.92)',
};

/**
 * 保留深色令牌，方便后续切回自动主题；当前产品以灰白浅色为准。
 */
export const darkColors: AppColors = {
  background: '#181A1D',
  surface: 'rgba(61,64,69,0.58)',
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
  glassBorder: 'rgba(255,255,255,0.18)',
  glassHighlight: 'rgba(255,255,255,0.16)',
  glassEdge: 'rgba(255,255,255,0.24)',
};

export function useAppColors(): AppColors {
  return lightColors;
}
