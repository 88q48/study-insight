import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';

// 模拟器访问电脑本机，端口 8010
const BASE_URL = 'http://10.0.2.2:8010';

const App = () => {
  const [subject, setSubject] = useState('');
  const [knowledgePoint, setKnowledgePoint] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!subject || !question) {
      Alert.alert('提示', '科目和题目内容不能为空哦！');
      return;
    }

    setIsSubmitting(true);

    // 🔥 严格对齐后端 /api/v1/errors 的字段要求
    const payload = {
      error_id: `err_${Date.now()}`, // 生成一个唯一 ID
      device_id: 'android_emulator_01', // 设备标识
      subject: subject,
      knowledge_point: knowledgePoint || '未分类', 
      content: answer || '暂无答案', // 将答案映射为 content
      question_content: question, // 题目映射为 question_content
      created_at: new Date().toISOString(), // 当前时间
      mastered: false,
      review_count: 0
    };

    try {
      // 🚨 路径改成了 /api/v1/errors
      const response = await fetch(`${BASE_URL}/api/v1/errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // 处理可能为空响应的 200 OK
      const text = await response.text();
      const result = text ? JSON.parse(text) : {};

      if (response.ok) {
        Alert.alert('成功', '错题录入成功！');
        setSubject('');
        setKnowledgePoint('');
        setQuestion('');
        setAnswer('');
      } else {
        const errorMsg = result.detail ? JSON.stringify(result.detail) : '录入失败，请检查字段';
        Alert.alert('失败', errorMsg);
      }
    } catch (error) {
      console.error(error);
      Alert.alert('网络错误', '无法连接服务器。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <Text style={styles.headerTitle}>📚 错题录入</Text>

        <View style={styles.formGroup}>
          <Text style={styles.label}>科目 <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={styles.input}
            placeholder="例如：数学"
            value={subject}
            onChangeText={setSubject}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>知识点</Text>
          <TextInput
            style={styles.input}
            placeholder="例如：导数"
            value={knowledgePoint}
            onChangeText={setKnowledgePoint}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>题目内容 <Text style={styles.required}>*</Text></Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="输入题目..."
            multiline
            numberOfLines={4}
            textAlignVertical="top"
            value={question}
            onChangeText={setQuestion}
          />
        </View>

        <View style={styles.formGroup}>
          <Text style={styles.label}>正确答案 / 解析</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="输入正确答案..."
            multiline
            numberOfLines={3}
            textAlignVertical="top"
            value={answer}
            onChangeText={setAnswer}
          />
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, isSubmitting && styles.btnDisabled]}
          onPress={handleSubmit}
          disabled={isSubmitting}
        >
          <Text style={styles.submitBtnText}>{isSubmitting ? '提交中...' : '保存错题'}</Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  scrollContent: { padding: 20, paddingBottom: 50 },
  headerTitle: { fontSize: 24, fontWeight: 'bold', color: '#333', marginBottom: 20, textAlign: 'center' },
  formGroup: { marginBottom: 15 },
  label: { fontSize: 16, fontWeight: '600', color: '#444', marginBottom: 8 },
  required: { color: 'red' },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#ddd', borderRadius: 8, padding: 12, fontSize: 16 },
  textArea: { height: 100, paddingTop: 12 },
  submitBtn: { backgroundColor: '#007AFF', padding: 15, borderRadius: 8, alignItems: 'center', marginTop: 10 },
  btnDisabled: { backgroundColor: '#99c2ff' },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});

export default App;