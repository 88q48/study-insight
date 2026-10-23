import React, { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';

const BASE_URL = 'http://10.0.2.2:8010';

export default function QuizScreen({ route, navigation }: any) {
  const { subject, limit } = route.params; // 接收传过来的参数

  const [questions, setQuestions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);

  useEffect(() => {
    // 拉取数据并过滤
    fetch(`${BASE_URL}/api/v1/errors`)
      .then(res => res.json())
      .then(json => {
        let items = json.items || [];
        // 1. 过滤科目
        items = items.filter((q: any) => (q.subject || '未分类') === subject);
        // 2. 随机打乱顺序（可选，增加挑战性）
        items.sort(() => Math.random() - 0.5);
        // 3. 截取指定数量
        items = items.slice(0, limit);
        
        setQuestions(items);
        setLoading(false);
      })
      .catch(() => {
        Alert.alert('错误', '获取题目失败');
        setLoading(false);
      });
  }, [subject, limit]);

  if (loading) return <ActivityIndicator size="large" style={{ flex: 1 }} />;
  if (questions.length === 0) return <Text style={{textAlign: 'center', marginTop: 50}}>该科目暂无错题</Text>;

  const currentQ = questions[currentIndex];

  const handleCheck = () => {
    const isRight = userAnswer.trim().toLowerCase() === (currentQ.content || '').trim().toLowerCase();
    setIsCorrect(isRight);
    setShowResult(true);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
      setUserAnswer('');
      setShowResult(false);
    } else {
      Alert.alert('恭喜', '挑战完成！', [
        { text: '返回大厅', onPress: () => navigation.goBack() }
      ]);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.progressText}>进度：{currentIndex + 1} / {questions.length}</Text>
        <View style={styles.tag}><Text style={styles.tagText}>{currentQ.subject}</Text></View>
      </View>

      <View style={styles.questionBox}>
        <Text style={styles.questionLabel}>题目：</Text>
        <Text style={styles.questionText}>{currentQ.question_content}</Text>
      </View>

      <View style={styles.answerBox}>
        <TextInput
          style={[styles.input, showResult && (isCorrect ? styles.inputCorrect : styles.inputWrong)]}
          placeholder="输入你的答案..."
          value={userAnswer}
          onChangeText={setUserAnswer}
          editable={!showResult}
        />

        {!showResult ? (
          <TouchableOpacity style={styles.primaryBtn} onPress={handleCheck}>
            <Text style={styles.btnText}>提交答案</Text>
          </TouchableOpacity>
        ) : (
          <View style={styles.resultBox}>
            <Text style={[styles.resultText, { color: isCorrect ? '#34C759' : '#FF3B30' }]}>
              {isCorrect ? '✅ 回答正确！' : '❌ 回答错误'}
            </Text>
            {!isCorrect && <Text style={styles.correctAnswerText}>正确答案：{currentQ.content}</Text>}
            <TouchableOpacity style={styles.primaryBtn} onPress={handleNext}>
              <Text style={styles.btnText}>{currentIndex < questions.length - 1 ? '下一题' : '完成挑战'}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa', padding: 20 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  progressText: { fontSize: 16, fontWeight: 'bold', color: '#333' },
  tag: { backgroundColor: '#E5F0FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 15 },
  tagText: { color: '#007AFF', fontSize: 14, fontWeight: 'bold' },
  questionBox: { backgroundColor: '#fff', padding: 20, borderRadius: 12, marginBottom: 20, minHeight: 150, elevation: 2 },
  questionLabel: { fontSize: 14, color: '#999', marginBottom: 10 },
  questionText: { fontSize: 20, fontWeight: 'bold', color: '#333', lineHeight: 30 },
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