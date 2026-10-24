import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import {
  launchCamera,
  launchImageLibrary,
  type ImagePickerResponse,
} from 'react-native-image-picker';
import TextRecognition, {
  TextRecognitionScript,
} from '@react-native-ml-kit/text-recognition';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { createError, parseOcrImage } from '../../shared/api/client';
import type { OcrQuestion } from '../../shared/api/client';
import type { QuestionType } from '../../shared/api/types';
import { CHOICE_KEYS } from '../../shared/domain/error';
import type { ChoiceKey } from '../../shared/domain/error';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import { WallpaperBackdrop } from '../../shared/theme/Wallpaper';
import {
  GlassButton,
  GlassChip,
  GlassPanel,
  GlassSegmented,
} from '../../shared/ui/Glass';
import type { GlassSegmentOption } from '../../shared/ui/Glass';

const SUBJECT_OPTIONS = ['数学', '物理', '英语', '语文', '化学', '生物'];

const KNOWLEDGE_POINTS: Record<string, readonly string[]> = {
  数学: ['导数与函数', '立体几何', '数列', '概率统计'],
  物理: ['电磁学', '力学', '光学', '热学'],
  英语: ['完形填空', '阅读理解', '语法填空'],
  语文: ['文言文', '阅读理解', '古诗文默写'],
  化学: ['化学方程式', '元素周期表', '有机化学'],
  生物: ['细胞结构', '遗传学', '生态系统'],
};

const TYPE_OPTIONS: readonly GlassSegmentOption<QuestionType>[] = [
  {value: 'fill', label: '填空题'},
  {value: 'choice', label: '选择题'},
];

