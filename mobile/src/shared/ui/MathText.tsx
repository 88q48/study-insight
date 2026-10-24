import React from 'react';
import { Platform, StyleProp, StyleSheet, Text, TextStyle } from 'react-native';

import { useAppColors } from '../theme/colors';

const SUPERSCRIPTS: Record<string, string> = {
  '0': '⁰',
  '1': '¹',
  '2': '²',
  '3': '³',
  '4': '⁴',
  '5': '⁵',
  '6': '⁶',
  '7': '⁷',
  '8': '⁸',
  '9': '⁹',
  '+': '⁺',
  '-': '⁻',
  '=': '⁼',
  '(': '⁽',
  ')': '⁾',
  n: 'ⁿ',
  i: 'ⁱ',
};

const SUBSCRIPTS: Record<string, string> = {
  '0': '₀',
  '1': '₁',
  '2': '₂',
  '3': '₃',
  '4': '₄',
  '5': '₅',
  '6': '₆',
  '7': '₇',
  '8': '₈',
  '9': '₉',
  '+': '₊',
  '-': '₋',
  '=': '₌',
  '(': '₍',
  ')': '₎',
};

const COMMANDS: Record<string, string> = {
  '\\alpha': 'α',
  '\\beta': 'β',
  '\\gamma': 'γ',
  '\\delta': 'δ',
  '\\theta': 'θ',
  '\\lambda': 'λ',
  '\\mu': 'μ',
  '\\pi': 'π',
  '\\sigma': 'σ',
  '\\phi': 'φ',
  '\\omega': 'ω',
  '\\times': '×',
  '\\cdot': '·',
  '\\div': '÷',
  '\\pm': '±',
  '\\le': '≤',
  '\\leq': '≤',
  '\\ge': '≥',
  '\\geq': '≥',
  '\\neq': '≠',
  '\\approx': '≈',
  '\\infty': '∞',
  '\\sum': '∑',
  '\\int': '∫',
  '\\sqrt': '√',
  '\\left': '',
  '\\right': '',
};

function toScript(value: string, table: Record<string, string>): string {
  return value
    .split('')
    .map(char => table[char] ?? char)
    .join('');
}

/** 把常见的 LaTeX 片段转成便于 RN 显示的 Unicode 数学文本。 */
export function formatLatex(input: string): string {
  if (!input) {
    return '';
  }

  let text = input
    .replace(/\\\((.*?)\\\)/g, '$1')
    .replace(/\\\[(.*?)\\\]/g, '$1')
    .replace(/\$([^$]+)\$/g, '$1')
    .replace(/\\text\{([^{}]+)\}/g, '$1')
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)')
    .replace(/\\sqrt\{([^{}]+)\}/g, '√($1)')
    .replace(/\\sqrt\s+([^\s]+)/g, '√$1')
    .replace(/\\[,;!]/g, '');

  text = text.replace(/\^\{([^{}]+)\}/g, (_, value: string) =>
    toScript(value, SUPERSCRIPTS),
  );
  text = text.replace(/\^([0-9n+\-=()])/g, (_, value: string) =>
    toScript(value, SUPERSCRIPTS),
  );
  text = text.replace(/_\{([^{}]+)\}/g, (_, value: string) =>
    toScript(value, SUBSCRIPTS),
  );
  text = text.replace(/_([0-9+\-=()])/g, (_, value: string) =>
    toScript(value, SUBSCRIPTS),
  );

  text = text.replace(/\\[a-zA-Z]+/g, command => COMMANDS[command] ?? command);
  return text;
}

function nodeToText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(nodeToText).join('');
  }
  return '';
}

interface MathTextProps {
  children?: React.ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
}

export default function MathText({
  children,
  style,
  numberOfLines,
}: MathTextProps) {
  const colors = useAppColors();
  return (
    <Text
      style={[styles.math, {color: colors.text}, style]}
      numberOfLines={numberOfLines}
    >
      {formatLatex(nodeToText(children))}
    </Text>
  );
}

const styles = StyleSheet.create({
  math: {
    fontFamily: Platform.select({
      ios: 'Georgia',
      android: 'serif',
      default: 'serif',
    }),
  },
});
