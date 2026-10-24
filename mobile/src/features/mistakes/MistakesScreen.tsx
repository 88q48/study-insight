import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { deleteError, fetchErrors } from '../../shared/api/client';
import type { ErrorItem } from '../../shared/api/types';
import {
  CHOICE_KEYS,
  isChoiceQuestion,
  optionOf,
  questionOf,
} from '../../shared/domain/error';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import { GlassChip, GlassPanel } from '../../shared/ui/Glass';
import MathText from '../../shared/ui/MathText';

export default function MistakesScreen() {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<ErrorItem[]>([]);
  const [loading, setLoading] = useState(true);

  // 使用 useFocusEffect，每次切到这个页面都会重新拉取数据
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      fetchErrors(200)
        .then(result => {
          if (isActive) {
            setData(result.items);
            setLoading(false);
          }
        })
        .catch(err => {
          console.error(err);
          if (isActive) {
            Alert.alert('错误', '获取错题列表失败');
            setLoading(false);
          }
        });
      return () => {
        isActive = false;
      };
    }, []),
  );

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>加载中...</Text>
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
        showsVerticalScrollIndicator={false}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          {paddingBottom: insets.bottom + 118},
        ]}
        ListHeaderComponent={
          <View style={styles.listHeader}>
            <View>
              <Text style={styles.listTitle}>错题档案</Text>
              <Text style={styles.listSubtitle}>按薄弱程度优先复习</Text>
            </View>
            <View style={styles.countBadge}>
              <Text style={styles.countText}>{data.length} 道</Text>
            </View>
          </View>
        }
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        renderItem={({item}) => (
          <GlassPanel
            radius={24}
            style={styles.card}
            contentStyle={styles.cardContent}
          >
            <View style={styles.cardHeader}>
              <View style={styles.cardTitleWrap}>
                <Text style={styles.subject} numberOfLines={1}>
                  {item.subject || '未分类'}
                </Text>
                <Text style={styles.knowledge} numberOfLines={1}>
                  {item.knowledge_point || '未知知识点'}
                </Text>
              </View>
              <View style={styles.cardMeta}>
                <View style={styles.typeBadge}>
                  <Text style={styles.typeBadgeText}>
                    {isChoiceQuestion(item) ? '选择题' : '填空题'}
                  </Text>
                </View>
              </View>
            </View>

            <MathText style={styles.question}>
              {questionOf(item) || '（未填写题目）'}
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

            <View style={styles.answerRow}>
              <Text style={styles.answerLabel}>答案</Text>
              <MathText style={styles.answer}>
                {item.answer || '（未填写答案）'}
              </MathText>
            </View>

            <View style={styles.cardFooter}>
              <View style={styles.statsRow}>
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: item.mastered
                        ? colors.success
                        : colors.textMuted,
                    },
                  ]}
                />
                <Text style={styles.stats}>
                  {item.mastered ? '已掌握' : '待复习'} · 做题{' '}
                  {item.attempt_count ?? 0} 次 · 正确率 {item.accuracy ?? 0}%
                </Text>
              </View>
              <GlassChip
                label="删除"
                onPress={() => handleDelete(item)}
                style={styles.deleteChip}
                textStyle={styles.deleteText}
                accessibilityLabel="删除这道错题"
              />
            </View>
          </GlassPanel>
        )}
        ListEmptyComponent={
          <GlassPanel
            radius={26}
            style={styles.emptyPanel}
            contentStyle={styles.emptyContent}
          >
            <Text style={styles.emptyIcon}>◌</Text>
            <Text style={styles.emptyTitle}>还没有错题</Text>
            <Text style={styles.emptyText}>去「录入」记下第一道题吧。</Text>
          </GlassPanel>
        }
      />
    </View>
  );
}


const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {flex: 1, overflow: 'hidden'},
    list: {flex: 1, overflow: 'hidden'},
    center: {flex: 1, justifyContent: 'center', alignItems: 'center'},
    loadingText: {marginTop: 12, color: colors.textMuted, fontSize: 13},
    listContent: {paddingHorizontal: 16, paddingTop: 2},
    listHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 4,
      paddingTop: 2,
      paddingBottom: 14,
    },
    listTitle: {fontSize: 20, fontWeight: '800', color: colors.text},
    listSubtitle: {
      fontSize: 12,
      color: colors.textMuted,
      marginTop: 3,
      letterSpacing: 0.2,
    },
    countBadge: {
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 14,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    countText: {fontSize: 12, fontWeight: '700', color: colors.textSecondary},
    separator: {height: 12},
    card: {},
    cardContent: {padding: 17},
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 11,
      gap: 10,
    },
    cardTitleWrap: {flex: 1},
    subject: {
      fontSize: 13,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 0.3,
    },
    knowledge: {fontSize: 11.5, color: colors.textMuted, marginTop: 3},
    cardMeta: {flexDirection: 'row', alignItems: 'center'},
    typeBadge: {
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 4,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    typeBadgeText: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.4,
    },
    question: {
      fontSize: 16.5,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 26,
    },
    optionsBox: {
      marginTop: 11,
      gap: 5,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 12,
    },
    optionText: {fontSize: 14, color: colors.textSecondary, lineHeight: 22},
    answerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 12,
    },
    answerLabel: {
      fontSize: 10.5,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.8,
    },
    answer: {flex: 1, fontSize: 13.5, color: colors.textSecondary},
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: 13,
      paddingTop: 11,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    statsRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    statusDot: {width: 6, height: 6, borderRadius: 3},
    stats: {fontSize: 11.5, color: colors.textMuted},
    deleteChip: {minWidth: 0},
    deleteText: {fontSize: 12, color: colors.danger, fontWeight: '700'},
    emptyPanel: {marginTop: 40},
    emptyContent: {alignItems: 'center', paddingVertical: 38},
    emptyIcon: {fontSize: 32, color: colors.textMuted},
    emptyTitle: {
      marginTop: 10,
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    emptyText: {marginTop: 5, fontSize: 13, color: colors.textMuted},
  });
