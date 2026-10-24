import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { launchImageLibrary } from 'react-native-image-picker';

import { fetchAnalysis } from '../../shared/api/client';
import type { Analysis } from '../../shared/api/types';
import { ANALYSIS_DAYS } from '../../shared/config';
import { openUsageAccessSettings } from '../../shared/native/usageStats';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import { WallpaperBackdrop } from '../../shared/theme/Wallpaper';
import { useAccount } from '../../shared/auth/useAccount';
import { Avatar } from '../../shared/ui/Avatar';
import { GlassPanel, GlassSegmented } from '../../shared/ui/Glass';
import type { GlassSegmentOption } from '../../shared/ui/Glass';
import { syncUsageStats } from '../../shared/usage/sync';
import { useFeatureFlags } from '../../shared/settings/useFeatureFlags';
import {
  AppUsageBars,
  FocusTrendChart,
  formatDuration,
  ReviewTrendChart,
  SubjectDistributionChart,
  WeakPointBars,
} from './ProfileCharts';

type ProfileTab = 'errors' | 'focus';

const ALL_TABS: readonly GlassSegmentOption<ProfileTab>[] = [
  {value: 'errors', label: '错题诊断'},
  {value: 'focus', label: '专注效率'},
];

function formatPeriodDate(value?: string): string {
  if (!value) {
    return '--';
  }
  return value.slice(0, 10).replace(/-/g, '/');
}

type UsageAccessState = 'unknown' | 'granted' | 'denied' | 'unsupported';

