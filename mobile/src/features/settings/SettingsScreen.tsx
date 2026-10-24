import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { launchImageLibrary } from 'react-native-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import {
  useWallpaper,
  WALLPAPER_OPTIONS,
  WallpaperVisual,
} from '../../shared/theme/Wallpaper';
import type { WallpaperId } from '../../shared/theme/Wallpaper';
import { GlassChip, GlassPanel } from '../../shared/ui/Glass';
import { listAccounts } from '../../shared/auth/accounts';
import { useAccount } from '../../shared/auth/useAccount';
import { FEATURES } from '../../shared/settings/features';
import { useFeatureFlags } from '../../shared/settings/useFeatureFlags';

const OPACITY_OPTIONS = [0, 0.2, 0.4, 0.6, 0.8, 1];

export default function SettingsScreen() {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const {
    wallpaperId,
    customUri,
    opacity,
    setWallpaper,
    setCustomWallpaper,
    setOpacity,
  } = useWallpaper();
  const { account, isDemo, logout, enterDemo, switchTo } = useAccount();
  const [switching, setSwitching] = useState(false);
  const { flags, setFlag } = useFeatureFlags();
  const [picking, setPicking] = useState(false);

  const chooseCustomImage = async () => {
    if (picking) {
      return;
    }
    setPicking(true);
    try {
      const response = await launchImageLibrary({
        mediaType: 'photo',
        maxWidth: 1600,
        maxHeight: 1600,
        quality: 0.8 as const,
      });
      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        Alert.alert('无法选择图片', response.errorMessage || '请稍后重试');
        return;
      }
      const uri = response.assets?.[0]?.uri;
      if (uri) {
        setCustomWallpaper(uri);
      }
    } catch {
      Alert.alert('无法选择图片', '调用相册失败，请稍后重试');
    } finally {
      setPicking(false);
    }
  };

  const confirmLogout = () => {
    Alert.alert('退出登录', '账户和数据都还在本机，下次输密码就能回来。', [
      {text: '取消', style: 'cancel'},
      {
        text: '退出',
        style: 'destructive',
        onPress: () => {
          void logout();
        },
      },
    ]);
  };

  const openDemo = async () => {
    if (switching) {
      return;
    }
    setSwitching(true);
    try {
      await enterDemo();
    } finally {
      setSwitching(false);
    }
  };

  const backToMine = async () => {
    if (switching) {
      return;
    }
    const accounts = await listAccounts();
    const mine = accounts[0];
    if (!mine) {
      return;
    }
    setSwitching(true);
    try {
      await switchTo(mine.id);
    } finally {
      setSwitching(false);
    }
  };

  const chooseWallpaper = (id: WallpaperId) => {
    if (id === 'custom' && !customUri) {
      void chooseCustomImage();
      return;
    }
    setWallpaper(id);
  };

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: insets.top + 20,
          paddingBottom: insets.bottom + 150,
        },
      ]}
      showsVerticalScrollIndicator={false}>
      <View style={styles.pageHeader}>
        <Text style={styles.kicker}>个性化</Text>
        <Text style={styles.title}>设置</Text>
        <Text style={styles.subtitle}>
          调整主页背景，让学习地图更接近你的风格。
        </Text>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>账户</Text>
        <Text style={styles.sectionHint}>数据各存一份</Text>
      </View>
      <GlassPanel radius={26} contentStyle={styles.accountCard}>
        <View style={styles.accountRow}>
          <Text style={styles.accountLabel}>当前账户</Text>
          <Text style={styles.accountValue}>
            {account?.name ?? '未登录'}
            {isDemo ? ' · 只读' : ''}
          </Text>
        </View>
        {isDemo ? (
          <Pressable
            onPress={backToMine}
            disabled={switching}
            style={({pressed}) => [
              styles.accountAction,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.accountActionText}>回到我的账户</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={confirmLogout}
            style={({pressed}) => [
              styles.accountAction,
              pressed && styles.pressed,
            ]}>
            <Text style={styles.accountActionText}>退出登录</Text>
          </Pressable>
        )}
      </GlassPanel>

      <View style={styles.previewCard}>
        <WallpaperVisual
          wallpaperId={wallpaperId}
          customUri={customUri}
          opacity={opacity}
        />
        <View style={styles.previewTop}>
          <Text style={styles.previewKicker}>主页预览</Text>
          <Text style={styles.previewValue}>
            {Math.round(opacity * 100)}% 可见度
          </Text>
        </View>
        <View style={styles.previewContent}>
          <Text style={styles.previewTitle}>我的</Text>
          <Text style={styles.previewHint}>
            把错题和薄弱点，放在同一张学习地图上。
          </Text>
        </View>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>主页壁纸</Text>
        <Text style={styles.sectionHint}>选择一种风格</Text>
      </View>
      <View style={styles.wallpaperGrid}>
        {WALLPAPER_OPTIONS.map(option => {
          const active = wallpaperId === option.id;
          return (
            <Pressable
              key={option.id}
              accessibilityRole="button"
              accessibilityState={{selected: active}}
              onPress={() => chooseWallpaper(option.id)}
              style={({pressed}) => [
                styles.wallpaperCard,
                active && styles.wallpaperCardActive,
                pressed && styles.pressed,
              ]}>
              <View style={styles.wallpaperSwatch}>
                <WallpaperVisual wallpaperId={option.id} opacity={1} />
              </View>
              <Text
                style={[
                  styles.wallpaperLabel,
                  {color: active ? colors.text : colors.textSecondary},
                ]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
        <Pressable
          accessibilityRole="button"
          accessibilityState={{selected: wallpaperId === 'custom'}}
          onPress={() => chooseWallpaper('custom')}
          style={({pressed}) => [
            styles.wallpaperCard,
            wallpaperId === 'custom' && styles.wallpaperCardActive,
            pressed && styles.pressed,
          ]}>
          <View style={styles.wallpaperSwatch}>
            {customUri ? (
              <WallpaperVisual
                wallpaperId="custom"
                customUri={customUri}
                opacity={1}
              />
            ) : (
              <View style={styles.customEmpty}>
                <Text style={styles.customEmptyIcon}>＋</Text>
                <Text style={styles.customEmptyText}>相册</Text>
              </View>
            )}
          </View>
          <Text
            style={[styles.wallpaperLabel, {color: colors.textSecondary}]}>
            {picking ? '选择中...' : customUri ? '自定义图片' : '从相册选择'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>壁纸透明度</Text>
        <Text style={styles.sectionHint}>越高越明显</Text>
      </View>
      <GlassPanel radius={24} contentStyle={styles.opacityCard}>
        <View style={styles.opacityChips}>
          {OPACITY_OPTIONS.map(value => (
            <GlassChip
              key={value}
              label={`${Math.round(value * 100)}%`}
              active={Math.abs(opacity - value) < 0.01}
              onPress={() => setOpacity(value)}
              accessibilityLabel={`壁纸透明度 ${Math.round(value * 100)}%`}
              style={styles.opacityChip}
            />
          ))}
        </View>
        <View style={styles.opacityTrack}>
          <View
            style={[
              styles.opacityFill,
              {width: `${Math.round(opacity * 100)}%` as `${number}%`},
            ]}
          />
        </View>
        <Text style={styles.opacityHint}>
          卡片仍保持灰色，透明度只影响主页背景，不影响文字可读性。
        </Text>
      </GlassPanel>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>功能</Text>
        <Text style={styles.sectionHint}>按需开关</Text>
      </View>
      <GlassPanel radius={26} contentStyle={styles.featureList}>
        {FEATURES.map((item, index) => {
          const on = flags[item.id];
          return (
            <View
              key={item.id}
              style={[
                styles.featureRow,
                index < FEATURES.length - 1 && styles.featureRowDivider,
              ]}>
              <View style={styles.featureText}>
                <Text style={styles.featureLabel}>{item.label}</Text>
                <Text style={styles.featureHint}>{item.hint}</Text>
                {item.requiresPermission && on ? (
                  <Text style={styles.featureWarn}>
                    还需要在系统设置里允许「{item.permissionLabel}」
                  </Text>
                ) : null}
              </View>
              <Pressable
                accessibilityRole="switch"
                accessibilityState={{checked: on}}
                accessibilityLabel={item.label}
                onPress={() => setFlag(item.id, !on)}
                style={({pressed}) => [pressed && styles.pressed]}>
                <GlassToggle on={on} colors={colors} />
              </Pressable>
            </View>
          );
        })}
      </GlassPanel>

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>示例账户</Text>
        <Text style={styles.sectionHint}>看看完整数据</Text>
      </View>
      <GlassPanel radius={26} contentStyle={styles.demoCard}>
        <Text style={styles.demoHint}>
          121 道错题示例，只读。看的时候不会动到你自己的数据。
        </Text>
        <Pressable
          onPress={isDemo ? backToMine : openDemo}
          disabled={switching}
          style={({pressed}) => [
            styles.demoButton,
            pressed && styles.pressed,
            switching && styles.disabled,
          ]}>
          <Text style={styles.demoButtonText}>
            {isDemo ? '退出示例，回到我的账户' : '查看演示数据'}
          </Text>
        </Pressable>
      </GlassPanel>

      <Pressable
        accessibilityRole="button"
        onPress={() => {
          setWallpaper('black');
          setOpacity(0.8);
        }}
        style={({pressed}) => [styles.resetButton, pressed && styles.pressed]}>
        <Text style={styles.resetText}>恢复默认</Text>
      </Pressable>
    </ScrollView>
  );
}


/**
 * 玻璃风格的开关。
 *
 * 没用 RN 自带的 Switch，因为原生那个在深色玻璃背景上像个塑料零件，
 * 跟界面其他地方不搭。自己画一个胶囊 + 圆点，开的时候用亮色轨道。
 */
function GlassToggle({on, colors}: {on: boolean; colors: AppColors}) {
  return (
    <View
      style={[
        toggleStyles.track,
        {
          backgroundColor: on ? colors.primary : colors.surfaceMuted,
          borderColor: on ? colors.primary : colors.glassBorder,
        },
      ]}>
      <View
        style={[
          toggleStyles.knob,
          {
            backgroundColor: on ? colors.onPrimary : colors.textMuted,
            transform: [{translateX: on ? 22 : 0}],
          },
        ]}
      />
    </View>
  );
}

const toggleStyles = StyleSheet.create({
  track: {
    width: 52,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    padding: 3,
    justifyContent: 'center',
  },
  knob: {
    width: 22,
    height: 22,
    borderRadius: 11,
  },
});

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    content: {paddingHorizontal: 20},
    pageHeader: {marginBottom: 20},
    kicker: {
      fontSize: 13,
      color: colors.textMuted,
      letterSpacing: 1.1,
      fontWeight: '600',
      marginBottom: 4,
    },
    title: {
      fontSize: 42,
      lineHeight: 50,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 1,
    },
    subtitle: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
    },
    previewCard: {
      height: 200,
      borderRadius: 28,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'space-between',
      padding: 18,
    },
    previewTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    previewKicker: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.8,
    },
    previewValue: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
    },
    previewContent: {paddingBottom: 2},
    previewTitle: {
      fontSize: 34,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 1,
    },
    previewHint: {
      marginTop: 4,
      fontSize: 12,
      color: colors.textSecondary,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 22,
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    sectionHint: {fontSize: 11, color: colors.textMuted, fontWeight: '500'},
    wallpaperGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    wallpaperCard: {
      width: '48%',
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      padding: 7,
    },
    wallpaperCardActive: {
      borderColor: colors.text,
      backgroundColor: colors.primarySoft,
    },
    wallpaperSwatch: {
      height: 92,
      borderRadius: 15,
      overflow: 'hidden',
      backgroundColor: '#000000',
    },
    wallpaperLabel: {
      marginTop: 8,
      marginBottom: 2,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
    },
    customEmpty: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    customEmptyIcon: {
      fontSize: 24,
      lineHeight: 28,
      color: colors.textSecondary,
    },
    customEmptyText: {
      marginTop: 2,
      fontSize: 11,
      color: colors.textMuted,
    },
    opacityCard: {padding: 16},
    opacityChips: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    opacityChip: {flexGrow: 1},
    opacityTrack: {
      height: 5,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
      marginTop: 16,
    },
    opacityFill: {
      height: '100%',
      borderRadius: 3,
      backgroundColor: colors.text,
    },
    opacityHint: {
      marginTop: 10,
      fontSize: 11,
      lineHeight: 17,
      color: colors.textMuted,
    },
    accountCard: {padding: 0},
    accountRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    accountLabel: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    accountValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    accountAction: {
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    accountActionText: {
      fontSize: 14,
      color: colors.danger,
    },
    demoCard: {padding: 18},
    demoHint: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textMuted,
      marginBottom: 14,
    },
    demoButton: {
      height: 42,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    demoButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    disabled: {opacity: 0.5},
    featureList: {padding: 0},
    featureRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 18,
      paddingVertical: 16,
    },
    featureRowDivider: {
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    featureText: {flex: 1},
    featureLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    featureHint: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textMuted,
    },
    featureWarn: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    resetButton: {
      alignSelf: 'center',
      marginTop: 22,
      paddingHorizontal: 18,
      paddingVertical: 9,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
    },
    resetText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    pressed: {opacity: 0.7},
  });
