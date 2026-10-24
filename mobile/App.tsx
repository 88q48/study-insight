import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'react-native';
import {
  DarkTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/app/navigation/AppNavigator';
import { LoginScreen } from './src/features/auth/LoginScreen';
import { AccountProvider, useAccount } from './src/shared/auth/useAccount';
import { useFeatureFlags } from './src/shared/settings/useFeatureFlags';
import { FeatureFlagsProvider } from './src/shared/settings/useFeatureFlags';
import { darkColors } from './src/shared/theme/colors';
import { WallpaperProvider } from './src/shared/theme/Wallpaper';

/**
 * 决定显示登录页还是主界面。
 *
 * 两个 loading 都要等：账户没读完不知道进哪个库，开关没读完
 * 「专注效率」tab 会闪一下。等齐了再渲染，界面就不会抖。
 */
function BootGate({children}: {children: React.ReactNode}) {
  const { account, loading: accountLoading } = useAccount();
  const { loading: flagsLoading } = useFeatureFlags();

  if (accountLoading || flagsLoading) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator size="small" color={darkColors.textMuted} />
      </View>
    );
  }

  if (!account) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

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
      <AccountProvider>
        <FeatureFlagsProvider>
          <WallpaperProvider>
            <StatusBar barStyle="light-content" />
            <BootGate>
              <NavigationContainer theme={navigationTheme}>
                <AppNavigator />
              </NavigationContainer>
            </BootGate>
          </WallpaperProvider>
        </FeatureFlagsProvider>
      </AccountProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: darkColors.background,
  },
});
