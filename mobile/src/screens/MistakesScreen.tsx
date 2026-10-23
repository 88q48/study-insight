import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

const BASE_URL = 'http://10.0.2.2:8010';

interface MistakeItem {
  error_id: string;
  subject: string;
  knowledge_point: string;
  question_content: string;
  content: string;
}

export default function MistakesScreen() {
  const [data, setData] = useState<MistakeItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 使用 useFocusEffect，每次切到这个页面都会重新拉取数据
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      fetch(`${BASE_URL}/api/v1/errors`)
        .then(res => res.json())
        .then((json: any) => {
          if (isActive) {
            // ⚠️ 这里的 json.items 是关键，后端数据是套娃的
            setData(json.items || []); 
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
            </View>
            <Text style={styles.question}>题目：{item.question_content}</Text>
            <Text style={styles.answer}>答案：{item.content}</Text>
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
  question: { fontSize: 16, fontWeight: '600', color: '#333', marginBottom: 6 },
  answer: { fontSize: 14, color: '#666' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#999', fontSize: 16 },
});