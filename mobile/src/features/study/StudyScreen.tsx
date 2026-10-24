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
        <Text style={styles.questionText}>{questionOf(currentQ) || '（未填写题目）'}</Text>
        {isChoice && (
          <View style={styles.optionList}>
            {CHOICE_KEYS.map(key => (
              <Text key={key} style={styles.optionText}>
                {key}. {optionOf(currentQ, key)}
              </Text>
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
              <Text style={styles.correctAnswerText}>
                正确答案：{correctAnswer}
              </Text>
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
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 20 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  emptyText: { fontSize: 18, color: '#666', textAlign: 'center' },
  setupContainer: { flex: 1, backgroundColor: '#f8f9fa', padding: 20 },
  setupTitle: { fontSize: 24, fontWeight: 'bold', color: '#333', marginTop: 8 },
  setupHint: { fontSize: 14, color: '#777', marginTop: 8, marginBottom: 20 },
  sectionLabel: { fontSize: 16, fontWeight: '600', color: '#444', marginTop: 12, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#d9deea',
    backgroundColor: '#fff',
  },
  chipActive: { backgroundColor: '#007AFF', borderColor: '#007AFF' },
  chipText: { fontSize: 14, color: '#555', fontWeight: '600' },
  chipTextActive: { color: '#fff' },
  startBtn: {
    marginTop: 28,
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statsText: { fontSize: 12.5, color: '#777' },
  
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  progressText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  tag: { backgroundColor: '#E5F0FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  tagText: { color: '#007AFF', fontSize: 14, fontWeight: 'bold' },
  
  questionBox: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 20, elevation: 2, minHeight: 150 },
  questionLabel: { fontSize: 14, color: '#999', marginBottom: 10 },
  questionText: { fontSize: 20, fontWeight: 'bold', color: '#333', lineHeight: 30 },
  optionList: { marginTop: 14, gap: 8 },
  optionText: { fontSize: 16, color: '#444', lineHeight: 24 },
  choiceRow: { flexDirection: 'row', gap: 10, marginBottom: 15 },
  choiceBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    backgroundColor: '#fff',
    alignItems: 'center',
  },
  choiceBtnActive: { borderColor: '#007AFF', backgroundColor: '#EAF2FF' },
  choiceBtnCorrect: { borderColor: '#34C759', backgroundColor: '#E9F9EF' },
  choiceBtnWrong: { borderColor: '#FF3B30', backgroundColor: '#FDECEC' },
  choiceText: { textAlign: 'center', fontSize: 18, fontWeight: 'bold', color: '#333' },
  
  answerBox: { backgroundColor: '#fff', padding: 20, borderRadius: 12, elevation: 2 },
  input: { backgroundColor: '#f8f9fa', borderWidth: 2, borderColor: '#eee', borderRadius: 8, padding: 15, fontSize: 16, marginBottom: 15 },
  inputCorrect: { borderColor: '#34C759', backgroundColor: '#f0fff4' },
  inputWrong: { borderColor: '#FF3B30', backgroundColor: '#fff0f0' },
  
  primaryBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center' },
  btnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  
  resultBox: { alignItems: 'center' },
  resultText: { fontSize: 20, fontWeight: 'bold', marginBottom: 10 },
  correctAnswerText: { fontSize: 16, color: '#666', marginBottom: 20, textAlign: 'center' },
});