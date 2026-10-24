import React, { useEffect, useMemo, useState } from 'react';
import {
  createBottomTabNavigator,
} from '@react-navigation/bottom-tabs';
import type {
  BottomTabBarProps,
  BottomTabNavigationProp,
} from '@react-navigation/bottom-tabs';
import { useNavigation } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
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
import { GlassPanel } from '../../shared/ui/Glass';
import PracticeScreen from '../screens/PracticeScreen';
import PracticeSessionScreen from '../screens/PracticeSessionScreen';
import type { RootStackParamList, RootTabParamList } from './types';

const Tab = createBottomTabNavigator<RootTabParamList>();
const RootStack = createNativeStackNavigator<RootStackParamList>();

const TAB_ICONS: Record<keyof RootTabParamList, string> = {
  录入: '✎',
  练习: '≡',
  我的: '○',
};

const TAB_ORDER: (keyof RootTabParamList)[] = ['录入', '练习', '我的'];

const DOCK_HEIGHT = 58;
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
      style={[
        styles.dockWrap,
        {paddingBottom: Math.max(insets.bottom, 8) + DOCK_BOTTOM_GAP},
      ]}
    >
      <GlassPanel
        radius={DOCK_HEIGHT / 2}
        tone="strong"
        contentStyle={styles.dock}
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
              style={({pressed}) => [
                styles.tabButton,
                focused && styles.tabButtonActive,
                pressed && styles.pressed,
              ]}
            >
              <Text
                style={[
                  styles.icon,
                  {color: focused ? colors.text : colors.textMuted},
                ]}
              >
                {TAB_ICONS[route.name as keyof RootTabParamList]}
              </Text>
              <Text
                style={[
                  styles.tabLabel,
                  {color: focused ? colors.text : colors.textMuted},
                ]}
              >
                {route.name}
              </Text>
            </Pressable>
          );
        })}
      </GlassPanel>
    </View>
  );
}

function MainTabs() {
  const colors = useAppColors();

  return (
    <Tab.Navigator
      tabBar={props => <DockTabBar {...props} />}
      screenOptions={{
        headerShown: true,
        animation: 'shift',
        headerStyle: {backgroundColor: colors.background},
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

export default function AppNavigator() {
  const colors = useAppColors();

  return (
    <RootStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: {backgroundColor: colors.background},
      }}
    >
      <RootStack.Screen name="Tabs" component={MainTabs} />
      <RootStack.Screen
        name="PracticeSession"
        component={PracticeSessionScreen}
        options={{
          animation: 'slide_from_right',
          gestureEnabled: false,
        }}
      />
    </RootStack.Navigator>
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
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
  },
  tabButton: {
    width: 62,
    height: 48,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabButtonActive: {
    backgroundColor: 'rgba(255,255,255,0.86)',
    borderColor: 'rgba(255,255,255,0.96)',
    shadowColor: '#5C626B',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  pressed: {opacity: 0.62},
  icon: {fontSize: 17, lineHeight: 19, textAlign: 'center'},
  tabLabel: {
    fontSize: 9.5,
    lineHeight: 12,
    fontWeight: '700',
    letterSpacing: 0.4,
    marginTop: 1,
  },
});