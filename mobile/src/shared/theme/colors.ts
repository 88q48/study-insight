import { useColorScheme } from 'react-native';

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
}

export const lightColors: AppColors = {
  background: '#F4F5FF',
  surface: '#FFFFFF',
  surfaceAlt: '#F3F6FC',
  surfaceMuted: '#F8FAFF',
  border: '#E8EEF8',
  borderStrong: '#DDE5F2',
  text: '#111827',
  textSecondary: '#4B5563',
  textMuted: '#8A94A6',
  primary: '#3B6EF6',
  primaryStrong: '#3B6EF6',
  primarySoft: '#EAF1FF',
  onPrimary: '#FFFFFF',
  success: '#34C759',
  successStrong: '#34C759',
  successSoft: '#E9F9EF',
  danger: '#FF3B30',
  dangerSoft: '#FDECEC',
  shadow: '#111827',
  placeholder: '#9AA4B2',
  dock: 'rgba(255,255,255,0.96)',
};

export const darkColors: AppColors = {
  background: '#0F1115',
  surface: '#1B1E25',
  surfaceAlt: '#14171D',
  surfaceMuted: '#232730',
  border: '#2B303B',
  borderStrong: '#3A4150',
  text: '#F3F5F8',
  textSecondary: '#C2C8D2',
  textMuted: '#8D96A5',
  primary: '#8AA6FF',
  primaryStrong: '#4266D8',
  primarySoft: '#1D2B4A',
  onPrimary: '#FFFFFF',
  success: '#4ADE80',
  successStrong: '#23894B',
  successSoft: '#163322',
  danger: '#FF7A72',
  dangerSoft: '#3A1D20',
  shadow: '#000000',
  placeholder: '#6F7888',
  dock: '#151517',
};

export function useAppColors(): AppColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : lightColors;
}
