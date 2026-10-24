import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, View } from 'react-native';

import { EntryScreen } from '../../features/entry';
import { ProfileScreen } from '../../features/profile';
import PracticeScreen from '../screens/PracticeScreen';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarActiveTintColor: '#3B6EF6',
        tabBarInactiveTintColor: '#7B8494',
        tabBarStyle: styles.tabBar,
        tabBarLabelStyle: styles.tabLabel,
        // 用 Emoji 代替图标，避免配置原生图标库
        tabBarIcon: ({ focused }) => {
          let icon = '';
          if (route.name === '录入') icon = '✎';
          if (route.name === '练习') icon = '🎓';
          if (route.name === '我的') icon = '◯';
          return (
            <View style={[styles.iconWrap, focused && styles.iconWrapActive]}>
              <Text style={[styles.iconText, focused && styles.iconTextActive]}>
                {icon}
              </Text>
            </View>
          );
        },
      })}
    >
      <Tab.Screen name="录入" component={EntryScreen} />
      <Tab.Screen
        name="练习"
        component={PracticeScreen}
        options={{headerShown: false}}
      />
      <Tab.Screen name="我的" component={ProfileScreen} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: '#FFFFFF',
    borderTopColor: '#E8EEF8',
    borderTopWidth: 1,
    paddingTop: 6,
  },
  tabLabel: {fontSize: 12, fontWeight: '600'},
  iconWrap: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWrapActive: {backgroundColor: '#EAF1FF'},
  iconText: {fontSize: 18, color: '#7B8494'},
  iconTextActive: {color: '#3B6EF6'},
});