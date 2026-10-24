import React, {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import {
  fetchPracticeErrors,
  markMastered,
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
import { WallpaperBackdrop } from '../../shared/theme/Wallpaper';
import MathText from '../../shared/ui/MathText';
import type { RootStackParamList } from '../navigation/types';

type Props = NativeStackScreenProps<RootStackParamList, 'PracticeSession'>;

function dedupeQuestions(items: ErrorItem[]): ErrorItem[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const normalized = (questionOf(item) || '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    const key = normalized || `id:${item.error_id}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

type ActionVariant = 'ready' | 'correct' | 'neutral' | 'disabled';

/**
 * 非线性缓动：
 * - 按压用先快后慢的曲线，手指按下时响应明确，回弹不突兀；
 * - 换题左滑先加速，再让下一题用强减速曲线落位。
 */
const PRESS_EASING = Easing.bezier(0.22, 0.61, 0.36, 1);
const SLIDE_OUT_EASING = Easing.bezier(0.55, 0, 0.85, 0.4);
const SLIDE_IN_EASING = Easing.bezier(0.16, 1, 0.3, 1);

const PRESS_IN_DURATION = 120;
const SLIDE_OUT_DURATION = 320;
const SLIDE_IN_DURATION = 460;

function AnimatedContinueButton({
  label,
  onPress,
  disabled = false,
  variant,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  variant: ActionVariant;
}) {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const scaleX = useRef(new Animated.Value(1)).current;
  const scaleY = useRef(new Animated.Value(1)).current;
  const translateY = useRef(new Animated.Value(0)).current;

  const playBounce = () => {
    Animated.parallel([
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -4,
          duration: PRESS_IN_DURATION,
          easing: PRESS_EASING,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          speed: 12,
          bounciness: 5,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(scaleX, {
          toValue: 1.06,
          duration: PRESS_IN_DURATION,
          easing: PRESS_EASING,
          useNativeDriver: true,
        }),
        Animated.spring(scaleX, {
          toValue: 1,
          speed: 12,
          bounciness: 5,
          useNativeDriver: true,
        }),
      ]),
      Animated.sequence([
        Animated.timing(scaleY, {
          toValue: 0.9,
          duration: PRESS_IN_DURATION,
          easing: PRESS_EASING,
          useNativeDriver: true,
        }),
        Animated.spring(scaleY, {
          toValue: 1,
          speed: 12,
          bounciness: 5,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  const variantStyle =
    variant === 'correct'
      ? styles.continueBtnCorrect
      : variant === 'ready'
        ? styles.continueBtnReady
        : variant === 'disabled'
          ? styles.continueBtnDisabled
          : styles.continueBtnNeutral;

  return (
    <Animated.View
      style={{
        transform: [{translateY}, {scaleX}, {scaleY}],
      }}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityState={{disabled}}
        activeOpacity={0.82}
        disabled={disabled}
        onPress={() => {
          if (disabled) {
            return;
          }
          playBounce();
          onPress();
        }}
        style={[styles.continueBtn, variantStyle]}>
        <View pointerEvents="none" style={styles.buttonShine} />
        <Text
          style={[
            styles.continueText,
            variant === 'disabled' && styles.continueTextDisabled,
          ]}>
          {label}
        </Text>
      </TouchableOpacity>
    </Animated.View>
  );
}

export default function PracticeSessionScreen({route, navigation}: Props) {
  const {subject, limit} = route.params;
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const {width: screenWidth} = useWindowDimensions();
  const slideX = useRef(new Animated.Value(0)).current;
  const transitionRef = useRef(false);

  const [questions, setQuestions] = useState<ErrorItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [userAnswer, setUserAnswer] = useState('');
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [isMarkingMastered, setIsMarkingMastered] = useState(false);
  const allowExitRef = useRef(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    fetchPracticeErrors(subject, Math.min(limit + 20, 200))
      .then(result => {
        if (active) {
          // 后端已按题干去重；客户端再兜底一次，避免旧接口缓存导致同题重复。
          setQuestions(dedupeQuestions(result.items).slice(0, limit));
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

  const currentQ = questions[currentIndex];
  const correctAnswer = currentQ ? answerOf(currentQ) : '';
  const hasAnswer = correctAnswer.trim().length > 0;
  const isChoice = currentQ ? isChoiceQuestion(currentQ) : false;
  const canSubmit = userAnswer.trim().length > 0;

  const handleCheck = async () => {
    if (!currentQ || !userAnswer.trim()) {
      return;
    }
    const normalize = (value: string) => value.trim().toLowerCase();
    const localCorrect =
      hasAnswer && normalize(userAnswer) === normalize(correctAnswer);

    setIsCorrect(localCorrect);
    setShowResult(true);
    Keyboard.dismiss();
    if (hasAnswer) {
      playFeedbackSound(localCorrect ? 'success' : 'error');
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
        playFeedbackSound(result.correct ? 'success' : 'error');
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : '请检查网络';
      Alert.alert('统计失败', `本次做题未记录：${message}`);
    }
  };

  const handleMarkMastered = async () => {
    if (!currentQ || currentQ.mastered || isMarkingMastered) {
      return;
    }
    setIsMarkingMastered(true);
    try {
      const result = await markMastered(
        currentQ.error_id,
        (currentQ.review_count ?? 0) + 1,
      );
      setQuestions(current =>
        current.map(item =>
          item.error_id === result.error.error_id ? result.error : item,
        ),
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : '请检查网络';
      Alert.alert('标记失败', message);
    } finally {
      setIsMarkingMastered(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      if (transitionRef.current) {
        return;
      }
      transitionRef.current = true;
      Animated.timing(slideX, {
        toValue: -screenWidth,
        duration: SLIDE_OUT_DURATION,
        easing: SLIDE_OUT_EASING,
        useNativeDriver: true,
      }).start(({finished}) => {
        if (!finished) {
          transitionRef.current = false;
          return;
        }
        setCurrentIndex(currentIndex + 1);
        setUserAnswer('');
        setShowResult(false);
        slideX.setValue(screenWidth);
        Animated.timing(slideX, {
          toValue: 0,
          duration: SLIDE_IN_DURATION,
          easing: SLIDE_IN_EASING,
          useNativeDriver: true,
        }).start(() => {
          transitionRef.current = false;
        });
      });
      return;
    }

    allowExitRef.current = true;
    Alert.alert('本轮完成', '本轮练习已完成，可以返回练习设置。', [
      {text: '返回', onPress: () => navigation.goBack()},
    ]);
  };

  const progress =
    questions.length > 0
      ? Math.min(100, ((currentIndex + (showResult ? 1 : 0)) / questions.length) * 100)
      : 0;

  const renderHeader = () => (
    <View style={[styles.topBar, {paddingTop: insets.top + 8}]}>
      <TouchableOpacity
        accessibilityRole="button"
        accessibilityLabel="退出专注练习"
        onPress={() => navigation.goBack()}
        style={styles.closeBtn}
      >
        <View pointerEvents="none" style={styles.buttonShine} />
        <Text style={styles.closeIcon}>✕</Text>
      </TouchableOpacity>
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, {width: `${progress}%`}]} />
      </View>
      {!loading && questions.length > 0 ? (
        <Text style={styles.progressLabel}>
          {currentIndex + 1}/{questions.length}
        </Text>
      ) : null}
    </View>
  );

  return (
    <View style={styles.container}>
      <WallpaperBackdrop />
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
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
          <>
          <Animated.View
            style={[
              styles.transitionArea,
              {transform: [{translateX: slideX}]},
            ]}>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={[styles.content, {paddingBottom: 24}]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.questionArea}>
              <Text style={styles.questionMeta}>
                {currentQ.subject || subject || '综合练习'}
              </Text>
              <MathText style={styles.questionText}>
                {questionOf(currentQ) || '（未填写题目）'}
              </MathText>
            </View>

            <View style={styles.optionsArea}>
              {isChoice ? (
                CHOICE_KEYS.map(key => {
                  const selected = userAnswer === key;
                  const rightOption =
                    showResult &&
                    correctAnswer.trim().toUpperCase() === key;
                  const wrongOption =
                    showResult && hasAnswer && selected && !isCorrect;
                  return (
                    <TouchableOpacity
                      key={key}
                      accessibilityRole="button"
                      accessibilityState={{selected}}
                      accessibilityLabel={`选择答案${key}`}
                      activeOpacity={0.85}
                      onPress={() => setUserAnswer(key)}
                      disabled={showResult}
                      style={[
                        styles.optionCard,
                        selected && styles.optionCardSelected,
                        rightOption && styles.optionCardCorrect,
                        wrongOption && styles.optionCardWrong,
                      ]}>
                      <View
                        pointerEvents="none"
                        style={styles.buttonShine}
                      />
                      <Text
                        style={[
                          styles.optionCardText,
                          selected && styles.optionCardTextSelected,
                          rightOption && styles.optionCardTextCorrect,
                          wrongOption && styles.optionCardTextWrong,
                        ]}>
                        {optionOf(currentQ, key) || `选项 ${key}`}
                      </Text>
                      {selected || rightOption ? (
                        <Text
                          style={[
                            styles.optionCheck,
                            rightOption && styles.optionCheckCorrect,
                            wrongOption && styles.optionCheckWrong,
                          ]}>
                          ✓
                        </Text>
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              ) : (
                <View style={styles.fillArea}>
                  <Text style={styles.fillLabel}>你的答案</Text>
                  <TextInput
                    style={[
                      styles.fillInput,
                      showResult &&
                        hasAnswer &&
                        (isCorrect ? styles.inputCorrect : styles.inputWrong),
                    ]}
                    multiline
                    textAlignVertical="top"
                    placeholder="输入你的答案..."
                    placeholderTextColor={colors.placeholder}
                    value={userAnswer}
                    onChangeText={setUserAnswer}
                    editable={!showResult}
                  />
                </View>
              )}
            </View>
          </ScrollView>

            {showResult ? (
              <View
                style={[
                  styles.resultPanel,
                  {paddingBottom: insets.bottom + 12},
                ]}>
                <View style={styles.resultHeader}>
                  <View
                    style={[
                      styles.resultBadge,
                      {
                        backgroundColor:
                          hasAnswer && isCorrect
                            ? colors.success
                            : hasAnswer
                              ? colors.danger
                              : colors.textMuted,
                      },
                    ]}>
                    <Text style={styles.resultBadgeText}>
                      {hasAnswer && isCorrect ? '✓' : hasAnswer ? '×' : '·'}
                    </Text>
                  </View>
                  <View style={styles.resultHeaderCopy}>
                    <Text
                      style={[
                        styles.resultTitle,
                        {
                          color: hasAnswer
                            ? isCorrect
                              ? colors.success
                              : colors.danger
                            : colors.textMuted,
                        },
                      ]}>
                      {hasAnswer
                        ? isCorrect
                          ? '太棒了！'
                          : '再想想'
                        : '看看解析'}
                    </Text>
                    <Text style={styles.userAnswerText}>
                      你的答案：{userAnswer.trim() || '未作答'}
                    </Text>
                  </View>
                  {isCorrect && hasAnswer ? (
                    currentQ.mastered ? (
                      <Text
                        style={[
                          styles.masteredText,
                          styles.headerMasteredText,
                        ]}>
                        ✓ 已掌握
                      </Text>
                    ) : (
                      <TouchableOpacity
                        style={[
                          styles.masteryButton,
                          styles.headerMasteryButton,
                          isMarkingMastered && styles.btnDisabled,
                        ]}
                        onPress={handleMarkMastered}
                        disabled={isMarkingMastered}>
                        <View
                          pointerEvents="none"
                          style={styles.buttonShine}
                        />
                        <Text style={styles.masteryButtonText}>
                          {isMarkingMastered ? '标记中...' : '标记已掌握'}
                        </Text>
                      </TouchableOpacity>
                    )
                  ) : null}
                </View>
                {!isCorrect && hasAnswer ? (
                  <Text style={styles.correctAnswerText}>
                    正确答案：{correctAnswer}
                  </Text>
                ) : null}
                <AnimatedContinueButton
                  label={
                    currentIndex < questions.length - 1
                      ? '继续'
                      : '完成本轮'
                  }
                  onPress={handleNext}
                  variant={hasAnswer && isCorrect ? 'correct' : 'neutral'}
                />
              </View>
            ) : (
              <View
                style={[
                  styles.bottomBar,
                  {paddingBottom: insets.bottom + 10},
                ]}>
                <AnimatedContinueButton
                  label="继续"
                  onPress={handleCheck}
                  disabled={!canSubmit}
                  variant={canSubmit ? 'ready' : 'disabled'}
                />
              </View>
            )}
          </Animated.View>
          </>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    keyboardView: {flex: 1, zIndex: 1, backgroundColor: 'transparent'},
    topBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    closeBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      overflow: 'hidden',
    },
    closeIcon: {
      fontSize: 30,
      lineHeight: 34,
      fontWeight: '300',
      color: colors.textMuted,
    },
    progressTrack: {
      flex: 1,
      height: 14,
      borderRadius: 7,
      overflow: 'hidden',
      backgroundColor: colors.surfaceMuted,
    },
    progressFill: {
      height: '100%',
      borderRadius: 7,
      backgroundColor: colors.success,
    },
    progressLabel: {
      width: 38,
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      textAlign: 'right',
    },
    titleWrap: {flex: 1, marginLeft: 12},
    title: {fontSize: 20, fontWeight: '800', color: colors.text},
    subtitle: {fontSize: 12.5, color: colors.textMuted, marginTop: 2},
    counterPill: {
      backgroundColor: colors.glass,
      borderRadius: 13,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    counterText: {
      color: colors.textSecondary,
      fontSize: 12.5,
      fontWeight: '700',
    },
    scroll: {flex: 1},
    transitionArea: {flex: 1},
    content: {paddingHorizontal: 20, paddingTop: 18, flexGrow: 1},
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
      borderRadius: 14,
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    secondaryBtnText: {color: colors.text, fontWeight: '600'},
    focusBanner: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      backgroundColor: colors.glass,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginBottom: 14,
    },
    focusBannerIcon: {fontSize: 14, color: colors.textSecondary},
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
      backgroundColor: colors.glass,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      paddingHorizontal: 12,
      paddingVertical: 9,
    },
    statsText: {fontSize: 12.5, color: colors.textMuted},
    questionBox: {
      backgroundColor: colors.surface,
      padding: 18,
      borderRadius: 22,
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      borderLeftWidth: 4,
      borderLeftColor: colors.textMuted,
      shadowColor: colors.shadow,
      shadowOpacity: 0.1,
      shadowRadius: 18,
      shadowOffset: {width: 0, height: 8},
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
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 12,
    },
    tagText: {color: colors.textSecondary, fontSize: 12, fontWeight: '700'},
    questionArea: {
      paddingHorizontal: 4,
      paddingTop: 8,
      marginBottom: 26,
    },
    questionMeta: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.textMuted,
      letterSpacing: 0.8,
      marginBottom: 10,
    },
    questionText: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.text,
      lineHeight: 42,
    },
    optionsArea: {gap: 12},
    optionCard: {
      minHeight: 64,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glass,
      paddingHorizontal: 18,
      paddingVertical: 16,
      overflow: 'hidden',
    },
    optionCardSelected: {
      borderColor: colors.text,
      borderWidth: 2,
      backgroundColor: colors.glassStrong,
    },
    optionCardCorrect: {
      borderColor: colors.success,
      borderWidth: 2,
      backgroundColor: colors.successSoft,
    },
    optionCardWrong: {
      borderColor: colors.danger,
      borderWidth: 2,
      backgroundColor: colors.dangerSoft,
    },
    optionCardText: {
      flex: 1,
      fontSize: 17,
      lineHeight: 25,
      color: colors.text,
    },
    optionCardTextSelected: {fontWeight: '700'},
    optionCardTextCorrect: {color: colors.success, fontWeight: '700'},
    optionCardTextWrong: {color: colors.danger, fontWeight: '700'},
    optionCheck: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.text,
    },
    optionCheckCorrect: {color: colors.success},
    optionCheckWrong: {color: colors.danger},
    fillArea: {gap: 10},
    fillLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
    },
    fillInput: {
      minHeight: 100,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 16,
      paddingVertical: 14,
      fontSize: 17,
      lineHeight: 25,
      color: colors.text,
    },
    optionList: {marginTop: 16, gap: 10},
    optionText: {fontSize: 16, color: colors.textSecondary, lineHeight: 26},
    answerBox: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 22,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      shadowColor: colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 16,
      shadowOffset: {width: 0, height: 7},
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
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glass,
      alignItems: 'center',
    },
    choiceBtnActive: {
      borderColor: colors.text,
      borderWidth: 2,
      backgroundColor: colors.glassStrong,
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
    choiceTextActive: {fontWeight: '800'},
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
      borderRadius: 18,
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.3)',
      alignItems: 'center',
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: {width: 0, height: 7},
      elevation: 3,
    },
    btnText: {color: colors.onPrimary, fontSize: 16, fontWeight: '700'},
    resultBox: {alignItems: 'center'},
    resultText: {fontSize: 20, fontWeight: '800', marginBottom: 10},
    userAnswerText: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 10,
    },
    masteredText: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.success,
      marginBottom: 16,
    },
    masteryBtn: {
      marginTop: 0,
      marginBottom: 12,
      backgroundColor: colors.successSoft,
      borderColor: colors.success,
    },
    btnDisabled: {opacity: 0.5},
    bottomBar: {
      paddingHorizontal: 20,
      paddingTop: 12,
      backgroundColor: 'rgba(10,12,14,0.92)',
    },
    continueBtn: {
      minHeight: 56,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
      borderWidth: 1,
      overflow: 'hidden',
      shadowColor: colors.shadow,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: {width: 0, height: 5},
    },
    buttonShine: {
      position: 'absolute',
      top: 0,
      left: 12,
      right: 12,
      height: 1.5,
      borderRadius: 1,
      backgroundColor: 'rgba(255,255,255,0.48)',
    },
    continueBtnReady: {
      backgroundColor: 'rgba(235,238,242,0.86)',
      borderColor: 'rgba(255,255,255,0.62)',
    },
    continueBtnCorrect: {
      backgroundColor: 'rgba(142,216,71,0.82)',
      borderColor: 'rgba(196,255,132,0.9)',
    },
    continueBtnNeutral: {
      backgroundColor: 'rgba(235,238,242,0.86)',
      borderColor: 'rgba(255,255,255,0.62)',
    },
    continueBtnDisabled: {
      backgroundColor: 'rgba(255,255,255,0.06)',
      borderColor: colors.glassBorder,
    },
    continueText: {
      fontSize: 17,
      fontWeight: '800',
      color: colors.onPrimary,
    },
    continueTextDisabled: {
      color: colors.textMuted,
    },
    resultPanel: {
      paddingHorizontal: 20,
      paddingTop: 16,
      backgroundColor: colors.surfaceAlt,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 12,
    },
    resultHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    resultBadge: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    resultBadgeText: {
      fontSize: 22,
      fontWeight: '900',
      color: colors.background,
    },
    resultHeaderCopy: {flex: 1},
    resultTitle: {
      fontSize: 24,
      fontWeight: '900',
      lineHeight: 30,
    },
    masteryButton: {
      alignSelf: 'flex-start',
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glass,
      overflow: 'hidden',
    },
    headerMasteryButton: {
      alignSelf: 'center',
      marginLeft: 'auto',
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    headerMasteredText: {
      marginBottom: 0,
      marginLeft: 'auto',
      fontSize: 12,
    },
    masteryButtonText: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.success,
    },
    correctAnswerText: {
      fontSize: 16,
      color: colors.textSecondary,
      marginBottom: 20,
      textAlign: 'center',
    },
  });
