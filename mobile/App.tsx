import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { StatusBar } from 'react-native';
import {
  DarkTheme,
  DefaultTheme,
  NavigationContainer,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppNavigator from './src/app/navigation/AppNavigator';
import { LoginScreen } from './src/features/auth/LoginScreen';
import { AccountProvider, useAccount } from './src/shared/auth/useAccount';
import { useFeatureFlags } from './src/shared/settings/useFeatureFlags';
import { FeatureFlagsProvider } from './src/shared/settings/useFeatureFlags';
import { darkColors, useAppColors, useTheme } from './src/shared/theme/colors';
import { ThemeProvider } from './src/shared/theme/ThemeProvider';
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
  const colors = useAppColors();

  if (accountLoading || flagsLoading) {
    return (
      <View style={[styles.boot, {backgroundColor: colors.background}]}>
        <ActivityIndicator size="small" color={colors.textMuted} />
      </View>
    );
  }

  if (!account) {
    return <LoginScreen />;
  }

  return <>{children}</>;
}

function ThemedApp() {
  const colors = useAppColors();
  const theme = useTheme();
  const isLight = theme?.resolved === 'light';

  // 导航容器的配色跟着主题走，不然切浅色后页面背景还是黑的
  const navigationTheme = useMemo(() => {
    const base = isLight ? DefaultTheme : DarkTheme;
    return {
      ...base,
      colors: {
        ...base.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surfaceAlt,
        text: colors.text,
        border: colors.border,
      },
    };
  }, [isLight, colors]);

  return (
    <>
      {/* 浅色背景要用深色状态栏文字，否则白字贴白底看不见 */}
      <StatusBar barStyle={isLight ? 'dark-content' : 'light-content'} />
      <BootGate>
        <NavigationContainer theme={navigationTheme}>
          <AppNavigator />
        </NavigationContainer>
      </BootGate>
    </>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AccountProvider>
        <FeatureFlagsProvider>
          <WallpaperProvider>
            <ThemeProvider>
              <ThemedApp />
            </ThemeProvider>
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
