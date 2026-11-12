import type { MantineColor } from '@mantine/core';

export type PasswordScore = 0 | 1 | 2 | 3 | 4;

export const PASSWORD_SCORES: readonly PasswordScore[] = [0, 1, 2, 3, 4];

const LABELS: Record<PasswordScore, string> = {
  0: 'Risco Muito Alto',
  1: 'Risco Alto',
  2: 'Risco Médio',
  3: 'Seguro',
  4: 'Muito Seguro',
};

export function strengthLabel(score: PasswordScore): string {
  return LABELS[score];
}

/** Mantine theme color for a score: 0-2 red, 3 yellow, 4 green. */
export function strengthColor(score: PasswordScore): MantineColor {
  if (score === 4) {
    return 'green';
  }
  if (score === 3) {
    return 'yellow';
  }
  return 'red';
}