export default function EntryScreen() {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const insets = useSafeAreaInsets();
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isOcrLoading, setIsOcrLoading] = useState(false);

  /**
   * 一张卷子常有好几道题。识别完先弹列表让人挑，
   * 挑中的按顺序填：当前这道保存后自动换下一道。
   */
  const [pickerItems, setPickerItems] = useState<OcrQuestion[]>([]);
  const [pickedIndexes, setPickedIndexes] = useState<Set<number>>(new Set());
  const [pickerVisible, setPickerVisible] = useState(false);
  const [queue, setQueue] = useState<OcrQuestion[]>([]);

  const updateOption = (key: ChoiceKey, value: string) => {
    setOptions(current => ({...current, [key]: value}));
  };

  const handleSubjectChange = (nextSubject: string) => {
    setSubject(nextSubject);
    if (!KNOWLEDGE_POINTS[nextSubject]?.includes(knowledgePoint)) {
      setKnowledgePoint('');
    }
  };

  /** 把一道识别结果填进表单。选择题会连同选项和正确答案一起填好。 */
  const applyQuestion = (item: OcrQuestion) => {
    setQuestion((item.question_content || '').trim());
    setAnswer((item.answer || '').trim());

    const nextOptions: Record<ChoiceKey, string> = {A: '', B: '', C: '', D: ''};
    for (const key of CHOICE_KEYS) {
      const value = item.options?.[key];
      if (value) {
        nextOptions[key] = value.trim();
      }
    }
    setOptions(nextOptions);

    const hasOptions = CHOICE_KEYS.some(key => nextOptions[key].length > 0);
    const isChoice = Boolean(item.question_type?.includes('选择')) || hasOptions;
    setQuestionType(isChoice ? 'choice' : 'fill');

    const answerLetter = (item.answer || '').trim().toUpperCase();
    const matchedKey = CHOICE_KEYS.find(key => key === answerLetter);
    setCorrectOption(isChoice && matchedKey ? matchedKey : null);

    const matchedSubject = SUBJECT_OPTIONS.find(name =>
      item.subject?.includes(name),
    );
    if (matchedSubject) {
      handleSubjectChange(matchedSubject);
    }
  };

  const togglePick = (index: number) => {
    setPickedIndexes(current => {
      const next = new Set(current);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const confirmPick = () => {
    const chosen = pickerItems.filter((_, index) => pickedIndexes.has(index));
    setPickerVisible(false);
    if (!chosen.length) {
      return;
    }
    applyQuestion(chosen[0]);
    setQueue(chosen.slice(1));
  };

  const handleOCR = () => {
    Alert.alert('拍照识别', '请选择图片来源', [
      {text: '取消', style: 'cancel'},
      {text: '拍照', onPress: () => openImagePicker('camera')},
      {text: '从相册选择', onPress: () => openImagePicker('library')},
    ]);
  };

  const openImagePicker = async (type: 'camera' | 'library') => {
    const optionsForPicker = {
      mediaType: 'photo' as const,
      maxWidth: 1200,
      maxHeight: 1200,
      quality: 0.8 as const,
    };

    try {
      let response: ImagePickerResponse;
      if (type === 'camera') {
        response = await launchCamera(optionsForPicker);
      } else {
        response = await launchImageLibrary(optionsForPicker);
      }

      if (response.didCancel) {
        return;
      }
      if (response.errorCode) {
        Alert.alert('错误', response.errorMessage || '无法获取图片');
        return;
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
      // 优先走后端云端 OCR（百度 OCR + DeepSeek 结构化），
      // 后端不可用时再退回手机本地的 ML Kit，保证离线也能录题。
      const cloud = await parseOcrImage(imageUri);

      // 后端会把整页切成多道题。老后端没有 questions 字段，
      // 这时把顶层那几个字段当成唯一一道，行为跟以前一样。
      const fromCloud: OcrQuestion[] =
        cloud.questions && cloud.questions.length
          ? cloud.questions
          : [
              {
                index: 1,
                subject: cloud.subject || '',
                question_type: cloud.question_type || '',
                question_content: cloud.question_content || cloud.raw_text || '',
                answer: cloud.answer || '',
                parser: cloud.parser,
              },
            ];

      const detected = fromCloud.filter(
        item => (item.question_content || '').trim().length > 0,
      );
      if (!detected.length) {
        throw new Error('没有识别到文字，请换个角度再拍一张。');
      }

      if (detected.length === 1) {
        applyQuestion(detected[0]);
        setQueue([]);
        Alert.alert('识别完成', '题目已填入，请核对科目和知识点后保存。');
        return;
      }

      // 多题：先挑，别直接拿第一道就覆盖掉。
      setPickerItems(detected);
      setPickedIndexes(new Set(detected.map((_, index) => index)));
      setPickerVisible(true);
    } catch {
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
        Alert.alert('识别完成', '已用手机本地识别，请核对内容后保存。');
      } catch (localError) {
        const message =
          localError instanceof Error ? localError.message : '请手动输入题目';
        Alert.alert('识别失败', message);
      }
    } finally {
      setIsOcrLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!subject.trim() || !question.trim()) {
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

      if (queue.length) {
        // 还有没录完的，直接换上下一道，省得重新拍照
        const [nextItem, ...rest] = queue;
        applyQuestion(nextItem);
        setQueue(rest);
        Alert.alert(
          '已保存',
          rest.length
            ? `还有 ${rest.length} 道没录，下一道已经填好了。`
            : '这是最后一道，全部录完了。',
        );
        return;
      }

      Alert.alert('成功', result.message || '错题录入成功！');
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

  const knowledgeOptions = subject ? KNOWLEDGE_POINTS[subject] || [] : [];

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <WallpaperBackdrop />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 20,
            paddingBottom: insets.bottom + 150,
          },
        ]}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <View style={styles.pageHeader}>
          <Text style={styles.kicker}>记录一道 · 自动整理</Text>
          <Text style={styles.title}>录入</Text>
          <Text style={styles.subtitle}>
            拍照识别或手动填写，保存后自动进入练习队列。
          </Text>
        </View>

        <GlassButton
          label={isOcrLoading ? '正在识别...' : '拍照识别题目'}
          tone="dark"
          onPress={handleOCR}
          disabled={isOcrLoading}
          style={styles.ocrButton}
        />

        {queue.length ? (
          <View style={styles.queueNote}>
            <Text style={styles.queueText}>
              还有 {queue.length} 道等着录入
            </Text>
            <Text style={styles.queueHint}>
              保存当前这道后会自动换成下一道
            </Text>
          </View>
        ) : null}

        <GlassPanel
          radius={26}
          style={styles.cardGap}
          contentStyle={styles.cardContent}>
          <Text style={styles.cardTitle}>题目分类</Text>
          <GlassSegmented
            options={TYPE_OPTIONS}
            value={questionType}
            onChange={setQuestionType}
            style={styles.typeSegment}
          />

          <Text style={styles.fieldLabel}>科目 *</Text>
          <View style={styles.chipWrap}>
            {SUBJECT_OPTIONS.map(item => (
              <GlassChip
                key={item}
                label={item}
                active={subject === item}
                onPress={() => handleSubjectChange(item)}
                accessibilityLabel={`选择科目${item}`}
              />
            ))}
          </View>

          <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
            知识点
          </Text>
          {subject ? (
            <View style={styles.chipWrap}>
              {knowledgeOptions.map(item => (
                <GlassChip
                  key={item}
                  label={item}
                  active={knowledgePoint === item}
                  onPress={() =>
                    setKnowledgePoint(current =>
                      current === item ? '' : item,
                    )
                  }
                  accessibilityLabel={`选择知识点${item}`}
                />
              ))}
            </View>
          ) : (
            <Text style={styles.fieldHint}>先选择科目，再选择知识点。</Text>
          )}
        </GlassPanel>


        <GlassPanel
          radius={26}
          style={styles.cardGap}
          contentStyle={styles.cardContent}>
          <Text style={styles.cardTitle}>题目与答案</Text>

          <Text style={styles.fieldLabel}>题目内容 *</Text>
          <TextInput
            style={[styles.input, styles.questionInput]}
            multiline
            textAlignVertical="top"
            placeholder="输入题目内容..."
            placeholderTextColor={colors.placeholder}
            selectionColor={colors.text}
            value={question}
            onChangeText={setQuestion}
          />

          {questionType === 'choice' ? (
            <>
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                选项 *
              </Text>
              {CHOICE_KEYS.map(key => (
                <View style={styles.optionRow} key={key}>
                  <View
                    style={[
                      styles.optionKey,
                      correctOption === key && styles.optionKeyActive,
                    ]}>
                    <Text
                      style={[
                        styles.optionKeyText,
                        correctOption === key && styles.optionKeyTextActive,
                      ]}>
                      {key}
                    </Text>
                  </View>
                  <TextInput
                    style={[styles.input, styles.optionInput]}
                    placeholder={`选项 ${key}`}
                    placeholderTextColor={colors.placeholder}
                    selectionColor={colors.text}
                    value={options[key]}
                    onChangeText={value => updateOption(key, value)}
                  />
                </View>
              ))}

              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                正确答案 *
              </Text>
              <View style={styles.chipWrap}>
                {CHOICE_KEYS.map(key => (
                  <GlassChip
                    key={key}
                    label={key}
                    active={correctOption === key}
                    onPress={() => setCorrectOption(key)}
                    accessibilityLabel={`选择正确答案${key}`}
                  />
                ))}
              </View>
            </>
          ) : (
            <>
              <Text style={[styles.fieldLabel, styles.fieldLabelSpaced]}>
                答案 / 解析
              </Text>
              <TextInput
                style={[styles.input, styles.answerInput]}
                multiline
                textAlignVertical="top"
                placeholder="输入答案或解析..."
                placeholderTextColor={colors.placeholder}
                selectionColor={colors.text}
                value={answer}
                onChangeText={setAnswer}
              />
            </>
          )}
        </GlassPanel>

        <GlassButton
          label={isSubmitting ? '提交中...' : '保存错题'}
          tone="dark"
          onPress={handleSubmit}
          disabled={isSubmitting}
          style={styles.submitButton}
        />

        {isOcrLoading ? (
          <View style={styles.ocrStatus}>
            <ActivityIndicator size="small" color={colors.textMuted} />
            <Text style={styles.ocrStatusText}>正在识别图片中的文字...</Text>
          </View>
        ) : null}
      </ScrollView>

      <Modal
        visible={pickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setPickerVisible(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              识别到 {pickerItems.length} 道题
            </Text>
            <Text style={styles.modalHint}>
              勾选要录入的，保存一道之后会自动填下一道
            </Text>

            <ScrollView
              style={styles.modalList}
              showsVerticalScrollIndicator={false}>
              {pickerItems.map((item, index) => {
                const active = pickedIndexes.has(index);
                return (
                  <Pressable
                    key={`${item.index}-${index}`}
                    onPress={() => togglePick(index)}
                    style={[
                      styles.pickRow,
                      active ? styles.pickRowActive : null,
                    ]}>
                    <View
                      style={[
                        styles.pickBox,
                        active ? styles.pickBoxActive : null,
                      ]}>
                      {active ? <Text style={styles.pickTick}>✓</Text> : null}
                    </View>
                    <View style={styles.pickBody}>
                      <Text style={styles.pickMeta}>
                        第 {item.number ?? index + 1} 题 ·{' '}
                        {item.subject || '未识别科目'} ·{' '}
                        {item.question_type?.includes('选择') ||
                        Object.keys(item.options || {}).length > 0
                          ? '选择题'
                          : '其他'}
                        {item.answer ? ` · 答案 ${item.answer}` : ''}
                      </Text>
                      <Text style={styles.pickPreview} numberOfLines={2}>
                        {(item.question_content || '').trim()}
                      </Text>
                    </View>
                  </Pressable>
                );
              })}
            </ScrollView>

            <View style={styles.modalActions}>
              <Pressable
                onPress={() => setPickerVisible(false)}
                style={styles.modalGhost}>
                <Text style={styles.modalGhostText}>取消</Text>
              </Pressable>
              <Pressable onPress={confirmPick} style={styles.modalPrimary}>
                <Text style={styles.modalPrimaryText}>
                  填入选中（{pickedIndexes.size}）
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  );
}


const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    scroll: {flex: 1, zIndex: 1, backgroundColor: 'transparent'},
    content: {paddingHorizontal: 20},
    pageHeader: {marginBottom: 18},
    kicker: {
      fontSize: 13,
      color: colors.textMuted,
      letterSpacing: 1.1,
      fontWeight: '600',
      marginBottom: 4,
    },
    title: {
      fontSize: 42,
      lineHeight: 50,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 1,
    },
    subtitle: {
      marginTop: 6,
      fontSize: 14,
      lineHeight: 21,
      color: colors.textSecondary,
    },
    ocrButton: {marginBottom: 16},
    cardContent: {padding: 18},
    cardGap: {marginBottom: 16},
    cardTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 12,
    },
    typeSegment: {marginBottom: 18},
    fieldLabel: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.6,
      marginBottom: 8,
    },
    fieldLabelSpaced: {marginTop: 18},
    fieldHint: {
      fontSize: 12,
      lineHeight: 18,
      color: colors.textMuted,
      paddingVertical: 4,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    input: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      fontSize: 15,
      color: colors.text,
    },
    questionInput: {
      minHeight: 110,
      textAlignVertical: 'top',
    },
    answerInput: {
      minHeight: 84,
      textAlignVertical: 'top',
    },
    optionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 9,
    },
    optionKey: {
      width: 36,
      height: 36,
      borderRadius: 11,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionKeyActive: {
      backgroundColor: colors.primaryStrong,
      borderColor: 'rgba(255,255,255,0.32)',
    },
    optionKeyText: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.textSecondary,
    },
    optionKeyTextActive: {color: colors.onPrimary},
    optionInput: {flex: 1},
    submitButton: {marginTop: 18},
    ocrStatus: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 12,
    },
    ocrStatusText: {
      fontSize: 12,
      color: colors.textMuted,
    },
    queueNote: {
      marginTop: 10,
      paddingVertical: 10,
      paddingHorizontal: 14,
      borderRadius: 14,
      backgroundColor: 'rgba(255,255,255,0.08)',
    },
    queueText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.text,
    },
    queueHint: {
      marginTop: 2,
      fontSize: 11,
      color: colors.textMuted,
    },
    modalBackdrop: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.62)',
      justifyContent: 'center',
      paddingHorizontal: 20,
    },
    modalCard: {
      borderRadius: 26,
      padding: 20,
      backgroundColor: colors.surface,
      maxHeight: '82%',
    },
    modalTitle: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
    },
    modalHint: {
      marginTop: 6,
      fontSize: 12,
      color: colors.textMuted,
    },
    modalList: {
      marginTop: 14,
    },
    pickRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: 'transparent',
      backgroundColor: 'rgba(255,255,255,0.05)',
      marginBottom: 8,
    },
    pickRowActive: {
      borderColor: colors.primary,
      backgroundColor: 'rgba(255,255,255,0.12)',
    },
    pickBox: {
      width: 22,
      height: 22,
      borderRadius: 7,
      borderWidth: 1.5,
      borderColor: colors.textMuted,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    pickBoxActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primary,
    },
    pickTick: {
      fontSize: 13,
      fontWeight: '900',
      color: colors.background,
    },
    pickBody: {
      flex: 1,
    },
    pickMeta: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textMuted,
    },
    pickPreview: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 19,
      color: colors.text,
    },
    modalActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      alignItems: 'center',
      gap: 10,
      marginTop: 16,
    },
    modalGhost: {
      paddingVertical: 12,
      paddingHorizontal: 18,
      borderRadius: 14,
    },
    modalGhostText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textMuted,
    },
    modalPrimary: {
      paddingVertical: 12,
      paddingHorizontal: 20,
      borderRadius: 14,
      backgroundColor: colors.primary,
    },
    modalPrimaryText: {
      fontSize: 14,
      fontWeight: '800',
      color: colors.background,
    },
  });
