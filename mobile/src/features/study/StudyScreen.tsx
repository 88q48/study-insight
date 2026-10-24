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

import { fetchErrors } from '../../shared/api/client';
import type { ErrorItem } from '../../shared/api/types';
import {
  CHOICE_KEYS,
  answerOf,
  isChoiceQuestion,
  optionOf,
  questionOf,
} from '../../shared/domain/error';

export default function StudyScreen() {
  const [questions, setQuestions] = useState<ErrorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  // 每次进入学习页面，重新拉取待复习错题
  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      setLoading(true);
      fetchErrors()
        .then((result) => {
          if (isActive) {
            setQuestions(result.items.filter((item) => !item.mastered));
            setCurrentIndex(0);
            setUserAnswer('');
            setShowResult(false);
            setLoading(false);
          }
        })
        .catch((err) => {
          if (isActive) {
            console.error(err);
            setLoading(false);
          }
        });
      return () => { isActive = false; };
    }, [])
  );

  // 加载中状态
  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" color="#007AFF" />
        <Text style={{ marginTop: 10 }}>加载题库中...</Text>
      </View>
    );
  }

  // 没有错题的状态
  if (questions.length === 0) {
    return (
      <View style={styles.center}>
        <Text style={styles.emptyText}>🎉 太棒了，目前没有可以挑战的错题！</Text>
      </View>
    );
  }

  // 获取当前题目
  const currentQ = questions[currentIndex];

  const correctAnswer = answerOf(currentQ);
  const hasAnswer = correctAnswer.trim().length > 0;
  const isChoice = isChoiceQuestion(currentQ);

  // 检查答案
  const handleCheck = () => {
    const normalize = (value: string) => value.trim().toLowerCase();
    const isRight = hasAnswer && normalize(userAnswer) === normalize(correctAnswer);
    setIsCorrect(isRight);
    setShowResult(true);
  };

  // 下一题
  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setUserAnswer('');
      setShowResult(false);
    } else {
      Alert.alert('恭喜', '你已完成本轮所有错题复习！');
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
              <Text style={styles.btnText}>下一题</Text>
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