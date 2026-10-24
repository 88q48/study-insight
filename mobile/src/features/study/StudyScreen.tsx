import React, { useState, useCallback } from 'react';
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
import type { ErrorItem, SubjectOption } from '../../shared/api/types';
import MathText from '../../shared/ui/MathText';
import {
  CHOICE_KEYS,
  answerOf,
  isChoiceQuestion,
  optionOf,
  questionOf,
} from '../../shared/domain/error';

export default function StudyScreen() {
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
          <ActivityIndicator size="large" color="#007AFF" style={{marginTop: 30}} />
        ) : (
          <>
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

            <Text style={styles.sectionLabel}>做题数</Text>
            <View style={styles.chipRow}>
              {[5, 10, 20, 50].map(count => (
                <TouchableOpacity
                  key={count}
                  style={[
                    styles.chip,
                    questionLimit === count && styles.chipActive,
                  ]}
                  onPress={() => setQuestionLimit(count)}
                >
                  <Text
                    style={[
                      styles.chipText,
                      questionLimit === count && styles.chipTextActive,
                    ]}
                  >
                    {count} 题
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <TouchableOpacity
              style={[styles.startBtn, loading && {opacity: 0.5}]}
              onPress={handleStart}
              disabled={loading}
            >
              <Text style={styles.btnText}>
                {loading ? '加载中...' : '开始练习'}
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
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10 }}>加载题库中...</Text>
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
            placeholderTextColor="#9AA4B2"
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
            <Text style={[styles.resultText, { color: hasAnswer ? (isCorrect ? '#34C759' : '#FF3B30') : '#666' }]}>
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

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F6FC', padding: 16 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 18, color: '#666', textAlign: 'center' },
  setupContainer: { flex: 1, backgroundColor: '#F3F6FC', padding: 16 },
  setupTitle: { fontSize: 26, fontWeight: '700', color: '#1F2937', marginTop: 8 },
  setupHint: { fontSize: 14, color: '#7B8494', marginTop: 8, marginBottom: 20, lineHeight: 22 },
  sectionLabel: { fontSize: 15, fontWeight: '600', color: '#4B5563', marginTop: 14, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F4',
    backgroundColor: '#FFFFFF',
  },
  chipActive: { backgroundColor: '#3B6EF6', borderColor: '#3B6EF6' },
  chipText: { fontSize: 14, color: '#5B6472', fontWeight: '600' },
  chipTextActive: { color: '#FFFFFF' },
  startBtn: {
    marginTop: 28,
    backgroundColor: '#3B6EF6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 3,
    shadowColor: '#3B6EF6',
    shadowOpacity: 0.25,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E8EEF8',
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  statsText: { fontSize: 12.5, color: '#7B8494' },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  progressText: { fontSize: 16, fontWeight: '700', color: '#1F2937' },
  tag: { backgroundColor: '#EAF1FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  tagText: { color: '#3B6EF6', fontSize: 14, fontWeight: '700' },
  
  questionBox: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    marginBottom: 18,
    borderWidth: 1,
    borderColor: '#E8EEF8',
    borderLeftWidth: 4,
    borderLeftColor: '#3B6EF6',
    elevation: 2,
    shadowColor: '#1F2937',
    shadowOpacity: 0.06,
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 4},
    minHeight: 150,
  },
  questionLabel: { fontSize: 12, color: '#8A94A6', marginBottom: 10, letterSpacing: 0.4 },
  questionText: { fontSize: 22, fontWeight: '600', color: '#1F2937', lineHeight: 34 },
  optionList: { marginTop: 16, gap: 10 },
  optionText: { fontSize: 16, color: '#3F4A5A', lineHeight: 26 },
  choiceRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  choiceBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DDE5F2',
    backgroundColor: '#F8FAFF',
    alignItems: 'center',
  },
  choiceBtnActive: { borderColor: '#3B6EF6', backgroundColor: '#EAF1FF' },
  choiceBtnCorrect: { borderColor: '#34C759', backgroundColor: '#E9F9EF' },
  choiceBtnWrong: { borderColor: '#FF3B30', backgroundColor: '#FDECEC' },
  choiceText: { textAlign: 'center', fontSize: 18, fontWeight: '700', color: '#1F2937' },
  
  answerBox: {
    backgroundColor: '#FFFFFF',
    padding: 18,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E8EEF8',
    elevation: 2,
    shadowColor: '#1F2937',
    shadowOpacity: 0.05,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
  },
  input: { backgroundColor: '#F8FAFF', borderWidth: 1, borderColor: '#E2E8F4', borderRadius: 10, padding: 15, fontSize: 16, marginBottom: 15 },
  inputCorrect: { borderColor: '#34C759', backgroundColor: '#F0FFF4' },
  inputWrong: { borderColor: '#FF3B30', backgroundColor: '#FFF0F0' },
  
  primaryBtn: {
    backgroundColor: '#3B6EF6',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
    elevation: 2,
    shadowColor: '#3B6EF6',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: {width: 0, height: 3},
  },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  
  resultBox: { alignItems: 'center' },
  resultText: { fontSize: 20, fontWeight: '700', marginBottom: 10 },
  correctAnswerText: { fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center' },
});