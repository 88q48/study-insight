import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { fetchSubjects } from '../../shared/api/client';
import type { SubjectOption } from '../../shared/api/types';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import type { RootStackParamList } from '../../app/navigation/types';

export default function StudyScreen() {
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [subjects, setSubjects] = useState<SubjectOption[]>([]);
  const [selectedSubject, setSelectedSubject] = useState('全部');
  const [questionLimit, setQuestionLimit] = useState(10);
  const [setupLoading, setSetupLoading] = useState(true);

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

  const handleStart = () => {
    navigation.navigate('PracticeSession', {
      subject: selectedSubject === '全部' ? undefined : selectedSubject,
      limit: questionLimit,
    });
  };

  return (
    <View style={styles.setupContainer}>
      <Text style={styles.setupTitle}>开始练习</Text>
      <Text style={styles.setupHint}>选择题量和科目，优先安排错得多的题。</Text>

      {setupLoading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.setupLoading}
        />
      ) : (
        <>
          <View style={styles.setupCard}>
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

            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
              做题数
            </Text>
            <View style={styles.countRow}>
              {[5, 10, 20, 50].map(count => (
                <TouchableOpacity
                  key={count}
                  style={[
                    styles.countCard,
                    questionLimit === count && styles.countCardActive,
                  ]}
                  onPress={() => setQuestionLimit(count)}
                >
                  <Text
                    style={[
                      styles.countNumber,
                      questionLimit === count && styles.countTextActive,
                    ]}
                  >
                    {count}
                  </Text>
                  <Text
                    style={[
                      styles.countUnit,
                      questionLimit === count && styles.countTextActive,
                    ]}
                  >
                    题
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text style={styles.infoCheck}>✓</Text>
              </View>
              <Text style={styles.infoText}>
                已开启「错题优先」，薄弱题目会先出现
              </Text>
            </View>
          </View>

          <View style={styles.setupSpacer} />

          <TouchableOpacity style={styles.startBtn} onPress={handleStart}>
            <Text style={styles.btnText}>
              {`开始练习 · ${questionLimit} 题  →`}
            </Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    setupContainer: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 20,
      paddingTop: 2,
    },
    setupTitle: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.text,
      marginTop: 4,
    },
    setupHint: {
      fontSize: 15,
      color: colors.textSecondary,
      marginTop: 8,
      marginBottom: 18,
      lineHeight: 23,
    },
    setupLoading: {marginTop: 30},
    sectionLabel: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    sectionLabelSpaced: {marginTop: 22},
    chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
    setupCard: {
      backgroundColor: colors.surface,
      borderRadius: 24,
      padding: 18,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOpacity: 0.05,
      shadowRadius: 18,
      shadowOffset: {width: 0, height: 8},
      elevation: 3,
    },
    countRow: {flexDirection: 'row', gap: 10},
    countCard: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
      alignItems: 'center',
    },
    countCardActive: {
      backgroundColor: colors.primaryStrong,
      borderColor: colors.primary,
    },
    countNumber: {fontSize: 22, fontWeight: '700', color: colors.text},
    countUnit: {fontSize: 12, color: colors.textSecondary, marginTop: 1},
    countTextActive: {color: colors.onPrimary},
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: colors.primarySoft,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 18,
    },
    infoIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoCheck: {fontSize: 11, fontWeight: '800', color: colors.primary},
    infoText: {
      flex: 1,
      fontSize: 12.5,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    setupSpacer: {flex: 1, minHeight: 18},
    chip: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.surface,
    },
    chipActive: {
      backgroundColor: colors.primaryStrong,
      borderColor: colors.primary,
    },
    chipText: {fontSize: 14, color: colors.textSecondary, fontWeight: '600'},
    chipTextActive: {color: colors.onPrimary},
    startBtn: {
      marginTop: 24,
      marginBottom: 12,
      backgroundColor: colors.primaryStrong,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      elevation: 3,
      shadowColor: colors.primary,
      shadowOpacity: 0.25,
      shadowRadius: 10,
      shadowOffset: {width: 0, height: 4},
    },
    btnText: {color: colors.onPrimary, fontSize: 16, fontWeight: '700'},
  });
