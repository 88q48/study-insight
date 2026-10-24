import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import type { ReactNode } from 'react';
import type { StyleProp, TextStyle, ViewStyle } from 'react-native';

import { useAppColors } from '../theme/colors';

/**
 * 纯色背景层。全部装饰性圆形已移除，只保留主界面底色。
 * 仍然保留该组件，避免各页面重复处理背景。
 */
export function GlassBackdrop() {
  const colors = useAppColors();
  return (
    <View
      pointerEvents="none"
      style={[styles.backdrop, {backgroundColor: colors.background}]}
    />
  );
}

type GlassPanelProps = {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  contentStyle?: StyleProp<ViewStyle>;
  radius?: number;
  tone?: 'soft' | 'regular' | 'strong';
};

export function GlassPanel({
  children,
  style,
  contentStyle,
  radius = 26,
  tone = 'regular',
}: GlassPanelProps) {
  const colors = useAppColors();
  const background =
    tone === 'soft'
      ? colors.glass
      : tone === 'strong'
      ? colors.glassStrong
      : colors.surface;

  return (
    <View
      style={[
        styles.panelShadow,
        {borderRadius: radius, shadowColor: colors.shadow},
        style,
      ]}
    >
      <View
        style={[
          styles.panelBody,
          {
            borderRadius: radius,
            borderColor: colors.glassBorder,
            backgroundColor: background,
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.panelTopLine,
            {
              borderTopLeftRadius: radius,
              borderTopRightRadius: radius,
              backgroundColor: colors.glassEdge,
            },
          ]}
        />
        <View style={contentStyle}>{children}</View>
      </View>
    </View>
  );
}

type GlassButtonProps = {
  label?: string;
  children?: ReactNode;
  onPress: () => void;
  disabled?: boolean;
  tone?: 'light' | 'dark' | 'quiet';
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function GlassButton({
  label,
  children,
  onPress,
  disabled = false,
  tone = 'light',
  style,
  textStyle,
}: GlassButtonProps) {
  const colors = useAppColors();
  const isDark = tone === 'dark';
  const background =
    tone === 'dark'
      ? colors.primaryStrong
      : tone === 'quiet'
      ? colors.glass
      : colors.glassStrong;
  const borderColor = isDark
    ? 'rgba(255,255,255,0.28)'
    : colors.glassBorder;
  const labelColor = isDark ? colors.onPrimary : colors.text;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{disabled}}
      disabled={disabled}
      onPress={onPress}
      style={({pressed}) => [
        styles.buttonShadow,
        {
          borderRadius: 18,
          shadowColor: colors.shadow,
          shadowOpacity: isDark ? 0.2 : 0.12,
        },
        pressed && styles.pressed,
        disabled && styles.disabled,
        style,
      ]}
    >
      <View
        style={[
          styles.buttonBody,
          {borderRadius: 18, backgroundColor: background, borderColor},
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.buttonTopLine,
            {backgroundColor: isDark ? 'rgba(255,255,255,0.3)' : colors.glassEdge},
          ]}
        />
        {label ? (
          <Text style={[styles.buttonLabel, {color: labelColor}, textStyle]}>
            {label}
          </Text>
        ) : (
          children
        )}
      </View>
    </Pressable>
  );
}

type GlassChipProps = {
  label: string;
  sublabel?: string;
  active?: boolean;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  accessibilityLabel?: string;
};

