import React, { useEffect, useState } from 'react';
import {
  BottomTabBarProps,
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import { Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryScreen } from '../../features/entry';
import { ProfileScreen } from '../../features/profile';
import { useAppColors } from '../../shared/theme/colors';
import PracticeScreen from '../screens/PracticeScreen';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, string> = {
  录入: '✎',
  练习: '▤',
  我的: '◯',
};

const DOCK_HEIGHT = 44;
const DOCK_BOTTOM_GAP = 6;

function DockTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  const colors = useAppColors();
  const [keyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () =>
      setKeyboardVisible(true),
    );
    const hide = Keyboard.addListener('keyboardDidHide', () =>
      setKeyboardVisible(false),
    );
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  if (keyboardVisible) {
    return null;
  }

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dockWrap, {paddingBottom: insets.bottom + DOCK_BOTTOM_GAP}]}
    >
      <View
        style={[
          styles.dock,
          {backgroundColor: colors.dock, shadowColor: colors.shadow},
        ]}
      >
        {state.routes.map((route, index) => {
          const focused = state.index === index;
          const onPress = () => {
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            });
            if (!focused && !event.defaultPrevented) {
              navigation.navigate(route.name, route.params);
            }
          };

          return (
            <Pressable
              key={route.key}
              accessibilityRole="button"
              accessibilityLabel={route.name}
              accessibilityState={focused ? {selected: true} : {}}
              onPress={onPress}
              style={({pressed}) => [styles.tabButton, pressed && styles.pressed]}
            >
              <Text
                style={[
                  styles.icon,
                  {color: focused ? colors.text : colors.textMuted},
                ]}
              >
                {TAB_ICONS[route.name as keyof RootTabParamList]}
              </Text>
              {focused && (
                <View style={[styles.activeDot, {backgroundColor: colors.text}]} />
              )}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

export default function AppNavigator() {
  const colors = useAppColors();

  return (
    <Tab.Navigator
      tabBar={props => <DockTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        headerStyle: {backgroundColor: colors.surface},
        headerTintColor: colors.text,
        headerTitleStyle: {color: colors.text, fontWeight: '700'},
        headerShadowVisible: false,
      }}
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
  dockWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  dock: {
    height: DOCK_HEIGHT,
    borderRadius: DOCK_HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 6,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 6},
    elevation: 9,
  },
  tabButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.55},
  icon: {fontSize: 19, lineHeight: 22, textAlign: 'center'},
  activeDot: {
    position: 'absolute',
    bottom: 4,
    width: 3,
    height: 3,
    borderRadius: 1.5,
  },
});