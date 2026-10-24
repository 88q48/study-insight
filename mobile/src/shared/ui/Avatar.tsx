import React from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { useAppColors } from '../theme/colors';

/**
 * 账户头像。
 *
 * 设过图片就显示图片，没设过就显名字首字——新注册的用户不该看到
 * 一个空框或者占位小人，用自己的名字更有归属感。
 *
 * 图片加载失败（用户把相册里的图删了）时同样退回首字，不会白块。
 */
export function Avatar({
  name,
  uri,
  size = 52,
  ring = false,
}: {
  name: string;
  uri?: string;
  size?: number;
  /** 外面要不要一圈细边框，叠在壁纸上时更清楚 */
  ring?: boolean;
}) {
  const colors = useAppColors();
  const [failed, setFailed] = React.useState(false);
  const initial = name.trim().slice(0, 1).toUpperCase() || '?';
  const showImage = Boolean(uri) && !failed;

  return (
    <View
      style={[
        styles.root,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: showImage ? 'transparent' : colors.primaryStrong,
          borderWidth: ring ? 1 : 0,
          borderColor: colors.glassBorder,
        },
      ]}>
      {showImage ? (
        <Image
          source={{uri}}
          onError={() => setFailed(true)}
          style={{width: size, height: size, borderRadius: size / 2}}
        />
      ) : (
        <Text
          style={[
            styles.initial,
            {
              fontSize: size * 0.42,
              color: colors.onPrimary,
            },
          ]}>
          {initial}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  initial: {
    fontWeight: '700',
  },
});
