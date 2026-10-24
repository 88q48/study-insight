import React, { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { fetchSubjects } from '../../shared/api/client';
import type { SubjectOption } from '../../shared/api/types';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import {
  GlassButton,
  GlassChip,
  GlassPanel,
} from '../../shared/ui/Glass';
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
      <View style={styles.headingRow}>
        <View style={styles.headingCopy}>
          <Text style={styles.setupTitle}>开始练习</Text>
          <Text style={styles.setupHint}>
            选择题量和科目，优先安排错得多的题。
          </Text>
        </View>
        <View style={styles.stepBadge}>
          <Text style={styles.stepNumber}>01</Text>
        </View>
      </View>

      {setupLoading ? (
        <ActivityIndicator
          size="large"
          color={colors.primary}
          style={styles.setupLoading}
        />
      ) : (
        <>
          <GlassPanel radius={28} contentStyle={styles.setupCardContent}>
            <Text style={styles.sectionLabel}>科目</Text>
            <View style={styles.chipRow}>
              {['全部', ...subjects.map(item => item.subject)].map(subject => (
                <GlassChip
                  key={subject}
                  label={subject}
                  active={selectedSubject === subject}
                  onPress={() => setSelectedSubject(subject)}
                  accessibilityLabel={`选择${subject}`}
                />
              ))}
            </View>

            <Text style={[styles.sectionLabel, styles.sectionLabelSpaced]}>
              做题数
            </Text>
            <View style={styles.countRow}>
              {[5, 10, 20, 50].map(count => {
                const active = questionLimit === count;
                return (
                  <Pressable
                    key={count}
                    accessibilityRole="button"
                    accessibilityLabel={`选择 ${count} 题`}
                    accessibilityState={{selected: active}}
                    onPress={() => setQuestionLimit(count)}
                    style={({pressed}) => [
                      styles.countCard,
                      active && styles.countCardActive,
                      pressed && styles.countCardPressed,
                    ]}
                  >
                    <Text
                      style={[
                        styles.countNumber,
                        active && styles.countTextActive,
                      ]}
                    >
                      {count}
                    </Text>
                    <Text
                      style={[
                        styles.countUnit,
                        active && styles.countTextActive,
                      ]}
                    >
                      题
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoIcon}>
                <Text style={styles.infoCheck}>✓</Text>
              </View>
              <Text style={styles.infoText}>
                已开启「错题优先」，薄弱题目会先出现
              </Text>
            </View>
          </GlassPanel>

          <View style={styles.setupSpacer} />

          <GlassButton
            label={`开始练习 · ${questionLimit} 题  →`}
            tone="dark"
            onPress={handleStart}
            style={styles.startBtn}
          />
        </>
      )}
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    setupContainer: {
      flex: 1,
      paddingHorizontal: 20,
      paddingTop: 2,
    },
    headingRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      marginTop: 4,
      marginBottom: 18,
      gap: 12,
    },
    headingCopy: {flex: 1},
    setupTitle: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 0.4,
    },
    setupHint: {
      fontSize: 14,
      color: colors.textSecondary,
      marginTop: 7,
      lineHeight: 22,
    },
    stepBadge: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glass,
      borderWidth: 1,
      borderColor: colors.glassBorder,
    },
    stepNumber: {
      fontSize: 11,
      fontWeight: '800',
      color: colors.textMuted,
      letterSpacing: 1,
    },
    setupLoading: {marginTop: 30},
    setupCardContent: {padding: 18},
    sectionLabel: {
      fontSize: 13,
      fontWeight: '700',
      color: colors.textMuted,
      marginBottom: 10,
      letterSpacing: 0.8,
    },
    sectionLabelSpaced: {marginTop: 22},
    chipRow: {flexDirection: 'row', flexWrap: 'wrap', gap: 10},
    countRow: {flexDirection: 'row', gap: 9},
    countCard: {
      flex: 1,
      paddingVertical: 13,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: colors.glassBorder,
      backgroundColor: colors.glass,
      alignItems: 'center',
      justifyContent: 'center',
    },
    countCardActive: {
      backgroundColor: colors.primaryStrong,
      borderColor: 'rgba(255,255,255,0.32)',
      shadowOpacity: 0.18,
    },
    countCardPressed: {opacity: 0.82, transform: [{scale: 0.98}]},
    countNumber: {fontSize: 22, fontWeight: '700', color: colors.text},
    countUnit: {fontSize: 11, color: colors.textMuted, marginTop: 1},
    countTextActive: {color: colors.onPrimary},
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 9,
      backgroundColor: colors.surfaceMuted,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 10,
      marginTop: 18,
    },
    infoIcon: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 1.5,
      borderColor: colors.textSecondary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    infoCheck: {fontSize: 11, fontWeight: '800', color: colors.textSecondary},
    infoText: {
      flex: 1,
      fontSize: 12.5,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    setupSpacer: {flex: 1, minHeight: 18},
    startBtn: {marginTop: 24, marginBottom: 12, borderRadius: 18},
  });
