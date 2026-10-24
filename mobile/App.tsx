import React, { useMemo } from 'react';
import { StatusBar } from 'react-native';
import {
  DarkTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/app/navigation/AppNavigator';
import { darkColors } from './src/shared/theme/colors';
import { FeatureFlagsProvider } from './src/shared/settings/useFeatureFlags';
import { WallpaperProvider } from './src/shared/theme/Wallpaper';

export default function App() {
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
      <FeatureFlagsProvider>
        <WallpaperProvider>
          <StatusBar barStyle="light-content" />
          <NavigationContainer theme={navigationTheme}>
            <AppNavigator />
          </NavigationContainer>
        </WallpaperProvider>
      </FeatureFlagsProvider>
    </SafeAreaProvider>
  );
}
