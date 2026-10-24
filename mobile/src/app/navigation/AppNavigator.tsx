import React, { useEffect, useMemo, useState } from 'react';
import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import type {
  BottomTabBarProps,
  BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import {
  Keyboard,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EntryScreen } from '../../features/entry';
import { ProfileScreen } from '../../features/profile';
import { useAppColors } from '../../shared/theme/colors';
import PracticeScreen from '../screens/PracticeScreen';
import type { RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, string> = {
  录入: '✎',
  练习: '≡',
  我的: '○',
};

const TAB_ORDER: (keyof RootTabParamList)[] = ['录入', '练习', '我的'];

const DOCK_HEIGHT = 46;
const DOCK_BOTTOM_GAP = 6;

function SwipeableTab({
  current,
  children,
}: {
  current: keyof RootTabParamList;
  children: React.ReactNode;
}) {
  const navigation =
    useNavigation<BottomTabNavigationProp<RootTabParamList>>();

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponderCapture: (_, gesture) =>
          Math.abs(gesture.dx) > 18 &&
          Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.4,
        onPanResponderRelease: (_, gesture) => {
          const currentIndex = TAB_ORDER.indexOf(current);
          if (gesture.dx < -55 && currentIndex < TAB_ORDER.length - 1) {
            navigation.navigate(TAB_ORDER[currentIndex + 1]);
          } else if (gesture.dx > 55 && currentIndex > 0) {
            navigation.navigate(TAB_ORDER[currentIndex - 1]);
          }
        },
      }),
    [current, navigation],
  );

  return (
    <View style={styles.swipeArea} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

function EntryTab() {
  return (
    <SwipeableTab current="录入">
      <EntryScreen />
    </SwipeableTab>
  );
}

function PracticeTab() {
  return (
    <SwipeableTab current="练习">
      <PracticeScreen />
    </SwipeableTab>
  );
}

function ProfileTab() {
  return (
    <SwipeableTab current="我的">
      <ProfileScreen />
    </SwipeableTab>
  );
}

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
          {
            backgroundColor: colors.dock,
            borderColor: colors.border,
            shadowColor: colors.shadow,
          },
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
        animation: 'shift',
        headerStyle: {backgroundColor: colors.surface},
        headerTintColor: colors.text,
        headerTitleStyle: {color: colors.text, fontWeight: '700'},
        headerShadowVisible: false,
      }}
    >
      <Tab.Screen name="录入" component={EntryTab} />
      <Tab.Screen
        name="练习"
        component={PracticeTab}
        options={{headerShown: false}}
      />
      <Tab.Screen name="我的" component={ProfileTab} />
    </Tab.Navigator>
  );
}

const styles = StyleSheet.create({
  swipeArea: {flex: 1},
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
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 22,
    gap: 18,
    shadowOpacity: 0.14,
    shadowRadius: 14,
    shadowOffset: {width: 0, height: 6},
    elevation: 9,
  },
  tabButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {opacity: 0.55},
  icon: {fontSize: 20, lineHeight: 23, textAlign: 'center'},
});