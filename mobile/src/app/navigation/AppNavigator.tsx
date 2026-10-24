import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text } from 'react-native';

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
        tabBarInactiveTintColor: '#8A94A6',
        // 用 Emoji 代替图标，避免配置原生图标库
        tabBarIcon: ({ focused }) => {
          let icon = '';
          if (route.name === '录入') icon = '📝';
          if (route.name === '练习') icon = '📚';
          if (route.name === '我的') icon = '👤';
          return <Text style={{ fontSize: 20, opacity: focused ? 1 : 0.5 }}>{icon}</Text>;
        },
      })}
    >
      <Tab.Screen name="录入" component={EntryScreen} />
      <Tab.Screen name="练习" component={PracticeScreen} />
      <Tab.Screen name="我的" component={ProfileScreen} />
    </Tab.Navigator>
  );
}