export default function ProfileScreen() {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const {width} = useWindowDimensions();
  const chartWidth = Math.max(240, width - 76);

  const { account, updateAvatar, isDemo } = useAccount();
  const { flags } = useFeatureFlags();
  const tabOptions = useMemo<readonly GlassSegmentOption<ProfileTab>[]>(
    () =>
      flags.focus ? ALL_TABS : ALL_TABS.filter(item => item.value !== 'focus'),
    [flags.focus],
  );
  const [tab, setTab] = useState<ProfileTab>('errors');
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [usageAccess, setUsageAccess] = useState<UsageAccessState>('unknown');
  const syncingRef = useRef(false);

  const loadAnalysis = useCallback(async (isRefresh = false) => {
    if (isRefresh) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }
    setError(null);
    try {
      const next = await fetchAnalysis(ANALYSIS_DAYS);
      setAnalysis(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : '学情数据加载失败');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  const refreshData = useCallback(
    async (isRefresh = false) => {
      if (syncingRef.current) {
        return;
      }
      syncingRef.current = true;
      if (isRefresh) {
        setRefreshing(true);
      }
      try {
        if (flags.focus) {
          const result = await syncUsageStats();
          if (result.status === 'permission_denied') {
            setUsageAccess('denied');
          } else if (result.status === 'unsupported') {
            setUsageAccess('unsupported');
          } else {
            setUsageAccess('granted');
          }
        }
      } finally {
        syncingRef.current = false;
      }
      await loadAnalysis(isRefresh);
    },
    [loadAnalysis, flags.focus],
  );

  useFocusEffect(
    useCallback(() => {
      void refreshData();
    }, [refreshData]),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', nextState => {
      if (nextState === 'active') {
        void refreshData();
      }
    });
    return () => subscription.remove();
  }, [refreshData]);

  const pickAvatar = useCallback(async () => {
    const response = await launchImageLibrary({
      mediaType: 'photo',
      maxWidth: 512,
      maxHeight: 512,
      quality: 0.8 as const,
    });
    const uri = response.assets?.[0]?.uri;
    if (uri) {
      await updateAvatar(uri);
    }
  }, [updateAvatar]);

  const stats = analysis?.error_stats;
  const total = stats?.total_errors ?? 0;
  const mastered = stats?.mastered_errors ?? 0;
  const reviewing = stats?.reviewing_errors ?? 0;
  const parsedRate = Number(stats?.mastery_rate ?? 0);
  const rate = Number.isFinite(parsedRate)
    ? Math.max(0, Math.min(100, parsedRate))
    : 0;
  const progressWidth = `${rate}%` as `${number}%`;
  const focusTrend = analysis?.trend || [];
  const focusMaxSeconds = Math.max(
    ...focusTrend.map(item => item.total_duration_seconds),
    0,
  );
  const focusUnit =
    focusMaxSeconds > 0 && focusMaxSeconds < 3600 ? '分钟' : '小时';

  return (
    <View style={styles.container}>
      <WallpaperBackdrop />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 150,
          },
        ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            void refreshData(true);
          }}
          tintColor={colors.text}
          colors={[colors.text]}
          progressBackgroundColor={colors.surface}
        />
      }>
      <View style={styles.pageHeader}>
        <Text style={styles.kicker}>学习档案 · 最近 {ANALYSIS_DAYS} 天</Text>
        <Text style={styles.title}>我的</Text>
        <Text style={styles.subtitle}>
            {flags.focus
              ? '错题和专注，放在同一张学习地图上。'
              : '把错题和薄弱点，放在同一张学习地图上。'}
          </Text>
      </View>

      {/* 账号卡片。点头像就能换，不用专门跑一趟设置页。 */}
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => {
          if (!isDemo) {
            void pickAvatar();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel="更换头像">
        <GlassPanel radius={26} contentStyle={styles.accountCard}>
          <Avatar
            name={account?.name ?? '?'}
            uri={account?.avatarUri}
            size={54}
            ring
          />
          <View style={styles.accountInfo}>
            <Text style={styles.accountName}>
              {account?.name ?? '未登录'}
              {isDemo ? ' · 只读' : ''}
            </Text>
            <Text style={styles.accountMeta}>
              {isDemo
                ? '示例数据，不会影响你自己的记录'
                : account
                ? `已使用 ${Math.max(
                    1,
                    Math.floor((Date.now() - account.createdAt) / 86400000) + 1,
                  )} 天 · 数据存在这台手机`
                : ''}
            </Text>
          </View>
          {!isDemo ? <Text style={styles.accountAction}>换头像</Text> : null}
        </GlassPanel>
      </TouchableOpacity>

      {!analysis ? (
        <GlassPanel radius={28} contentStyle={styles.stateCard}>
          {loading ? (
            <>
              <ActivityIndicator size="large" color={colors.text} />
              <Text style={styles.stateTitle}>正在整理学情...</Text>
              <Text style={styles.stateHint}>从本机学习记录生成图表</Text>
            </>
          ) : (
            <>
              <Text style={styles.stateTitle}>学情还没加载出来</Text>
              <Text style={styles.stateHint}>
                {error || '本机数据读取失败，请重试'}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  void loadAnalysis();
                }}
                style={[styles.retryButton, {backgroundColor: colors.text}]}>
                <Text style={[styles.retryText, {color: colors.background}]}>
                  重新加载
                </Text>
              </TouchableOpacity>
            </>
          )}
        </GlassPanel>
      ) : (
        <>



          {error ? (
            <View style={styles.inlineError}>
              <Text numberOfLines={2} style={styles.inlineErrorText}>
                刷新失败：{error}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  void loadAnalysis();
                }}>
                <Text style={[styles.inlineRetry, {color: colors.text}]}>
                  重试
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          <GlassPanel radius={28} contentStyle={styles.overviewContent}>
            <View style={styles.overviewTop}>
              <View style={styles.overviewCopy}>
                <Text style={styles.overviewLabel}>错题掌握率</Text>
                <View style={styles.overviewValueRow}>
                  <Text style={styles.overviewValue}>
                    {Number.isInteger(rate) ? rate : rate.toFixed(1)}
                  </Text>
                  <Text style={styles.overviewPercent}>%</Text>
                </View>
                <Text style={styles.overviewNote}>
                  {mastered} / {total} 道已经掌握
                </Text>
              </View>
              <View style={styles.reviewBadge}>
                <Text style={styles.reviewBadgeLabel}>待复习</Text>
                <Text style={styles.reviewBadgeValue}>{reviewing}</Text>
              </View>
            </View>

            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {width: progressWidth, backgroundColor: colors.success},
                ]}
              />
            </View>

            <View style={styles.metricRow}>
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{total}</Text>
                <Text style={styles.metricLabel}>累计错题</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{reviewing}</Text>
                <Text style={styles.metricLabel}>待复习</Text>
              </View>
              <View style={styles.metricDivider} />
              <View style={styles.metricItem}>
                <Text style={styles.metricValue}>{mastered}</Text>
                <Text style={styles.metricLabel}>已掌握</Text>
              </View>
            </View>
          </GlassPanel>

          {flags.focus && usageAccess === 'denied' ? (
            <GlassPanel
              radius={22}
              style={styles.permissionCard}
              contentStyle={styles.permissionContent}>
              <View>
                <Text style={styles.permissionTitle}>
                  专注效率需要真实使用记录
                </Text>
                <Text style={styles.permissionHint}>
                  开启「使用情况访问」后，只读取应用名和使用时长，保存在本机。
                </Text>
              </View>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => {
                  void openUsageAccessSettings();
                }}
                style={styles.permissionButton}>
                <Text style={styles.permissionButtonText}>去开启</Text>
              </TouchableOpacity>
            </GlassPanel>
          ) : null}

          {flags.focus ? (
            <GlassSegmented
              options={tabOptions}
              value={tab}
              onChange={setTab}
              style={styles.segmented}
            />
          ) : null}

          {tab === 'errors' ? (
            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>各科错题分布</Text>
                <Text style={styles.sectionHint}>按累计错题</Text>
              </View>
              <GlassPanel radius={26} contentStyle={styles.cardContent}>
                <SubjectDistributionChart
                  items={analysis.subject_distribution || []}
                  width={chartWidth}
                />
              </GlassPanel>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>近 {ANALYSIS_DAYS} 天走势</Text>
                <Text style={styles.sectionHint}>新增 / 掌握</Text>
              </View>
              <GlassPanel radius={26} contentStyle={styles.cardContent}>
                <ReviewTrendChart
                  items={analysis.review_trend || []}
                  width={chartWidth}
                />
              </GlassPanel>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>知识点薄弱榜</Text>
                <Text style={styles.sectionHint}>优先补这些</Text>
              </View>
              <GlassPanel radius={26} contentStyle={styles.cardContent}>
                <WeakPointBars items={analysis.knowledge_points || []} />
              </GlassPanel>
            </>
          ) : (

            <>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>每日专注时长</Text>
                <Text style={styles.sectionHint}>单位：{focusUnit}</Text>
              </View>
              <GlassPanel radius={26} contentStyle={styles.cardContent}>
                <FocusTrendChart items={focusTrend} width={chartWidth} />
              </GlassPanel>

              <GlassPanel radius={26} contentStyle={styles.focusSummary}>
                <View style={styles.focusMetric}>
                  <Text style={styles.focusValue}>
                    {formatDuration(analysis.summary?.total_duration_seconds || 0)}
                  </Text>
                  <Text style={styles.focusLabel}>总专注</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.focusMetric}>
                  <Text style={styles.focusValue}>
                    {formatDuration(analysis.summary?.avg_daily_seconds || 0)}
                  </Text>
                  <Text style={styles.focusLabel}>日均</Text>
                </View>
                <View style={styles.metricDivider} />
                <View style={styles.focusMetric}>
                  <Text style={styles.focusValue}>
                    {formatDuration(analysis.summary?.p90_daily_seconds || 0)}
                  </Text>
                  <Text style={styles.focusLabel}>高位日</Text>
                </View>
              </GlassPanel>

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>应用使用排行</Text>
                <Text style={styles.sectionHint}>最近 {ANALYSIS_DAYS} 天</Text>
              </View>
              <GlassPanel radius={26} contentStyle={styles.cardContent}>
                <AppUsageBars items={analysis.app_ranking || []} />
              </GlassPanel>
            </>
          )}

          <Text style={styles.footnote}>
            统计周期：{formatPeriodDate(analysis.period?.start)} -{' '}
            {formatPeriodDate(analysis.period?.end)} · 数据来自本机学习记录
          </Text>
        </>
      )}
    </ScrollView>
    </View>
  );
}


