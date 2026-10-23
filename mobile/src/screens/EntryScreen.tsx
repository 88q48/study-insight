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
  ActivityIndicator,
} from 'react-native';
import { launchCamera, launchImageLibrary, ImagePickerResponse } from 'react-native-image-picker';

const BASE_URL = 'http://10.0.2.2:8010';

export default function EntryScreen() {
  const [subject, setSubject] = useState('');
  const [knowledgePoint, setKnowledgePoint] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  
  // 状态管理
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);

  // ================== OCR 相关逻辑 ==================
  const handleOCR = () => {
    Alert.alert('OCR 拍照识别', '请选择图片来源', [
      { text: '取消', style: 'cancel' },
      { text: '拍照', onPress: () => openImagePicker('camera') },
      { text: '从相册选择', onPress: () => openImagePicker('library') },
    ]);
  };

  const openImagePicker = async (type: 'camera' | 'library') => {
    const options = {
      mediaType: 'photo' as const,
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 0.8 as const,
    };

    try {
      let response: ImagePickerResponse;
      if (type === 'camera') {
        response = await launchCamera(options);
      } else {
        response = await launchImageLibrary(options);
      }

      if (response.didCancel) return;
      if (response.errorCode) {
        return Alert.alert('错误', response.errorMessage || '无法获取图片');
      }

      const imageUri = response.assets?.[0]?.uri;
      if (imageUri) {
        // 这里调用模拟的上传识别逻辑
        simulateUploadOCR(imageUri);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('错误', '调用相机/相册失败');
    }
  };

  const simulateUploadOCR = (imageUri: string) => {
    setIsOcrLoading(true);
    // ⚠️ 注意：因为 B 同学的后端还没写 OCR 接口，这里我们先用 setTimeout 模拟网络请求。
    // 等后端写好后，请把这段替换为真实的 fetch 上传 FormData 请求。
    setTimeout(() => {
      setIsOcrLoading(false);
      // 模拟识别成功的填充
      setQuestion('已知函数 f(x) = x^2 + 2x，求它的最小值？');
      setSubject('数学');
      setKnowledgePoint('二次函数');
      Alert.alert('识别成功', '题目内容已自动填充！');
    }, 2000);
  };


  // ================== 提交逻辑 ==================
  const handleSubmit = async () => {
    if (!subject || !question) {
      Alert.alert('提示', '科目和题目内容不能为空！');
      return;
    }
    setIsSubmitting(true);

    const payload = {
      error_id: `err_${Date.now()}`,
      device_id: 'android_emulator_01',
      subject,
      knowledge_point: knowledgePoint || '未分类',
      content: answer || '暂无答案',
      question_content: question,
      created_at: new Date().toISOString(),
      mastered: false,
      review_count: 0,
    };

    try {
      const response = await fetch(`${BASE_URL}/api/v1/errors`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        Alert.alert('成功', '错题录入成功！');
        // 清空表单
        setSubject('');
        setKnowledgePoint('');
        setQuestion('');
        setAnswer('');
      } else {
        Alert.alert('失败', '后端拒绝了请求');
      }
    } catch (error) {
      console.error(error);
      Alert.alert('网络错误', '无法连接服务器');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ================== UI 渲染 ==================
  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView contentContainerStyle={{ padding: 20 }}>
        
        {/* OCR 拍照按钮 */}
        <TouchableOpacity 
          style={[styles.ocrBtn, isOcrLoading && { opacity: 0.7 }]} 
          onPress={handleOCR}
          disabled={isOcrLoading}
        >
          {isOcrLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color="#fff" style={{ marginRight: 10 }} />
              <Text style={styles.ocrBtnText}>正在识别中...</Text>
            </View>
          ) : (
            <Text style={styles.ocrBtnText}>📷 拍照识别题目 (OCR)</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.label}>科目 *</Text>
        <TextInput 
          style={styles.input} 
          placeholder="例如：数学" 
          value={subject} 
          onChangeText={setSubject} 
        />

        <Text style={styles.label}>知识点</Text>
        <TextInput 
          style={styles.input} 
          placeholder="例如：导数" 
          value={knowledgePoint} 
          onChangeText={setKnowledgePoint} 
        />

        <Text style={styles.label}>题目内容 *</Text>
        <TextInput 
          style={[styles.input, { height: 100 }]} 
          multiline 
          textAlignVertical="top" 
          placeholder="输入题目..." 
          value={question} 
          onChangeText={setQuestion} 
        />

        <Text style={styles.label}>答案 / 解析</Text>
        <TextInput 
          style={[styles.input, { height: 80 }]} 
          multiline 
          textAlignVertical="top" 
          placeholder="输入答案..." 
          value={answer} 
          onChangeText={setAnswer} 
        />

        <TouchableOpacity 
          style={[styles.submitBtn, isSubmitting && { opacity: 0.5 }]} 
          onPress={handleSubmit} 
          disabled={isSubmitting}
        >
          <Text style={styles.submitBtnText}>
            {isSubmitting ? '提交中...' : '保存错题'}
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  ocrBtn: { 
    backgroundColor: '#34C759', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center', 
    marginBottom: 20,
    flexDirection: 'row',
    justifyContent: 'center'
  },
  ocrBtnText: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  label: { fontSize: 16, fontWeight: '600', color: '#444', marginBottom: 8 },
  input: { 
    backgroundColor: '#fff', 
    borderWidth: 1, 
    borderColor: '#ddd', 
    borderRadius: 8, 
    padding: 12, 
    fontSize: 16, 
    marginBottom: 15 
  },
  submitBtn: { 
    backgroundColor: '#007AFF', 
    padding: 15, 
    borderRadius: 8, 
    alignItems: 'center', 
    marginTop: 10,
    marginBottom: 40
  },
  submitBtnText: { color: '#fff', fontSize: 18, fontWeight: 'bold' },
});