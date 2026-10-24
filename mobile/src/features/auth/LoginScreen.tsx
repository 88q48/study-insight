import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  AUTH_ERROR_TEXT,
  PASSWORD_RULE,
  hasRealAccounts,
} from '../../shared/auth/accounts';
import { useAccount } from '../../shared/auth/useAccount';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import { GlassButton, GlassPanel } from '../../shared/ui/Glass';
import { WallpaperBackdrop } from '../../shared/theme/Wallpaper';

/**
 * 首次启动 / 退出登录后的入口。
 *
 * 默认停在「注册」还是「登录」，由本地有没有账户决定：
 * 全新装的设备上没人会知道该输什么，所以直接给注册。
 */
export function LoginScreen() {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const { register, login } = useAccount();

  const [mode, setMode] = useState<'register' | 'login'>('register');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  // 本机已经有账户时默认「登录」。退出登录后再看到「创建你的账户」
  // 会让人以为数据丢了，还得再点一次才能切过去。
  useEffect(() => {
    let mounted = true;
    hasRealAccounts()
      .then(exists => {
        if (mounted && exists) {
          setMode('login');
        }
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, []);

  const submit = useCallback(async () => {
    if (busy) {
      return;
    }
    setError('');
    setBusy(true);
    try {
      const result =
        mode === 'register'
          ? await register(name, password)
          : await login(name, password);
      if (!result.ok) {
        setError(AUTH_ERROR_TEXT[result.error]);
      }
    } catch {
      setError('出了点问题，再试一次');
    } finally {
      setBusy(false);
    }
  }, [busy, mode, register, login, name, password]);

  const switchMode = useCallback(() => {
    setMode(current => (current === 'register' ? 'login' : 'register'));
    setError('');
  }, []);

  const canSubmit =
    name.trim().length > 0 && password.length >= PASSWORD_RULE.min && !busy;

  return (
    <View style={styles.container}>
      <WallpaperBackdrop />
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}>
        <ScrollView
          contentContainerStyle={[
            styles.content,
            {paddingTop: insets.top + 72, paddingBottom: insets.bottom + 40},
          ]}
          keyboardShouldPersistTaps="handled">
          <Text style={styles.brand}>学情洞察</Text>
          <Text style={styles.tagline}>
            把错题和薄弱点，放在同一张学习地图上
          </Text>

          <GlassPanel radius={28} contentStyle={styles.card}>
            <Text style={styles.cardTitle}>
              {mode === 'register' ? '创建你的账户' : '欢迎回来'}
            </Text>
            <Text style={styles.cardHint}>
              {mode === 'register'
                ? '数据只存在这台手机上，每个账户各存一份。'
                : '输入密码继续。'}
            </Text>

            <View style={styles.field}>
              <Text style={styles.label}>用户名</Text>
              <TextInput
                value={name}
                onChangeText={text => {
                  setName(text);
                  setError('');
                }}
                placeholder="2–12 个字"
                placeholderTextColor={colors.placeholder}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={12}
                style={styles.input}
                returnKeyType="next"
              />
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>密码</Text>
              <TextInput
                value={password}
                onChangeText={text => {
                  setPassword(text);
                  setError('');
                }}
                placeholder="至少 4 位"
                placeholderTextColor={colors.placeholder}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={PASSWORD_RULE.max}
                style={styles.input}
                returnKeyType="go"
                onSubmitEditing={submit}
              />
            </View>

            {error ? <Text style={styles.error}>{error}</Text> : null}

            {/* 不传 label：GlassButton 里 label 会盖掉 children，
                busy 时的转圈就显示不出来了 */}
            <GlassButton
              tone="dark"
              onPress={submit}
              disabled={!canSubmit}
              style={styles.submit}>
              {busy ? (
                <ActivityIndicator size="small" color={colors.onPrimary} />
              ) : (
                <Text style={styles.submitText}>
                  {mode === 'register' ? '创建账户' : '进入'}
                </Text>
              )}
            </GlassButton>

            <Pressable onPress={switchMode} style={styles.switchRow}>
              <Text style={styles.switchText}>
                {mode === 'register'
                  ? '已经有账户了？去登录'
                  : '还没有账户？注册一个'}
              </Text>
            </Pressable>
          </GlassPanel>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    flex: {flex: 1},
    content: {paddingHorizontal: 24},

    brand: {
      fontSize: 38,
      lineHeight: 46,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 1.4,
      textAlign: 'center',
    },
    tagline: {
      marginTop: 10,
      marginBottom: 36,
      fontSize: 14,
      lineHeight: 21,
      color: colors.textMuted,
      textAlign: 'center',
    },

    card: {padding: 22},
    cardTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 6,
    },
    cardHint: {
      fontSize: 12.5,
      lineHeight: 19,
      color: colors.textMuted,
      marginBottom: 20,
    },

    field: {marginBottom: 14},
    label: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
      letterSpacing: 0.6,
      marginBottom: 7,
    },
    input: {
      height: 46,
      borderRadius: 14,
      paddingHorizontal: 14,
      fontSize: 15,
      color: colors.text,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },

    error: {
      marginTop: 2,
      marginBottom: 12,
      fontSize: 12.5,
      lineHeight: 18,
      color: colors.danger,
    },

    submit: {marginTop: 6, height: 48, justifyContent: 'center'},
    submitText: {
      fontSize: 15.5,
      fontWeight: '700',
      color: colors.onPrimary,
      letterSpacing: 0.8,
    },

    switchRow: {marginTop: 16, alignItems: 'center', paddingVertical: 6},
    switchText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
  });
