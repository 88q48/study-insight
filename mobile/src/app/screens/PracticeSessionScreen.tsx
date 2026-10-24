import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  fetchPracticeErrors,
  recordAttempt,
} from '../../shared/api/client';
import type { ErrorItem } from '../../shared/api/types';
import {
  CHOICE_KEYS,
  answerOf,
  isChoiceQuestion,
  optionOf,
  questionOf,
} from '../../shared/domain/error';
import { playFeedbackSound } from '../../shared/feedback/sound';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import MathText from '../../shared/ui/MathText';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeSession'>;
type Feedback = 'correct' | 'wrong' | null;

export default function PracticeSessionScreen({route, navigation}: Props) {
  const {subject, limit} = route.params;
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  const [questions, setQuestions] = useState<ErrorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);
  const allowExitRef = useRef(false);
  const flash = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchPracticeErrors(subject, limit)
      .then(result => {
        if (active) {
          setQuestions(result.items);
          setCurrentIndex(0);
        }
      })
      .catch(err => {
        if (active) {
          setError(err instanceof Error ? err.message : '无法获取练习题目');
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [limit, subject]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('beforeRemove', event => {
      if (allowExitRef.current || loading || questions.length === 0) {
        return;
      }
      event.preventDefault();
      Alert.alert('退出专注练习？', '本轮进度将不会保留。', [
        {text: '继续练习', style: 'cancel'},
        {
          text: '退出',
          style: 'destructive',
          onPress: () => {
            allowExitRef.current = true;
            navigation.dispatch(event.data.action);
          },
        },
      ]);
    });
    return unsubscribe;
  }, [loading, navigation, questions.length]);

  const runFeedback = useCallback(
    (kind: Exclude<Feedback, null>) => {
      setFeedback(kind);
      playFeedbackSound(kind === 'correct' ? 'success' : 'error');
      flash.stopAnimation();
      flash.setValue(0);
      Animated.sequence([
        Animated.timing(flash, {
          toValue: 1,
          duration: 120,
          useNativeDriver: true,
        }),
        Animated.delay(560),
        Animated.timing(flash, {
          toValue: 0,
          duration: 520,
          useNativeDriver: true,
        }),
      ]).start(({finished}) => {
        if (finished) {
          setFeedback(null);
        }
      });
    },
    [flash],
  );

  const currentQ = questions[currentIndex];
  const correctAnswer = currentQ ? answerOf(currentQ) : '';
  const hasAnswer = correctAnswer.trim().length > 0;
  const isChoice = currentQ ? isChoiceQuestion(currentQ) : false;

  const handleCheck = async () => {
    if (!currentQ) {
      return;
    }
    const normalize = (value: string) => value.trim().toLowerCase();
    const localCorrect =
      hasAnswer && normalize(userAnswer) === normalize(correctAnswer);

    setIsCorrect(localCorrect);
    setShowResult(true);
    if (hasAnswer) {
      runFeedback(localCorrect ? 'correct' : 'wrong');
    }

    try {
      const result = await recordAttempt(currentQ.error_id, userAnswer);
      setIsCorrect(result.correct);
      setQuestions(current =>
        current.map(item =>
          item.error_id === result.error.error_id ? result.error : item,
        ),
      );
      if (hasAnswer && result.correct !== localCorrect) {
        runFeedback(result.correct ? 'correct' : 'wrong');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '请检查网络';
      Alert.alert('统计失败', `本次做题未记录：${message}`);
    }
  };

  const resetFeedback = () => {
    flash.stopAnimation();
    flash.setValue(0);
    setFeedback(null);
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      resetFeedback();
      setCurrentIndex(currentIndex + 1);
      setUserAnswer('');
      setShowResult(false);
      return;
    }

    allowExitRef.current = true;
    Alert.alert('本轮完成', '本轮练习已完成，可以返回练习设置。', [
      {text: '返回', onPress: () => navigation.goBack()},
    ]);
  };

  const feedbackColor =
    feedback === 'correct'
      ? colors.success
      : feedback === 'wrong'
        ? colors.danger
        : 'transparent';

  const renderHeader = () => (
    <View style={[styles.topBar, {paddingTop: insets.top + 8}]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="退出专注练习"
        onPress={() => navigation.goBack()}
        style={styles.backBtn}
      >
        <Text style={styles.backIcon}>‹</Text>
      </TouchableOpacity>
      <View style={styles.titleWrap}>
        <Text style={styles.title}>专注练习</Text>
        <Text style={styles.subtitle}>{subject || '全部科目'} · 错题优先</Text>
      </View>
      {!loading && questions.length > 0 && (
        <View style={styles.counterPill}>
          <Text style={styles.counterText}>
            {currentIndex + 1}/{questions.length}
          </Text>
        </View>
      )}
    </View>
  );

  return (
    <View style={styles.container}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {renderHeader()}

        {loading ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>正在准备本次练习...</Text>
          </View>
        ) : error ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>练习加载失败</Text>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.secondaryBtnText}>返回练习设置</Text>
            </TouchableOpacity>
          </View>
        ) : questions.length === 0 ? (
          <View style={styles.center}>
            <Text style={styles.emptyText}>这个科目暂时没有可练习的错题</Text>
            <TouchableOpacity
              style={styles.secondaryBtn}
              onPress={() => navigation.goBack()}
            >
              <Text style={styles.secondaryBtnText}>返回练习设置</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[
              styles.content,
              {paddingBottom: insets.bottom + 24},
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.focusBanner}>
              <Text style={styles.focusBannerIcon}>◉</Text>
              <Text style={styles.focusBannerText}>
                专注模式已开启，答题期间无法查看错题列表
              </Text>
            </View>

            <View style={styles.statsRow}>
              <Text style={styles.statsText}>
                做 {currentQ.attempt_count ?? 0} 次 · 正确率{' '}
                {currentQ.accuracy ?? 0}%
              </Text>
              <Text style={styles.statsText}>
                错 {currentQ.wrong_count ?? 0} 次
              </Text>
            </View>

            <View style={styles.questionBox}>
              <View style={styles.questionHeader}>
                <Text style={styles.questionLabel}>题目</Text>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>
                    {currentQ.subject || '未分类'}
                  </Text>
                </View>
              </View>
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

            <View style={styles.answerBox}>
              <Text style={styles.answerTitle}>你的答案</Text>
              {isChoice ? (
                <View style={styles.choiceRow}>
                  {CHOICE_KEYS.map(key => {
                    const selected = userAnswer === key;
                    const rightOption =
                      showResult && correctAnswer.toUpperCase() === key;
                    const wrongOption =
                      showResult && hasAnswer && selected && !isCorrect;
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
                    showResult &&
                      hasAnswer &&
                      (isCorrect ? styles.inputCorrect : styles.inputWrong),
                  ]}
                  placeholder="在此输入你的答案..."
                  placeholderTextColor={colors.placeholder}
                  value={userAnswer}
                  onChangeText={setUserAnswer}
                  editable={!showResult}
                />
              )}

              {!showResult ? (
                <TouchableOpacity style={styles.primaryBtn} onPress={handleCheck}>
                  <Text style={styles.btnText}>提交答案</Text>
                </TouchableOpacity>
              ) : (
                <View style={styles.resultBox}>
                  <Text
                    style={[
                      styles.resultText,
                      {
                        color: hasAnswer
                          ? isCorrect
                            ? colors.success
                            : colors.danger
                          : colors.textMuted,
                      },
                    ]}
                  >
                    {hasAnswer
                      ? isCorrect
                        ? '✓ 回答正确'
                        : '× 回答错误'
                      : '暂无标准答案，请对照题目自评'}
                  </Text>
                  {!isCorrect && hasAnswer && (
                    <MathText style={styles.correctAnswerText}>
                      正确答案：{correctAnswer}
                    </MathText>
                  )}
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleNext}
                  >
                    <Text style={styles.btnText}>
                      {currentIndex < questions.length - 1
                        ? '下一题'
                        : '完成本轮'}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </ScrollView>
        )}
      </KeyboardAvoidingView>

      <Animated.View
        pointerEvents="none"
        style={[
          styles.feedbackEdge,
          {
            borderColor: feedbackColor,
            backgroundColor: feedback ? `${feedbackColor}12` : 'transparent',
            opacity: flash,
          },
        ]}
      />
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    keyboardView: {flex: 1},
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 18,
      paddingBottom: 14,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surfaceMuted,
    },
    backIcon: {
      fontSize: 30,
      lineHeight: 32,
      color: colors.text,
      marginTop: -3,
    },
    titleWrap: {flex: 1, marginLeft: 12},
    title: {fontSize: 20, fontWeight: '800', color: colors.text},
    subtitle: {fontSize: 12.5, color: colors.textMuted, marginTop: 2},
    counterPill: {
      backgroundColor: colors.primarySoft,
      borderRadius: 13,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    counterText: {
      color: colors.primary,
      fontSize: 12.5,
      fontWeight: '700',
    },
    scroll: {flex: 1},
    content: {padding: 16},
    center: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 28,
    },
    loadingText: {marginTop: 10, color: colors.textSecondary},
    emptyText: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    errorText: {
      fontSize: 13,
      color: colors.danger,
      textAlign: 'center',
      marginTop: 8,
    },
    secondaryBtn: {
      marginTop: 20,
      paddingHorizontal: 18,
      paddingVertical: 11,
      borderRadius: 10,
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.border,
    },
    secondaryBtnText: {color: colors.text, fontWeight: '600'},
    focusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    focusBannerIcon: {fontSize: 14, color: colors.primary},
    focusBannerText: {
      flex: 1,
      fontSize: 12.5,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 14,
      backgroundColor: colors.surface,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    statsText: {fontSize: 12.5, color: colors.textMuted},
    questionBox: {
      backgroundColor: colors.surface,
      padding: 18,
      borderRadius: 16,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.border,
      borderLeftWidth: 4,
      borderLeftColor: colors.primary,
      shadowColor: colors.shadow,
      shadowOpacity: 0.06,
      shadowRadius: 12,
      shadowOffset: {width: 0, height: 4},
      elevation: 2,
    },
    questionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    questionLabel: {
      fontSize: 12,
      color: colors.textMuted,
      letterSpacing: 0.4,
    },
    tag: {
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    tagText: {color: colors.primary, fontSize: 12, fontWeight: '700'},
    questionText: {
      fontSize: 21,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 33,
    },
    optionList: {marginTop: 16, gap: 10},
    optionText: {fontSize: 16, color: colors.textSecondary, lineHeight: 26},
    answerBox: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 10,
      shadowOffset: {width: 0, height: 4},
      elevation: 2,
    },
    answerTitle: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    choiceRow: {flexDirection: 'row', gap: 10, marginBottom: 15},
    choiceBtn: {
      flex: 1,
      paddingVertical: 15,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surfaceMuted,
      alignItems: 'center',
    },
    choiceBtnActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    choiceBtnCorrect: {
      borderColor: colors.success,
      backgroundColor: colors.successSoft,
    },
    choiceBtnWrong: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    choiceText: {
      textAlign: 'center',
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    input: {
      backgroundColor: colors.surfaceMuted,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      borderRadius: 10,
      padding: 15,
      fontSize: 16,
      color: colors.text,
      marginBottom: 15,
    },
    inputCorrect: {
      borderColor: colors.success,
      backgroundColor: colors.successSoft,
    },
    inputWrong: {
      borderColor: colors.danger,
      backgroundColor: colors.dangerSoft,
    },
    primaryBtn: {
      backgroundColor: colors.primaryStrong,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      shadowColor: colors.primary,
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 3},
      elevation: 2,
    },
    btnText: {color: colors.onPrimary, fontSize: 16, fontWeight: '700'},
    resultBox: {alignItems: 'center'},
    resultText: {fontSize: 20, fontWeight: '800', marginBottom: 10},
    correctAnswerText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 20,
      textAlign: 'center',
    },
    feedbackEdge: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      borderWidth: 7,
    },
  });




