import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { LineChart, PieChart } from 'react-native-chart-kit';

import type {
  AppRankingItem,
  FocusTrendPoint,
  KnowledgePointStat,
  ReviewTrendPoint,
  SubjectDistributionItem,
} from '../../shared/api/types';
import { useAppColors } from '../../shared/theme/colors';
import type { AppColors } from '../../shared/theme/colors';

const PIE_COLORS = [
  '#E7E9EC',
  '#B8BEC6',
  '#939AA3',
  '#6F767F',
  '#555B63',
  '#3A3F46',
];

function shortDate(value: string): string {
  const parts = value.split('-');
  if (parts.length < 3) {
    return value;
  }
  return `${Number(parts[1])}/${Number(parts[2])}`;
}

export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) {
    return '0 分';
  }
  if (seconds < 3600) {
    return `${Math.round(seconds / 60)} 分`;
  }
  return `${(seconds / 3600).toFixed(1)} 小时`;
}

function makeChartConfig(colors: AppColors) {
  return {
    backgroundGradientFrom: colors.surface,
    backgroundGradientTo: colors.surface,
    backgroundGradientFromOpacity: 1,
    backgroundGradientToOpacity: 1,
    decimalPlaces: 0,
    color: (opacity = 1) => `rgba(231,233,236,${opacity})`,
    labelColor: (opacity = 1) => `rgba(141,147,155,${opacity})`,
    strokeWidth: 2,
    propsForBackgroundLines: {
      stroke: colors.border,
      strokeDasharray: '',
      strokeWidth: 1,
    },
    propsForDots: {
      r: '3',
      strokeWidth: '0',
    },
    propsForLabels: {
      fontSize: 10,
    },
  };
}

function ChartEmpty({label}: {label: string}) {
  const colors = useAppColors();
  return (
    <View style={styles.empty}>
      <Text style={[styles.emptyText, {color: colors.textMuted}]}>{label}</Text>
    </View>
  );
}

function LegendDot({color}: {color: string}) {
  return <View style={[styles.legendDot, {backgroundColor: color}]} />;
}

type SubjectDistributionProps = {
  items: SubjectDistributionItem[];
  width: number;
};

/**
 * 各科错题分布：灰色卡片上的单色环图，配自定义图例。
 * 使用 chart-kit 的 PieChart，避免 WebView 和外部图表脚本。
 */
export function SubjectDistributionChart({
  items,
  width,
}: SubjectDistributionProps) {
  const colors = useAppColors();
  const visible = items.filter(item => item.error_count > 0).slice(0, 6);

  if (!visible.length) {
    return <ChartEmpty label="还没有错题数据" />;
  }

  const data = visible.map((item, index) => ({
    name: item.subject,
    population: item.error_count,
    color: PIE_COLORS[index % PIE_COLORS.length],
    legendFontColor: colors.textSecondary,
    legendFontSize: 11,
  }));

  return (
    <View>
      <PieChart
        data={data}
        width={width}
        height={176}
        accessor="population"
        backgroundColor="transparent"
        paddingLeft={`${Math.round(width / 4)}`}
        center={[0, 0]}
        absolute
        hasLegend={false}
        chartConfig={makeChartConfig(colors)}
        avoidFalseZero
      />
      <View style={styles.legendGrid}>
        {visible.map((item, index) => (
          <View key={`${item.subject}-${index}`} style={styles.legendRow}>
            <LegendDot color={PIE_COLORS[index % PIE_COLORS.length]} />
            <Text
              numberOfLines={1}
              style={[styles.legendLabel, {color: colors.textSecondary}]}>
              {item.subject}
            </Text>
            <Text style={[styles.legendValue, {color: colors.text}]}>
              {item.error_count} 道
            </Text>
          </View>
        ))}
      </View>
    </View>
  );
}

type ReviewTrendProps = {
  items: ReviewTrendPoint[];
  width: number;
};

/** 近 7 天新增错题与掌握错题的走势。 */
export function ReviewTrendChart({items, width}: ReviewTrendProps) {
  const colors = useAppColors();

  if (!items.length) {
    return <ChartEmpty label="还没有错题趋势数据" />;
  }

  const data = {
    labels: items.map(item => shortDate(item.date)),
    datasets: [
      {
        data: items.map(item => item.new_added),
        color: (opacity = 1) => `rgba(231,233,236,${opacity})`,
        strokeWidth: 2,
      },
      {
        data: items.map(item => item.resolved),
        color: (opacity = 1) => `rgba(99,183,132,${opacity})`,
        strokeWidth: 2,
      },
    ],
  };

  return (
    <View>
      <LineChart
        data={data}
        width={width}
        height={190}
        chartConfig={makeChartConfig(colors)}
        bezier
        withDots
        withShadow={false}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLines={false}
        fromZero
        segments={3}
        yAxisLabel=""
        yAxisSuffix=""
        formatYLabel={value => String(Math.round(Number(value)))}
        style={styles.lineChart}
      />
      <View style={styles.seriesLegend}>
        <View style={styles.seriesLegendItem}>
          <LegendDot color={colors.text} />
          <Text style={[styles.legendLabel, {color: colors.textSecondary}]}>
            新增
          </Text>
        </View>
        <View style={styles.seriesLegendItem}>
          <LegendDot color={colors.success} />
          <Text style={[styles.legendLabel, {color: colors.textSecondary}]}>
            掌握
          </Text>
        </View>
      </View>
    </View>
  );
}

type FocusTrendProps = {
  items: FocusTrendPoint[];
  width: number;
};

