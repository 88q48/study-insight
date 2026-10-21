import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  Button,
  Alert,
  ScrollView,
  SafeAreaView,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
// 引入图片选择器和 OCR 识别库
import { launchCamera } from 'react-native-image-picker';
import TextRecognition from '@react-native-ml-kit/text-recognition';

const App = () => {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [analysis, setAnalysis] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScanning, setIsScanning] = useState(false);

  // OCR 拍照识别函数
  const handleOCR = async () => {
    try {
      // 调起相机
      const result = await launchCamera({ mediaType: 'photo', saveToPhotos: true });
      
      if (result.assets && result.assets[0]?.uri) {
        setIsScanning(true);
        const imageUri = result.assets[0].uri;
        
        // 调用 ML Kit 识别图片中的文字
        const ocrResult = await TextRecognition.recognize(imageUri);
        
        if (ocrResult.text) {
          // 把识别到的文字直接塞进题目输入框
          setQuestion(ocrResult.text);
          Alert.alert('识别成功', '文字已自动填入题目框！');
        } else {
          Alert.alert('提示', '图片中没识别到文字');
        }
      }
    } catch (error) {
      console.error(error);
      Alert.alert('错误', '拍照或识别失败，请检查相机权限。');
    } finally {
      setIsScanning(false);
    }
  };

  // 提交错题的函数 (不变)
  const handleSubmit = () => {
    if (!question || !answer) {
      Alert.alert('提示', '题目和答案不能为空哦！');
      return;
    }
    setIsSubmitting(true);
    const apiUrl = 'http://10.0.2.2:3000/api/mistakes'; 

    fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question, answer, analysis }),
    })
      .then((response) => response.json())
      .then(() => {
        Alert.alert('成功', '错题已成功录入！');
        setQuestion(''); setAnswer(''); setAnalysis('');
      })
      .catch(() => {
        Alert.alert('网络错误', '提交失败，请检查后端是否开启。');
      })
      .finally(() => setIsSubmitting(false));
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scrollContainer}>
        <Text style={styles.title}>📝 错题录入</Text>

        {/* 新增的 OCR 按钮 */}
        <TouchableOpacity 
          style={styles.ocrButton} 
          onPress={handleOCR}
          disabled={isScanning}
        >
          <Text style={styles.ocrButtonText}>
            {isScanning ? '正在识别中...' : '📷 拍照识别题目'}
          </Text>
        </TouchableOpacity>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>题目内容 *</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入题目，或点击上方拍照识别..."
            value={question}
            onChangeText={setQuestion}
            multiline
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>正确答案 *</Text>
          <TextInput
            style={styles.input}
            placeholder="请输入正确答案..."
            value={answer}
            onChangeText={setAnswer}
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.label}>解析（选填）</Text>
          <TextInput
            style={[styles.input, styles.textArea]}
            placeholder="请输入题目解析..."
            value={analysis}
            onChangeText={setAnalysis}
            multiline
          />
        </View>

        <View style={styles.buttonContainer}>
          <Button
            title={isSubmitting ? '提交中...' : '提交错题'}
            onPress={handleSubmit}
            disabled={isSubmitting || isScanning}
            color="#4F46E5"
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F4F6' },
  scrollContainer: { padding: 20 },
  title: { fontSize: 24, fontWeight: 'bold', marginBottom: 20, textAlign: 'center', color: '#1F2937' },
  ocrButton: {
    backgroundColor: '#10B981',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 20,
  },
  ocrButtonText: { color: '#FFF', fontSize: 16, fontWeight: 'bold' },
  inputGroup: { marginBottom: 15 },
  label: { fontSize: 16, marginBottom: 5, color: '#374151', fontWeight: '500' },
  input: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#D1D5DB', borderRadius: 8, padding: 12, fontSize: 16 },
  textArea: { height: 100, textAlignVertical: 'top' },
  buttonContainer: { marginTop: 20, borderRadius: 8, overflow: 'hidden' },
});

export default App;