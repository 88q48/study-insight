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
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  switcher: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 12,
    padding: 4,
    borderRadius: 12,
    backgroundColor: '#fff',
    borderWidth: 1,
    borderColor: '#e5e9f2',
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentActive: { backgroundColor: '#007AFF' },
  segmentText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  segmentTextActive: { color: '#fff' },
  body: { flex: 1 },
});