function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    scroll: {flex: 1, zIndex: 1, backgroundColor: 'transparent'},
    content: {paddingHorizontal: 20},
    pageHeader: {marginBottom: 20},
    accountCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      padding: 16,
    },
    accountInfo: {flex: 1},
    accountName: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    accountMeta: {
      fontSize: 12,
      lineHeight: 17,
      color: colors.textMuted,
    },
    accountAction: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
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
    stateCard: {
      minHeight: 210,
      paddingHorizontal: 22,
      paddingVertical: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stateTitle: {
      marginTop: 14,
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    stateHint: {
      marginTop: 6,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textMuted,
      textAlign: 'center',
    },
    retryButton: {
      marginTop: 18,
      borderRadius: 16,
      paddingHorizontal: 20,
      paddingVertical: 10,
    },
    retryText: {fontSize: 13, fontWeight: '700'},
    inlineError: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 14,
      paddingHorizontal: 14,
      paddingVertical: 10,
      marginBottom: 14,
    },
    inlineErrorText: {
      flex: 1,
      fontSize: 12,
      lineHeight: 17,
      color: colors.textSecondary,
    },
    inlineRetry: {fontSize: 12, fontWeight: '700'},
    permissionCard: {marginTop: 14},
    permissionContent: {padding: 16, gap: 12},
    permissionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    permissionHint: {
      marginTop: 5,
      fontSize: 12,
      lineHeight: 18,
      color: colors.textMuted,
    },
    permissionButton: {
      alignSelf: 'flex-start',
      borderRadius: 14,
      paddingHorizontal: 16,
      paddingVertical: 9,
      backgroundColor: colors.text,
    },
    permissionButtonText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.background,
    },
    overviewContent: {padding: 20},
    overviewTop: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 16,
    },
    overviewCopy: {flex: 1},
    overviewLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.8,
    },
    overviewValueRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginTop: 2,
    },
    overviewValue: {
      fontSize: 46,
      lineHeight: 52,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -1,
    },
    overviewPercent: {
      marginLeft: 2,
      marginBottom: 8,
      fontSize: 18,
      fontWeight: '700',
      color: colors.textSecondary,
    },
    overviewNote: {
      marginTop: 4,
      fontSize: 12,
      color: colors.textMuted,
    },
    reviewBadge: {
      minWidth: 80,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      paddingHorizontal: 14,
      paddingVertical: 10,
      alignItems: 'center',
    },
    reviewBadgeLabel: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.textMuted,
    },
    reviewBadgeValue: {
      marginTop: 2,
      fontSize: 22,
      fontWeight: '800',
      color: colors.text,
    },
    progressTrack: {
      height: 6,
      borderRadius: 3,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
      marginTop: 18,
    },
    progressFill: {height: '100%', borderRadius: 3},
    metricRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginTop: 18,
    },
    metricItem: {flex: 1, alignItems: 'center'},
    metricValue: {
      fontSize: 19,
      fontWeight: '800',
      color: colors.text,
    },
    metricLabel: {
      marginTop: 2,
      fontSize: 11,
      fontWeight: '500',
      color: colors.textMuted,
    },
    metricDivider: {
      width: 1,
      height: 24,
      backgroundColor: colors.border,
    },
    segmented: {marginTop: 18, marginBottom: 4},
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'baseline',
      justifyContent: 'space-between',
      marginTop: 20,
      marginBottom: 10,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 0.2,
    },
    sectionHint: {fontSize: 11, color: colors.textMuted, fontWeight: '500'},
    cardContent: {padding: 16},
    focusSummary: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 18,
      paddingHorizontal: 12,
      marginTop: 12,
    },
    focusMetric: {flex: 1, alignItems: 'center'},
    focusValue: {
      fontSize: 16,
      fontWeight: '800',
      color: colors.text,
    },
    focusLabel: {
      marginTop: 3,
      fontSize: 11,
      fontWeight: '500',
      color: colors.textMuted,
    },
    footnote: {
      marginTop: 18,
      marginBottom: 4,
      fontSize: 10,
      lineHeight: 15,
      color: colors.textMuted,
      textAlign: 'center',
    },
  });
}