/** 每日专注时长趋势，单位为小时。 */
export function FocusTrendChart({items, width}: FocusTrendProps) {
  const colors = useAppColors();

  if (!items.length) {
    return <ChartEmpty label="还没有专注记录" />;
  }

  const data = {
    labels: items.map(item => shortDate(item.date)),
    datasets: [
      {
        data: items.map(
          item => Math.round((item.total_duration_seconds / 3600) * 10) / 10,
        ),
        color: (opacity = 1) => `rgba(231,233,236,${opacity})`,
        strokeWidth: 2,
      },
    ],
  };

  const config = {
    ...makeChartConfig(colors),
    fillShadowGradientFrom: colors.text,
    fillShadowGradientFromOpacity: 0.24,
    fillShadowGradientTo: colors.surface,
    fillShadowGradientToOpacity: 0,
  };

  return (
    <LineChart
      data={data}
      width={width}
      height={190}
      chartConfig={config}
      bezier
      withDots
      withShadow
      withInnerLines={false}
      withOuterLines={false}
      withVerticalLines={false}
      fromZero
      segments={3}
      yAxisLabel=""
      yAxisSuffix="h"
      formatYLabel={value => String(Number(value).toFixed(1))}
      style={styles.lineChart}
    />
  );
}


type WeakPointsProps = {
  items: KnowledgePointStat[];
};

/** 知识点薄弱榜：用原生进度条表达待复习数量，避免信息过载。 */
export function WeakPointBars({items}: WeakPointsProps) {
  const colors = useAppColors();
  const visible = [...items]
    .filter(item => item.reviewing_count > 0)
    .sort(
      (left, right) =>
        right.reviewing_count - left.reviewing_count ||
        right.error_count - left.error_count,
    )
    .slice(0, 5);

  if (!visible.length) {
    return <ChartEmpty label="目前没有待复习的知识点" />;
  }

  const max = Math.max(...visible.map(item => item.reviewing_count), 1);

  return (
    <View style={styles.barList}>
      {visible.map((item, index) => {
        const width = Math.max(6, Math.round((item.reviewing_count / max) * 100));
        return (
          <View key={`${item.subject}-${item.knowledge_point}-${index}`}>
            <View style={styles.barHeader}>
              <View style={styles.barTitleWrap}>
                <Text
                  numberOfLines={1}
                  style={[styles.barTitle, {color: colors.text}]}>
                  {item.knowledge_point}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.barSubtitle, {color: colors.textMuted}]}>
                  {item.subject}
                </Text>
              </View>
              <Text style={[styles.barCount, {color: colors.textSecondary}]}>
                {item.reviewing_count} 待复习
              </Text>
            </View>
            <View
              style={[styles.barTrack, {backgroundColor: colors.surfaceMuted}]}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${width}%` as `${number}%`,
                    backgroundColor:
                      index === 0 ? colors.text : colors.textSecondary,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

type AppUsageProps = {
  items: AppRankingItem[];
};

/** 应用使用排行：沿用灰色卡片和细进度条，不额外引入装饰元素。 */
export function AppUsageBars({items}: AppUsageProps) {
  const colors = useAppColors();
  const visible = items.slice(0, 5);

  if (!visible.length) {
    return <ChartEmpty label="还没有应用使用记录" />;
  }

  const max = Math.max(...visible.map(item => item.percentage), 1);

  return (
    <View style={styles.barList}>
      {visible.map((item, index) => {
        const width = Math.max(6, Math.round((item.percentage / max) * 100));
        return (
          <View key={item.app_key}>
            <View style={styles.barHeader}>
              <View style={styles.barTitleWrap}>
                <Text
                  numberOfLines={1}
                  style={[styles.barTitle, {color: colors.text}]}>
                  {item.app_name}
                </Text>
                <Text
                  numberOfLines={1}
                  style={[styles.barSubtitle, {color: colors.textMuted}]}>
                  {item.category} · {item.percentage.toFixed(1)}%
                </Text>
              </View>
              <Text style={[styles.barCount, {color: colors.textSecondary}]}>
                {formatDuration(item.duration_seconds)}
              </Text>
            </View>
            <View
              style={[styles.barTrack, {backgroundColor: colors.surfaceMuted}]}>
              <View
                style={[
                  styles.barFill,
                  {
                    width: `${width}%` as `${number}%`,
                    backgroundColor:
                      index === 0 ? colors.text : colors.textSecondary,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  empty: {
    height: 150,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
    fontWeight: '500',
  },
  lineChart: {
    marginLeft: -12,
    borderRadius: 16,
  },
  legendGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
    marginTop: 4,
  },
  legendRow: {
    width: '50%',
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 7,
  },
  legendLabel: {
    flexShrink: 1,
    fontSize: 12,
    fontWeight: '600',
  },
  legendValue: {
    marginLeft: 'auto',
    fontSize: 12,
    fontWeight: '700',
  },
  seriesLegend: {
    flexDirection: 'row',
    gap: 20,
    marginTop: 8,
    paddingLeft: 4,
  },
  seriesLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  barList: {
    gap: 18,
  },
  barHeader: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 10,
    marginBottom: 8,
  },
  barTitleWrap: {
    flex: 1,
  },
  barTitle: {
    fontSize: 14,
    fontWeight: '700',
  },
  barSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    marginTop: 2,
  },
  barCount: {
    fontSize: 12,
    fontWeight: '700',
  },
  barTrack: {
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    borderRadius: 3,
  },
});

