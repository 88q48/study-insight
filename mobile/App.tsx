import React, { useMemo } from 'react';
import { StatusBar } from 'react-native';
import {
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AppNavigator from './src/app/navigation/AppNavigator';
import { lightColors } from './src/shared/theme/colors';

export default function App() {
  const navigationTheme = useMemo(() => {
    return {
      ...DefaultTheme,
      colors: {
        ...DefaultTheme.colors,
        primary: lightColors.primary,
        background: lightColors.background,
        card: lightColors.surface,
        text: lightColors.text,
        border: lightColors.border,
        notification: lightColors.primary,
      },
    };
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle="dark-content" />
      <NavigationContainer theme={navigationTheme}>
        <AppNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
