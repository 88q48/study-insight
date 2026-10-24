import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  Text,
  TouchableOpacity,
} from 'react-native';
import { WebView } from 'react-native-webview';

import { API_BASE_URL } from '../../shared/config';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';

// 看板由后端在 /dashboard 上直接提供，走同一个 host，不用另起服务。
// 之前这里写死 8080，那个端口是单独跑静态服务器的做法，多开一个进程就多一个失败点。
const DASHBOARD_URL = `${API_BASE_URL}/dashboard/`;

export default function ProfileScreen() {
  const colors = useAppColors();
  const styles = React.useMemo(() => makeStyles(colors), [colors]);
  // 用 key 递增来强制 WebView 重新挂载，比 ref.reload() 稳，
  // 也不会踩到 WebView 泛型推断的坑
  const [reloadKey, setReloadKey] = useState(0);
  const [failed, setFailed] = useState(false);

  return (
    <View style={styles.container}>
      {failed && (
        <View style={styles.failBox}>
          <Text style={styles.failTitle}>看板没加载出来</Text>
          <Text style={styles.failHint}>先确认后端在跑：{API_BASE_URL}</Text>
          <TouchableOpacity
            style={styles.retryBtn}
            onPress={() => {
              setFailed(false);
              setReloadKey((k) => k + 1);
            }}>
            <Text style={styles.retryText}>重试</Text>
          </TouchableOpacity>
        </View>
      )}
      <WebView
        key={reloadKey}
        source={{ uri: DASHBOARD_URL }}
        style={styles.webview}
        startInLoadingState
        onError={() => setFailed(true)}
        onHttpError={() => setFailed(true)}
        renderLoading={() => (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={styles.loadingText}>看板加载中...</Text>
          </View>
        )}
        javaScriptEnabled
        domStorageEnabled
        scalesPageToFit
        // 联调期关缓存：改了后端 config.js / 页面后，重进即生效，
        // 不用清应用数据就能看到最新版本
        cacheEnabled={false}
        incognito={false}
      />
    </View>
  );
}

function makeStyles(colors: AppColors) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    webview: { flex: 1 },
    loadingContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: { marginTop: 10, color: colors.textMuted, fontSize: 13 },
    failBox: {
      paddingVertical: 14,
      paddingHorizontal: 16,
      backgroundColor: colors.surfaceAlt,
      alignItems: 'center',
    },
    failTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
    failHint: { color: colors.textSecondary, fontSize: 12, marginTop: 4 },
    retryBtn: {
      marginTop: 8,
      paddingVertical: 6,
      paddingHorizontal: 18,
      borderRadius: 8,
      backgroundColor: colors.primary,
    },
    retryText: { color: colors.background, fontSize: 13, fontWeight: '600' },
  });
}
