import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';

import {
  fetchPracticeErrors,
  fetchSubjects,
  recordAttempt,
} from '../../shared/api/client';
import MathText from '../../shared/ui/MathText';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import type { ErrorItem, SubjectOption } from '../../shared/api/types';
import {
  CHOICE_KEYS,
  answerOf,
  isChoiceQuestion,
  optionOf,
  questionOf,
} from '../../shared/domain/error';

export default function StudyScreen() {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [stage, setStage] = useState<'setup' | 'quiz'>('setup');
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('全部');
  const [questionLimit, setQuestionLimit] = useState(10);
  const [setupLoading, setSetupLoading] = useState(true);
  const [loading, setLoading] = useState(false);
  const [questions, setQuestions] = useState<ErrorItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // 进入练习页时加载科目，供本次练习选择
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setSetupLoading(true);
      fetchSubjects()
        .then(result => {
          if (isActive) {
            setSubjects(result.subjects);
          }
        })
        .catch(err => {
          console.error(err);
          if (isActive) {
            Alert.alert('提示', '科目加载失败，仍可以选择「全部」开始');
          }
        })
        .finally(() => {
          if (isActive) {
            setSetupLoading(false);
          }
        });
      return () => {
        isActive = false;
      };
    }, []),
  );

  const handleStart = async () => {
    setLoading(true);
    try {
      const result = await fetchPracticeErrors(
        selectedSubject === '全部' ? undefined : selectedSubject,
        questionLimit,
      );
      if (!result.items.length) {
        Alert.alert('提示', '这个科目暂时没有可练习的错题');
        return;
      }
      setQuestions(result.items);
      setCurrentIndex(0);
      setUserAnswer('');
      setShowResult(false);
      setIsCorrect(false);
      setStage('quiz');
    } catch (err) {
      const message = err instanceof Error ? err.message : '无法获取练习题目';
      Alert.alert('加载失败', message);
    } finally {
      setLoading(false);
    }
  };

  if (stage === 'setup') {
    return (
      <View style={styles.setupContainer}>
        <Text style={styles.setupTitle}>开始练习</Text>
        <Text style={styles.setupHint}>选择题量和科目，优先安排错得多的题。</Text>

        {setupLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={{marginTop: 30}} />
        ) : (
          <>
            <View style={styles.setupCard}>
              <Text style={styles.sectionLabel}>科目</Text>
              <View style={styles.chipRow}>
                {['全部', ...subjects.map(item => item.subject)].map(subject => (
                  <TouchableOpacity
                    key={subject}
                    style={[
                      styles.chip,
                      selectedSubject === subject && styles.chipActive,
                    ]}
                    onPress={() => setSelectedSubject(subject)}
                  >
                    <Text
                      style={[
                        styles.chipText,
                        selectedSubject === subject && styles.chipTextActive,
                      ]}
                    >
                      {subject}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[styles.sectionLabel, {marginTop: 22}]}>做题数</Text>
              <View style={styles.countRow}>
                {[5, 10, 20, 50].map(count => (
                  <TouchableOpacity
                    key={count}
                    style={[
                      styles.countCard,
                      questionLimit === count && styles.countCardActive,
                    ]}
                    onPress={() => setQuestionLimit(count)}
                  >
                    <Text
                      style={[
                        styles.countNumber,
                        questionLimit === count && styles.countTextActive,
                      ]}
                    >
                      {count}
                    </Text>
                    <Text
                      style={[
                        styles.countUnit,
                        questionLimit === count && styles.countTextActive,
                      ]}
                    >
                      题
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.infoRow}>
                <View style={styles.infoIcon}>
                  <Text style={styles.infoCheck}>✓</Text>
                </View>
                <Text style={styles.infoText}>
                  已开启「错题优先」，薄弱题目会先出现
                </Text>
              </View>
            </View>

            <View style={styles.setupSpacer} />

            <TouchableOpacity
              style={[styles.startBtn, loading && {opacity: 0.5}]}
              onPress={handleStart}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? '加载中...' : `开始练习 · ${questionLimit} 题  →`}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  }

  // 加载题库中
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={{ marginTop: 10, color: colors.textSecondary }}>加载题库中...</Text>
      </View>
    );
  }

  if (questions.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>没有可练习的错题</Text>
      </View>
    );
  }

  // 获取当前题目
  const currentQ = questions[currentIndex];

  const correctAnswer = answerOf(currentQ);
  const hasAnswer = correctAnswer.trim().length > 0;
  const isChoice = isChoiceQuestion(currentQ);

  // 检查答案，并把本次结果写回后端统计
  const handleCheck = async () => {
    const normalize = (value: string) => value.trim().toLowerCase();
    const isRight = hasAnswer && normalize(userAnswer) === normalize(correctAnswer);
    setIsCorrect(isRight);
    setShowResult(true);

    try {
      const result = await recordAttempt(currentQ.error_id, userAnswer);
      setIsCorrect(result.correct);
      setQuestions(current =>
        current.map(item =>
          item.error_id === result.error.error_id ? result.error : item,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '请检查网络';
      Alert.alert('统计失败', `本次做题未记录：${message}`);
    }
  };

  // 下一题
  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setUserAnswer('');
      setShowResult(false);
    } else {
      setStage('setup');
      setQuestions([]);
      setCurrentIndex(0);
      setUserAnswer('');
      setShowResult(false);
      Alert.alert('恭喜', '本轮练习完成，可以重新选择科目和题量。');
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      {/* 顶部进度条 */}
      <View style={styles.header}>
        <Text style={styles.progressText}>
          第 {currentIndex + 1} / {questions.length} 题
        </Text>
        <View style={styles.tag}>
          <Text style={styles.tagText}>{currentQ.subject || '未分类'}</Text>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Text style={styles.statsText}>
          做 {currentQ.attempt_count ?? 0} 次 · 正确率 {currentQ.accuracy ?? 0}%
        </Text>
        <Text style={styles.statsText}>
          错 {currentQ.wrong_count ?? 0} 次
        </Text>
      </View>

      {/* 题目区域 */}
      <View style={styles.questionBox}>
        <Text style={styles.questionLabel}>题目：</Text>
        <MathText style={styles.questionText}>
          {questionOf(currentQ) || '（未填写题目）'}
        </MathText>
        {isChoice && (
          <View style={styles.optionList}>
            {CHOICE_KEYS.map(key => (
              <MathText key={key} style={styles.optionText}>
                {key}. {optionOf(currentQ, key)}
              </MathText>
            ))}
          </View>
        )}
      </View>

      {/* 作答区域 */}
      <View style={styles.answerBox}>
        {isChoice ? (
          <View style={styles.choiceRow}>
            {CHOICE_KEYS.map(key => {
              const selected = userAnswer === key;
              const rightOption = showResult && correctAnswer.toUpperCase() === key;
              const wrongOption = showResult && selected && !isCorrect;
              return (
                <TouchableOpacity
                  key={key}
                  style={[
                    styles.choiceBtn,
                    selected && styles.choiceBtnActive,
                    rightOption && styles.choiceBtnCorrect,
                    wrongOption && styles.choiceBtnWrong,
                  ]}
                  onPress={() => setUserAnswer(key)}
                  disabled={showResult}
                >
                  <Text style={styles.choiceText}>{key}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : (
          <TextInput
            style={[
              styles.input,
              showResult && (isCorrect ? styles.inputCorrect : styles.inputWrong),
            ]}
            placeholder="在此输入你的答案..."
            placeholderTextColor={colors.placeholder}
            value={userAnswer}
            onChangeText={setUserAnswer}
            editable={!showResult} // 提交后不可再修改
          />
        )}

        {!showResult ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCheck}>
            <Text style={styles.btnText}>提交答案</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.resultBox}>
            <Text style={[styles.resultText, { color: hasAnswer ? (isCorrect ? colors.success : colors.danger) : colors.textMuted }]}>
              {hasAnswer ? (isCorrect ? '✅ 回答正确！' : '❌ 回答错误') : '📝 暂无标准答案，请对照题目自评'}
            </Text>
            {!isCorrect && hasAnswer && (
              <MathText style={styles.correctAnswerText}>
                正确答案：{correctAnswer}
              </MathText>
            )}
            <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
              <Text style={styles.btnText}>
                {currentIndex < questions.length - 1 ? '下一题' : '完成本轮'}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceAlt, padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 18, color: colors.textMuted, textAlign: 'center' },
  setupContainer: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20, paddingTop: 2 },
  setupTitle: { fontSize: 30, fontWeight: '800', color: colors.text, marginTop: 4 },
  setupHint: { fontSize: 15, color: colors.textSecondary, marginTop: 8, marginBottom: 18, lineHeight: 23 },
  sectionLabel: { fontSize: 15, fontWeight: '700', color: colors.textSecondary, marginTop: 0, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  setupCard: {
    backgroundColor: colors.surface,
    borderRadius: 24,
    padding: 18,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 8},
    elevation: 3,
  },
  countRow: { flexDirection: 'row', gap: 10 },
  countCard: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
    alignItems: 'center',
  },
  countCardActive: {backgroundColor: colors.primaryStrong, borderColor: colors.primary},
  countNumber: {fontSize: 22, fontWeight: '700', color: colors.text},
  countUnit: {fontSize: 12, color: colors.textSecondary, marginTop: 1},
  countTextActive: {color: colors.onPrimary},
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    backgroundColor: colors.primarySoft,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 18,
  },
  infoIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  infoCheck: {fontSize: 11, fontWeight: '800', color: colors.primary},
  infoText: {flex: 1, fontSize: 12.5, color: colors.textSecondary, lineHeight: 18},
  setupSpacer: {flex: 1, minHeight: 18},
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primaryStrong, borderColor: colors.primary },
  chipText: { fontSize: 14, color: colors.textSecondary, fontWeight: '600' },
  chipTextActive: { color: colors.onPrimary },
  startBtn: {
    marginTop: 24,
    marginBottom: 12,
    backgroundColor: colors.primaryStrong,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 3,
    shadowColor: colors.primary,
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    backgroundColor: colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statsText: { fontSize: 12.5, color: colors.textMuted },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressText: { fontSize: 16, fontWeight: '700', color: colors.text },
  tag: { backgroundColor: colors.primarySoft, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  tagText: { color: colors.primary, fontSize: 14, fontWeight: '700' },
  
  questionBox: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 4,
    borderLeftColor: colors.primary,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    minHeight: 150,
  },
  questionLabel: { fontSize: 12, color: colors.textMuted, marginBottom: 10, letterSpacing: 0.4 },
  questionText: { fontSize: 22, fontWeight: '600', color: colors.text, lineHeight: 34 },
  optionList: { marginTop: 16, gap: 10 },
  optionText: { fontSize: 16, color: colors.textSecondary, lineHeight: 26 },
  choiceRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  choiceBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surfaceMuted,
    alignItems: 'center',
  },
  choiceBtnActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  choiceBtnCorrect: { borderColor: colors.success, backgroundColor: colors.successSoft },
  choiceBtnWrong: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  choiceText: { textAlign: 'center', fontSize: 18, fontWeight: '700', color: colors.text },
  
  answerBox: {
    backgroundColor: colors.surface,
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    elevation: 2,
    shadowColor: colors.shadow,
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  input: { backgroundColor: colors.surfaceMuted, borderWidth: 1, borderColor: colors.borderStrong, borderRadius: 10, padding: 15, fontSize: 16, color: colors.text, marginBottom: 15 },
  inputCorrect: { borderColor: colors.success, backgroundColor: colors.successSoft },
  inputWrong: { borderColor: colors.danger, backgroundColor: colors.dangerSoft },
  
  primaryBtn: {
    backgroundColor: colors.primaryStrong,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: colors.primary,
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
  },
  btnText: { color: colors.onPrimary, fontSize: 16, fontWeight: '700' },
  
  resultBox: { alignItems: 'center' },
  resultText: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  correctAnswerText: { fontSize: 16, color: colors.textMuted, marginBottom: 20, textAlign: 'center' },
});