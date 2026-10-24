import React, { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import type { StyleProp, ViewStyle } from 'react-native';

/**
 * 进页面时淡入 + 轻微上浮。
 *
 * 为什么需要：原来切 tab 内容直接蹦出来，观感很硬。加一层 160ms 的
 * 淡入，成本几乎为零（opacity/translateY 都能走原生驱动），但节奏会
 * 顺很多。
 *
 * 只动 opacity 和 transform，不碰布局，所以不会引起回流，也不会
 * 让 ScrollView 的滚动位置出问题。
 */
export function FadeIn({
  children,
  style,
  duration = 180,
  offset = 8,
}: {
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  duration?: number;
  offset?: number;
}) {
  const progress = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    progress.setValue(0);
    Animated.timing(progress, {
      toValue: 1,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [progress, duration]);

  const translateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [offset, 0],
  });

  return (
    <Animated.View
      style={[style, {opacity: progress, transform: [{translateY}]}]}>
      {children}
    </Animated.View>
  );
}
