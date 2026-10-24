import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { fetchAnalysis } from '../../shared/api/client';
import type { ErrorStats } from '../../shared/api/types';
import { DEVICE_ID } from '../../shared/config';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';

const EMPTY_STATS: ErrorStats = {
  total_errors: 0,
  mastered_errors: 0,
  reviewing_errors: 0,
  mastery_rate: 0,
};

export default function ProfileScreen() {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [stats, setStats] = useState<ErrorStats>(EMPTY_STATS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      setError('');
      fetchAnalysis()
        .then((data) => {
          if (isActive) {
            setStats(data.error_stats);
          }
        })
        .catch((err) => {
          if (isActive) {
            setError(err instanceof Error ? err.message : '数据加载失败');
          }
        })
        .finally(() => {
          if (isActive) {
            setLoading(false);
          }
        });
      return () => { isActive = false; };
    }, [])
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={{fontSize: 30}}>👤</Text></View>
        <Text style={styles.username}>本机设备</Text>
        <Text style={styles.uid}>{DEVICE_ID}</Text>
      </View>

      <Text style={styles.sectionTitle}>📊 我的错题</Text>
      {loading ? (
        <ActivityIndicator size="large" color={colors.primary} />
      ) : error ? (
        <Text style={styles.errorText}>加载失败：{error}</Text>
      ) : (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.total_errors}</Text>
            <Text style={styles.statLabel}>总错题</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.mastered_errors}</Text>
            <Text style={styles.statLabel}>已掌握</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.reviewing_errors}</Text>
            <Text style={styles.statLabel}>待复习</Text>
          </View>
        </View>
      )}
      {!loading && !error && (
        <Text style={styles.rateText}>掌握率 {stats.mastery_rate}%</Text>
      )}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surfaceAlt,
      paddingBottom: 92,
    },
    header: {
      backgroundColor: colors.primaryStrong,
      alignItems: 'center',
      padding: 30,
      borderBottomLeftRadius: 24,
      borderBottomRightRadius: 24,
    },
    avatar: {
      width: 80,
      height: 80,
      backgroundColor: colors.surface,
      borderRadius: 40,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10,
    },
    username: {fontSize: 20, color: colors.onPrimary, fontWeight: 'bold'},
    uid: {
      fontSize: 14,
      color: 'rgba(255,255,255,0.78)',
      marginTop: 5,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: 'bold',
      color: colors.text,
      margin: 20,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      paddingHorizontal: 10,
    },
    statBox: {
      backgroundColor: colors.surface,
      padding: 20,
      borderRadius: 12,
      alignItems: 'center',
      flex: 1,
      marginHorizontal: 5,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 3},
      elevation: 2,
    },
    statNum: {fontSize: 22, fontWeight: '700', color: colors.primary, marginBottom: 5},
    statLabel: {color: colors.textSecondary},
    rateText: {textAlign: 'center', color: colors.textMuted, marginTop: 16},
    errorText: {textAlign: 'center', color: colors.danger, marginTop: 20},
  });
