import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

import { EntryScreen } from '../../features/entry';
import { StudyScreen } from '../../features/study';
import { MistakesScreen } from '../../features/mistakes';
import { ProfileScreen } from '../../features/profile';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

export default function AppNavigator() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarActiveTintColor: '#007AFF',
        tabBarInactiveTintColor: '#999',
        // 用 Emoji 代替图标，避免配置原生图标库
        tabBarIcon: ({ focused }) => {
          let icon = '';
          if (route.name === '录入') icon = '📝';
          if (route.name === '学习') icon = '📖';
          if (route.name === '错题') icon = '❌';
          if (route.name === '我的') icon = '👤';
          return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
        },
      })}
    >
      <Tab.Screen name="录入" component={EntryScreen} />
      <Tab.Screen name="学习" component={StudyScreen} />
      <Tab.Screen name="错题" component={MistakesScreen} />
      <Tab.Screen name="我的" component={ProfileScreen} />
    </Tab.Navigator>
  );
}