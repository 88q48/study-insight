import React from 'react';
import { View, Text, StyleSheet, Image } from 'react-native';

export default function ProfileScreen() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}><Text style={{fontSize: 30}}>👤</Text></View>
        <Text style={styles.username}>同学_ABCD</Text>
        <Text style={styles.uid}>ID: 10086</Text>
      </View>

      <Text style={styles.sectionTitle}>📊 数据分析</Text>
      <View style={styles.statsRow}>
        <View style={styles.statBox}><Text style={styles.statNum}>12</Text><Text>总错题</Text></View>
        <View style={styles.statBox}><Text style={styles.statNum}>8</Text><Text>已掌握</Text></View>
        <View style={styles.statBox}><Text style={styles.statNum}>4</Text><Text>需复习</Text></View>
      </View>
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8f9fa' },
  header: { backgroundColor: '#007AFF', alignItems: 'center', padding: 30, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  avatar: { width: 80, height: 80, backgroundColor: '#fff', borderRadius: 40, justifyContent: 'center', alignItems: 'center', marginBottom: 10 },
  username: { fontSize: 20, color: '#fff', fontWeight: 'bold' },
  uid: { fontSize: 14, color: '#e0e0e0', marginTop: 5 },
  sectionTitle: { fontSize: 18, fontWeight: 'bold', margin: 20 },
  statsRow: { flexDirection: 'row', justifyContent: 'space-around', paddingHorizontal: 10 },
  statBox: { backgroundColor: '#fff', padding: 20, borderRadius: 10, alignItems: 'center', flex: 1, marginHorizontal: 5, elevation: 1 },
  statNum: { fontSize: 22, fontWeight: 'bold', color: '#007AFF', marginBottom: 5 }
});