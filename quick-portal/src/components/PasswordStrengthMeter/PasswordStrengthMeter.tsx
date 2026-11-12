import { List, Progress, Stack, Text } from '@mantine/core';
import type { PasswordEvaluation } from '@/lib/password/strength';
import { PASSWORD_SCORES, strengthColor, strengthLabel } from '@/lib/password/strength-labels';

export type PasswordStrengthMeterProps = {
  /** Evaluation from `usePasswordStrength`; `null` renders an empty, neutral meter. */
  result: PasswordEvaluation | null;
};

/** Feedback, a 5-step bar (one step per score) and the score's label. Purely informative. */
export function PasswordStrengthMeter({ result }: PasswordStrengthMeterProps) {
  const score = result?.score ?? 0;
  const suggestions = result?.suggestions ?? [];
  const color = strengthColor(score);
  const label = strengthLabel(score);

  return (
    <Stack gap={4} aria-live="polite">
      {suggestions.length > 0 && (
        <List size="xs" c="dimmed">
          {suggestions.map((suggestion) => (
            <List.Item key={suggestion}>{suggestion}</List.Item>
          ))}
        </List>
      )}
      <Progress.Root
        size="sm"
        role="progressbar"
        aria-label="Força da senha"
        aria-valuemin={0}
        aria-valuemax={4}
        aria-valuenow={score}
        aria-valuetext={label}
      >
        {PASSWORD_SCORES.map((step) => (
          <Progress.Section
            key={step}
            value={100 / PASSWORD_SCORES.length}
            color={result && step <= score ? color : 'gray.3'}
            withAria={false}
          />
        ))}
      </Progress.Root>
      <Text size="xs" fw={500} c={result ? color : 'dimmed'}>
        {label}
      </Text>
    </Stack>
  );
}
