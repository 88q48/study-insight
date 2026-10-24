import React, { useEffect, useMemo } from 'react';
import { StatusBar } from 'react-native';
import {
  DarkTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/app/navigation/AppNavigator';
import { darkColors } from './src/shared/theme/colors';
import { WallpaperProvider } from './src/shared/theme/Wallpaper';
import { syncUsageStats } from './src/shared/usage/sync';

export default function App() {
  useEffect(() => {
    // 启动时静默同步一次；没有使用情况访问权限时会直接跳过。
    void syncUsageStats();
  }, []);

  const navigationTheme = useMemo(() => {
    return {
      ...DarkTheme,
      colors: {
        ...DarkTheme.colors,
        primary: darkColors.primary,
        background: darkColors.background,
        card: darkColors.surface,
        text: darkColors.text,
        border: darkColors.border,
        notification: darkColors.primary,
      },
    };
  }, []);

  return (
    <SafeAreaProvider>
      <WallpaperProvider>
        <StatusBar barStyle="light-content" />
        <NavigationContainer theme={navigationTheme}>
          <AppNavigator />
        </NavigationContainer>
      </WallpaperProvider>
    </SafeAreaProvider>
  );
}
