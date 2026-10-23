import React, { useCallback, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ErrorStats, fetchAnalysis } from '../api';
import { DEVICE_ID } from '../config';

const EMPTY_STATS: ErrorStats = {
  total_errors: 0,
  mastered_errors: 0,
  reviewing_errors: 0,
  mastery_rate: 0,
};

export default function ProfileScreen() {
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
        <ActivityIndicator size="large" color="#007AFF" />
      ) : error ? (
        <Text style={styles.errorText}>加载失败：{error}</Text>
      ) : (
        <View style={styles.statsRow}>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.total_errors}</Text>
            <Text>总错题</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.mastered_errors}</Text>
            <Text>已掌握</Text>
          </View>
          <View style={styles.statBox}>
            <Text style={styles.statNum}>{stats.reviewing_errors}</Text>
            <Text>待复习</Text>
          </View>
        </View>
      )}
      {!loading && !error && (
        <Text style={styles.rateText}>掌握率 {stats.mastery_rate}%</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: {
    backgroundColor: '#007AFF',
    alignItems: 'center',
    padding: 30,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
  },
  avatar: {
    width: 80,
    height: 80,
    backgroundColor: '#fff',
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 10,
  },
  username: { fontSize: 20, color: '#fff', fontWeight: 'bold' },
  uid: { fontSize: 14, color: '#e0e0e0', marginTop: 5 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', margin: 20 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10 },
  statBox: {
    backgroundColor: '#fff',
    padding: 20,
    borderRadius: 10,
    alignItems: 'center',
    flex: 1,
    marginHorizontal: 5,
    elevation: 1,
  },
  statNum: { fontSize: 22, fontWeight: 'bold', color: '#007AFF', marginBottom: 5 },
  rateText: { textAlign: 'center', color: '#666', marginTop: 16 },
  errorText: { textAlign: 'center', color: '#FF3B30', marginTop: 20 },
});
