import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryScreen } from '../../features/entry';
import { ProfileScreen } from '../../features/profile';
import PracticeScreen from '../screens/PracticeScreen';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, string> = {
  录入: '✎',
  练习: '▤',
  我的: '◯',
};

export default function AppNavigator() {
  const insets = useSafeAreaInsets();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        tabBarShowLabel: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#111827',
        tabBarInactiveTintColor: '#8E8E93',
        tabBarStyle: [styles.dock, {bottom: insets.bottom + 6}],
        tabBarItemStyle: styles.dockItem,
        tabBarIcon: ({ focused }) => (
          <View style={styles.iconWrap}>
            <Text style={[styles.iconText, focused && styles.iconTextActive]}>
              {TAB_ICONS[route.name]}
            </Text>
            {focused && <View style={styles.activeDot} />}
          </View>
        ),
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
  dock: {
    position: 'absolute',
    left: 30,
    right: 30,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.96)',
    borderTopWidth: 0,
    shadowColor: '#111827',
    shadowOpacity: 0.13,
    shadowRadius: 16,
    shadowOffset: {width: 0, height: 7},
    elevation: 9,
    paddingBottom: 0,
    paddingTop: 0,
  },
  dockItem: {height: 56, paddingVertical: 0},
  iconWrap: {height: 34, width: 50, alignItems: 'center', justifyContent: 'center'},
  iconText: {fontSize: 20, lineHeight: 23, color: '#8E8E93', textAlign: 'center'},
  iconTextActive: {color: '#111827'},
  activeDot: {
    width: 3.5,
    height: 3.5,
    borderRadius: 2,
    backgroundColor: '#111827',
    marginTop: 1,
  },
});