import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { MistakesScreen } from '../../features/mistakes';
import { StudyScreen } from '../../features/study';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';
import { WallpaperBackdrop } from '../../shared/theme/Wallpaper';
import { GlassSegmented } from '../../shared/ui/Glass';
import type { GlassSegmentOption } from '../../shared/ui/Glass';

type PracticeMode = 'study' | 'mistakes';

const MODE_OPTIONS: readonly GlassSegmentOption<PracticeMode>[] = [
  {value: 'study', label: '学习'},
  {value: 'mistakes', label: '错题'},
];

export default function PracticeScreen() {
  const [mode, setMode] = useState<PracticeMode>('study');
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <WallpaperBackdrop />
      <View style={[styles.inner, {paddingTop: insets.top + 20}]}>
        <View style={styles.headerBlock}>
          <Text style={styles.kicker}>每天进步一点点</Text>
          <Text style={styles.title}>练习</Text>
        </View>

        <GlassSegmented
          options={MODE_OPTIONS}
          value={mode}
          onChange={setMode}
          style={styles.switcher}
        />

        <View style={[styles.body, mode === 'study' && styles.bodyWithDock]}>
          {mode === 'study' ? <StudyScreen /> : <MistakesScreen />}
        </View>
      </View>
    </View>
  );
}

const makeStyles = (colors: AppColors) =>
  StyleSheet.create({
    container: {flex: 1, backgroundColor: colors.background},
    inner: {flex: 1, zIndex: 1, backgroundColor: 'transparent'},
    headerBlock: {paddingHorizontal: 24, marginBottom: 16},
    kicker: {
      fontSize: 14,
      color: colors.textMuted,
      letterSpacing: 1.2,
      fontWeight: '600',
      marginBottom: 2,
    },
    title: {
      fontSize: 42,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: 1,
    },
    switcher: {marginHorizontal: 20, marginBottom: 12},
    body: {flex: 1, overflow: 'hidden'},
    bodyWithDock: {paddingBottom: 96},
  });
