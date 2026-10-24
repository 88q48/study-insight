import React, { useState, useCallback } from 'react';
import { View, Text, FlatList, StyleSheet, ActivityIndicator, Alert, TouchableOpacity } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import { deleteError, fetchErrors } from '../../shared/api/client';
import type { ErrorItem } from '../../shared/api/types';
import {
  CHOICE_KEYS,
  isChoiceQuestion,
  optionOf,
  questionOf,
} from '../../shared/domain/error';
import MathText from '../../shared/ui/MathText';

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

  const handleDelete = (item: ErrorItem) => {
    Alert.alert(
      '删除错题',
      `确定删除「${item.content || '这道错题'}」吗？`,
      [
        {text: '取消', style: 'cancel'},
        {
          text: '删除',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteError(item.error_id);
              setData(current =>
                current.filter(row => row.error_id !== item.error_id),
              );
            } catch (err) {
              const message =
                err instanceof Error ? err.message : '请稍后重试';
              Alert.alert('删除失败', message);
            }
          },
        },
      ],
    );
  };

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
              <View style={styles.cardMeta}>
                <Text style={styles.typeBadge}>
                  {isChoiceQuestion(item) ? '选择题' : '填空题'}
                </Text>
                <Text style={styles.status}>
                  {item.mastered ? '已掌握' : '待复习'}
                </Text>
              </View>
            </View>
            <MathText style={styles.question}>
              题目：{questionOf(item) || '（未填写题目）'}
            </MathText>
            {isChoiceQuestion(item) && (
              <View style={styles.optionsBox}>
                {CHOICE_KEYS.map(key => (
                  <MathText key={key} style={styles.optionText}>
                    {key}. {optionOf(item, key)}
                  </MathText>
                ))}
              </View>
            )}
            <MathText style={styles.answer}>
              答案：{item.answer || '（未填写答案）'}
            </MathText>
            <View style={styles.cardFooter}>
              <Text style={styles.stats}>
                做题 {item.attempt_count ?? 0} 次 · 正确率 {item.accuracy ?? 0}%
              </Text>
              <TouchableOpacity onPress={() => handleDelete(item)}>
                <Text style={styles.deleteText}>删除</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
        ListEmptyComponent={<Text style={styles.emptyText}>暂无错题，快去录入吧！</Text>}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F6FC', padding: 12 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  card: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 14,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E8EEF8',
    elevation: 2,
    shadowColor: '#1F2937',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  subject: { fontSize: 14, color: '#3B6EF6', fontWeight: '700' },
  typeBadge: {
    fontSize: 11,
    color: '#3B5BDB',
    backgroundColor: '#EAF1FF',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  status: { fontSize: 12, color: '#8A94A6' },
  question: { fontSize: 16, fontWeight: '600', color: '#1F2937', marginBottom: 8, lineHeight: 24 },
  optionsBox: {
    marginBottom: 8,
    gap: 4,
    backgroundColor: '#F8FAFF',
    borderRadius: 10,
    padding: 10,
  },
  optionText: { fontSize: 14, color: '#3F4A5A', lineHeight: 22 },
  answer: { fontSize: 14, color: '#6B7280' },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#EEF2F8',
  },
  stats: { fontSize: 12.5, color: '#8A94A6' },
  deleteText: { fontSize: 13, color: '#FF3B30', fontWeight: '600' },
  emptyText: { textAlign: 'center', marginTop: 50, color: '#8A94A6', fontSize: 16 },
});