export function GlassChip({
  label,
  sublabel,
  active = false,
  onPress,
  style,
  textStyle,
  accessibilityLabel,
}: GlassChipProps) {
  const colors = useAppColors();

  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={accessibilityLabel || label}
      accessibilityState={onPress ? {selected: active} : undefined}
      disabled={!onPress}
      onPress={onPress}
      style={({pressed}) => [
        styles.chipShadow,
        {
          borderRadius: 18,
          shadowColor: colors.shadow,
          shadowOpacity: active ? 0.18 : 0.08,
        },
        pressed && styles.pressed,
        style,
      ]}
    >
      <View
        style={[
          styles.chipBody,
          {
            borderRadius: 18,
            borderColor: active ? 'rgba(255,255,255,0.32)' : colors.glassBorder,
            backgroundColor: active ? colors.primaryStrong : colors.glass,
          },
        ]}
      >
        <View
          pointerEvents="none"
          style={[
            styles.chipTopLine,
            {
              backgroundColor: active
                ? 'rgba(255,255,255,0.32)'
                : colors.glassEdge,
            },
          ]}
        />
        <Text
          style={[
            styles.chipLabel,
            {color: active ? colors.onPrimary : colors.textSecondary},
            textStyle,
          ]}
        >
          {label}
        </Text>
        {sublabel ? (
          <Text
            style={[
              styles.chipSublabel,
              {color: active ? 'rgba(255,255,255,0.72)' : colors.textMuted},
            ]}
          >
            {sublabel}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

export type GlassSegmentOption<T extends string> = {
  value: T;
  label: string;
};

/** 分段滑块：强减速曲线，比原来的弹簧更慢、更稳。 */
const SEGMENT_EASING = Easing.bezier(0.16, 1, 0.3, 1);
const SEGMENT_DURATION = 380;

type GlassSegmentedProps<T extends string> = {
  options: readonly GlassSegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  style?: StyleProp<ViewStyle>;
};

export function GlassSegmented<T extends string>({
  options,
  value,
  onChange,
  style,
}: GlassSegmentedProps<T>) {
  const colors = useAppColors();
  const [trackWidth, setTrackWidth] = useState(0);
  const activeIndex = Math.max(
    0,
    options.findIndex(option => option.value === value),
  );
  const slide = useRef(new Animated.Value(activeIndex)).current;
  const segmentWidth =
    trackWidth > 0 && options.length > 0
      ? (trackWidth - 8) / options.length
      : 0;

  useEffect(() => {
    Animated.timing(slide, {
      toValue: activeIndex,
      duration: SEGMENT_DURATION,
      easing: SEGMENT_EASING,
      useNativeDriver: true,
    }).start();
  }, [activeIndex, slide]);

  // translateX 缓存起来。原来在 render 里直接写 Animated.multiply，
  // 每次父组件重渲染都会新建一个动画节点，滑动时白掉帧。
  const thumbTranslate = useMemo(
    () => Animated.multiply(slide, segmentWidth),
    [slide, segmentWidth],
  );

  const trackColors = useMemo(
    () => ({
      track: {
        backgroundColor: colors.glass,
        borderColor: colors.glassBorder,
        shadowColor: colors.shadow,
      },
      thumb: {
        backgroundColor: colors.glassStrong,
        borderColor: colors.glassEdge,
        shadowColor: colors.shadow,
      },
    }),
    [colors],
  );

  return (
    <View
      accessibilityRole="tablist"
      onLayout={event => setTrackWidth(event.nativeEvent.layout.width)}
      style={[styles.segmentTrack, trackColors.track, style]}
    >
      <View pointerEvents="none" style={[styles.segmentTopLine, {backgroundColor: colors.glassEdge}]} />
      {segmentWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.segmentThumb,
            trackColors.thumb,
            {
              width: segmentWidth,
              transform: [{translateX: thumbTranslate}],
            },
          ]}
        >
        </Animated.View>
      ) : null}
      {options.map(option => {
        const focused = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{selected: focused}}
            onPress={() => onChange(option.value)}
            style={({pressed}) => [
              styles.segmentButton,
              pressed && styles.segmentPressed,
            ]}
          >
            <Text
              style={[
                styles.segmentLabel,
                {color: focused ? colors.text : colors.textMuted},
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}


const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    backgroundColor: '#000000',
  },
  panelShadow: {
    shadowOpacity: 0.13,
    shadowRadius: 24,
    shadowOffset: {width: 0, height: 14},
    elevation: 5,
  },
  panelBody: {
    borderWidth: 1,
    overflow: 'hidden',
  },
  panelTopLine: {
    position: 'absolute',
    left: 12,
    right: 12,
    top: 0,
    height: 1,
  },
  buttonShadow: {
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 10},
    elevation: 4,
  },
  buttonBody: {
    minHeight: 52,
    paddingHorizontal: 20,
    paddingVertical: 15,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  buttonTopLine: {
    position: 'absolute',
    left: 16,
    right: 16,
    top: 0,
    height: 1,
  },
  buttonLabel: {
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  pressed: {
    transform: [{scale: 0.98}],
    opacity: 0.88,
  },
  disabled: {
    opacity: 0.5,
  },
  chipShadow: {
    shadowRadius: 12,
    shadowOffset: {width: 0, height: 6},
    elevation: 2,
  },
  chipBody: {
    width: '100%',
    minHeight: 42,
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  chipTopLine: {
    position: 'absolute',
    left: 14,
    right: 14,
    top: 0,
    height: 1,
  },
  chipLabel: {
    fontSize: 14,
    fontWeight: '600',
    backgroundColor: 'transparent',
  },
  chipSublabel: {
    fontSize: 11,
    marginTop: 1,
    fontWeight: '500',
    backgroundColor: 'transparent',
  },

  segmentTrack: {
    height: 50,
    borderRadius: 25,
    borderWidth: 1,
    padding: 4,
    flexDirection: 'row',
    alignItems: 'stretch',
    overflow: 'hidden',
    shadowOpacity: 0.1,
    shadowRadius: 18,
    shadowOffset: {width: 0, height: 8},
    elevation: 3,
  },
  segmentTopLine: {
    position: 'absolute',
    left: 18,
    right: 18,
    top: 0,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.9)',
  },
  segmentThumb: {
    position: 'absolute',
    left: 4,
    top: 4,
    bottom: 4,
    borderRadius: 21,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOpacity: 0.16,
    shadowRadius: 10,
    shadowOffset: {width: 0, height: 4},
    elevation: 3,
  },
  segmentButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 2,
  },
  segmentPressed: {
    opacity: 0.7,
  },
  segmentLabel: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
