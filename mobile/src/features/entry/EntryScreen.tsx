import React, { useMemo, useState } from 'react';
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
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';

import { createError } from '../../shared/api/client';
import type { QuestionType } from '../../shared/api/types';
import { CHOICE_KEYS } from '../../shared/domain/error';
import type { ChoiceKey } from '../../shared/domain/error';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';

export default function EntryScreen() {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const [subject, setSubject] = useState('');
  const [knowledgePoint, setKnowledgePoint] = useState('');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [questionType, setQuestionType] = useState<QuestionType>('fill');
  const [options, setOptions] = useState<Record<ChoiceKey, string>>({
    A: '',
    B: '',
    C: '',
    D: '',
  });
  const [correctOption, setCorrectOption] = useState<ChoiceKey | null>(null);

  const updateOption = (key: ChoiceKey, value: string) => {
    setOptions(current => ({...current, [key]: value}));
  };

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
        await recognizeImage(imageUri);
      }
    } catch (err) {
      console.error(err);
      Alert.alert('错误', '调用相机/相册失败');
    }
  };

  const recognizeImage = async (imageUri: string) => {
    setIsOcrLoading(true);
    try {
      const result = await TextRecognition.recognize(
        imageUri,
        TextRecognitionScript.CHINESE,
      );
      const text = (result.text || '').trim();
      if (!text) {
        throw new Error('没有识别到文字，请换个角度再拍一张。');
      }
      setQuestion(text);
      Alert.alert('识别完成', '题目已填入，请补充科目和知识点。');
    } catch (err) {
      const message = err instanceof Error ? err.message : '请手动输入题目';
      Alert.alert('识别失败', message);
    } finally {
      setIsOcrLoading(false);
    }
  };


  // ================== 提交逻辑 ==================
  const handleSubmit = async () => {
    if (!subject || !question) {
      Alert.alert('提示', '科目和题目内容不能为空！');
      return;
    }
    if (questionType === 'choice') {
      const missing = CHOICE_KEYS.filter(key => !options[key].trim());
      if (missing.length) {
        Alert.alert('提示', `请填写选项 ${missing.join('、')}`);
        return;
      }
      if (!correctOption) {
        Alert.alert('提示', '请选择正确答案 A/B/C/D');
        return;
      }
    }
    setIsSubmitting(true);

    const payload = {
      // 带随机后缀：只用毫秒时间戳，同一毫秒连点两次会被后端当成重复写入
      error_id: `err_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
      subject,
      knowledge_point: knowledgePoint || '未分类',
      content: question,
      answer: questionType === 'choice' ? correctOption ?? '' : answer.trim(),
      question_type: questionType,
      option_a: questionType === 'choice' ? options.A.trim() : '',
      option_b: questionType === 'choice' ? options.B.trim() : '',
      option_c: questionType === 'choice' ? options.C.trim() : '',
      option_d: questionType === 'choice' ? options.D.trim() : '',
      question_content: question,
      created_at: new Date().toISOString(),
      mastered: false,
      review_count: 0,
    };

    try {
      const result = await createError(payload);
      Alert.alert('成功', result.message || '错题录入成功！');
      // 清空表单
      setSubject('');
      setKnowledgePoint('');
      setQuestion('');
      setAnswer('');
      setQuestionType('fill');
      setOptions({A: '', B: '', C: '', D: ''});
      setCorrectOption(null);
    } catch (error) {
      const message = error instanceof Error ? error.message : '无法连接服务器';
      Alert.alert('失败', message);
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
      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 110 }}>

        {/* OCR 拍照按钮 */}
        <TouchableOpacity
          style={[styles.ocrBtn, isOcrLoading && { opacity: 0.7 }]}
          onPress={handleOCR}
          disabled={isOcrLoading}
        >
          {isOcrLoading ? (
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <ActivityIndicator color={colors.onPrimary} style={{ marginRight: 10 }} />
              <Text style={styles.ocrBtnText}>正在识别中...</Text>
            </View>
          ) : (
            <Text style={styles.ocrBtnText}>📷 拍照识别题目 (OCR)</Text>
          )}
        </TouchableOpacity>

        <Text style={styles.label}>题型 *</Text>
        <View style={styles.typeRow}>
          <TouchableOpacity
            style={[styles.typeBtn, questionType === 'choice' && styles.typeBtnActive]}
            onPress={() => setQuestionType('choice')}
          >
            <Text style={[styles.typeBtnText, questionType === 'choice' && styles.typeBtnTextActive]}>
              选择题
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.typeBtn, questionType === 'fill' && styles.typeBtnActive]}
            onPress={() => setQuestionType('fill')}
          >
            <Text style={[styles.typeBtnText, questionType === 'fill' && styles.typeBtnTextActive]}>
              填空题
            </Text>
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>科目 *</Text>
        <TextInput
          style={styles.input}
          placeholder="例如：数学"
          placeholderTextColor={colors.placeholder}
          value={subject}
          onChangeText={setSubject}
        />

        <Text style={styles.label}>知识点</Text>
        <TextInput
          style={styles.input}
          placeholder="例如：导数"
          placeholderTextColor={colors.placeholder}
          value={knowledgePoint}
          onChangeText={setKnowledgePoint}
        />

        <Text style={styles.label}>题目内容 *</Text>
        <TextInput
          style={[styles.input, { height: 100 }]}
          multiline
          textAlignVertical="top"
          placeholder="输入题目..."
          placeholderTextColor={colors.placeholder}
          value={question}
          onChangeText={setQuestion}
        />

        {questionType === 'choice' ? (
          <>
            <Text style={styles.label}>选项 *</Text>
            {CHOICE_KEYS.map(key => (
              <View style={styles.optionRow} key={key}>
                <View style={[styles.optionBadge, correctOption === key && styles.optionBadgeActive]}>
                  <Text style={[styles.optionBadgeText, correctOption === key && styles.optionBadgeTextActive]}>
                    {key}
                  </Text>
                </View>
                <TextInput
                  style={[styles.input, styles.optionInput]}
                  placeholder={`选项 ${key}`}
                  placeholderTextColor={colors.placeholder}
                  value={options[key]}
                  onChangeText={value => updateOption(key, value)}
                />
              </View>
            ))}

            <Text style={styles.label}>正确答案 *</Text>
            <View style={styles.correctRow}>
              {CHOICE_KEYS.map(key => (
                <TouchableOpacity
                  key={key}
                  style={[styles.correctBtn, correctOption === key && styles.correctBtnActive]}
                  onPress={() => setCorrectOption(key)}
                >
                  <Text style={[styles.correctBtnText, correctOption === key && styles.correctBtnTextActive]}>
                    {key}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </>
        ) : (
          <>
            <Text style={styles.label}>答案 / 解析</Text>
            <TextInput
              style={[styles.input, { height: 80 }]}
              multiline
              textAlignVertical="top"
              placeholder="输入答案..."
              placeholderTextColor={colors.placeholder}
              value={answer}
              onChangeText={setAnswer}
            />
          </>
        )}

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

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.surfaceAlt},
    ocrBtn: {
      backgroundColor: colors.successStrong,
      padding: 16,
      borderRadius: 10,
      alignItems: 'center',
      marginBottom: 20,
      flexDirection: 'row',
      justifyContent: 'center',
    },
    ocrBtnText: {color: colors.onPrimary, fontSize: 16, fontWeight: '700'},
    label: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    typeRow: {flexDirection: 'row', gap: 10, marginBottom: 15},
    typeBtn: {
      flex: 1,
      paddingVertical: 11,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    typeBtnActive: {
      backgroundColor: colors.primaryStrong,
      borderColor: colors.primary,
    },
    typeBtnText: {fontSize: 15, fontWeight: '600', color: colors.textSecondary},
    typeBtnTextActive: {color: colors.onPrimary},
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 10,
    },
    optionBadge: {
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primarySoft,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionBadgeActive: {backgroundColor: colors.successStrong},
    optionBadgeText: {color: colors.primary, fontWeight: 'bold'},
    optionBadgeTextActive: {color: colors.onPrimary},
    optionInput: {flex: 1, marginBottom: 0},
    correctRow: {flexDirection: 'row', gap: 10, marginBottom: 20},
    correctBtn: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
    },
    correctBtnActive: {
      backgroundColor: colors.successStrong,
      borderColor: colors.success,
    },
    correctBtnText: {fontSize: 16, fontWeight: 'bold', color: colors.textSecondary},
    correctBtnTextActive: {color: colors.onPrimary},
    input: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      padding: 12,
      fontSize: 16,
      color: colors.text,
      marginBottom: 15,
    },
    submitBtn: {
      backgroundColor: colors.primaryStrong,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 10,
      marginBottom: 40,
      elevation: 2,
      shadowColor: colors.primary,
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 3},
    },
    submitBtnText: {color: colors.onPrimary, fontSize: 18, fontWeight: '700'},
  });
