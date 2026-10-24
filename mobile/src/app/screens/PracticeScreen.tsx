import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MistakesScreen } from '../../features/mistakes';
import { StudyScreen } from '../../features/study';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';

type PracticeMode = 'study' | 'mistakes';

export default function PracticeScreen() {
  const [mode, setMode] = useState<PracticeMode>('study');
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={[styles.container, {paddingTop: insets.top + 18}]}>
      <View style={styles.headerBlock}>
        <Text style={styles.kicker}>每天进步一点点</Text>
        <Text style={styles.title}>练习</Text>
      </View>

      <View style={styles.switcher} accessibilityRole="tablist">
        <TouchableOpacity
          style={[styles.segment, mode === 'study' && styles.segmentActive]}
          onPress={() => setMode('study')}
          accessibilityRole="tab"
          accessibilityState={{selected: mode === 'study'}}
        >
          <Text style={[styles.segmentIcon, mode === 'study' && styles.segmentIconActive]}>📖</Text>
          <Text style={[styles.segmentText, mode === 'study' && styles.segmentTextActive]}>
            学习
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, mode === 'mistakes' && styles.segmentActive]}
          onPress={() => setMode('mistakes')}
          accessibilityRole="tab"
          accessibilityState={{selected: mode === 'mistakes'}}
        >
          <Text style={[styles.segmentIcon, mode === 'mistakes' && styles.segmentIconActive]}>✕</Text>
          <Text style={[styles.segmentText, mode === 'mistakes' && styles.segmentTextActive]}>
            错题
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {mode === 'study' ? <StudyScreen /> : <MistakesScreen />}
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    headerBlock: {paddingHorizontal: 24, marginBottom: 18},
    kicker: {fontSize: 16, color: colors.textSecondary, marginBottom: 4},
    title: {
      fontSize: 40,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 1,
    },
    switcher: {
      flexDirection: 'row',
      marginHorizontal: 20,
      marginBottom: 18,
      padding: 5,
      borderRadius: 18,
      backgroundColor: colors.primarySoft,
    },
    segment: {
      flex: 1,
      flexDirection: 'row',
      gap: 8,
      paddingVertical: 11,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentActive: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.shadow,
      shadowOpacity: 0.08,
      shadowRadius: 8,
      shadowOffset: {width: 0, height: 3},
      elevation: 2,
    },
    segmentIcon: {fontSize: 18, color: colors.textMuted},
    segmentIconActive: {color: colors.primary},
    segmentText: {fontSize: 16, fontWeight: '600', color: colors.textMuted},
    segmentTextActive: {color: colors.primary},
    body: {flex: 1, paddingBottom: 92},
  });
