import React, { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { MistakesScreen } from '../../features/mistakes';
import { StudyScreen } from '../../features/study';

type PracticeMode = 'study' | 'mistakes';

export default function PracticeScreen() {
  const [mode, setMode] = useState<PracticeMode>('study');

  return (
    <View style={styles.container}>
      <View style={styles.switcher} accessibilityRole="tablist">
        <TouchableOpacity
          style={[styles.segment, mode === 'study' && styles.segmentActive]}
          onPress={() => setMode('study')}
          accessibilityRole="tab"
          accessibilityState={{selected: mode === 'study'}}
        >
          <Text style={[styles.segmentText, mode === 'study' && styles.segmentTextActive]}>
            📖 学习
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.segment, mode === 'mistakes' && styles.segmentActive]}
          onPress={() => setMode('mistakes')}
          accessibilityRole="tab"
          accessibilityState={{selected: mode === 'mistakes'}}
        >
          <Text style={[styles.segmentText, mode === 'mistakes' && styles.segmentTextActive]}>
            ❌ 错题
          </Text>
        </TouchableOpacity>
      </View>

      <View style={styles.body}>
        {mode === 'study' ? <StudyScreen /> : <MistakesScreen />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F3F6FC' },
  switcher: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8EEF8',
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: '#3B6EF6' },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#7B8494' },
  segmentTextActive: { color: '#FFFFFF' },
  body: { flex: 1 },
});
