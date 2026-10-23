import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { ErrorItem, fetchErrors, questionOf } from '../api';

export default function MistakesScreen() {
  const [data, setData] = useState<ErrorItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 使用 useFocusEffect，每次切到这个页面都会重新拉取数据
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      fetchErrors()
        .then((result) => {
          if (isActive) {
            setData(result.items);
            setLoading(false);
          }
        })
        .catch((err) => {
          console.error(err);
          if (isActive) {
            Alert.alert('错误', '获取错题列表失败');
            setLoading(false);
          }
        });
      return () => { isActive = false; };
    }, [])
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10, color: '#666' }}>加载中...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        data={data}
        keyExtractor={(item, index) => item.error_id || index.toString()}
        renderItem={({ item }) => (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.subject}>
                {item.subject || '未分类'} - {item.knowledge_point || '未知知识点'}
              </Text>
              <Text style={styles.status}>
                {item.mastered ? '已掌握' : '待复习'}
              </Text>
            </View>
            <Text style={styles.question}>题目：{questionOf(item) || '（未填写题目）'}</Text>
            <Text style={styles.answer}>答案：{item.answer || '（未填写答案）'}</Text>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无错题，快去录入吧！</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 10 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#fff',
    padding: 15,
    borderRadius: 10,
    marginBottom: 12,
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  subject: { fontSize: 14, color: '#007AFF', fontWeight: 'bold' },
  status: { fontSize: 12, color: '#999' },
  question: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 6 },
  answer: { fontSize: 14, color: '#666' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 16 },
});