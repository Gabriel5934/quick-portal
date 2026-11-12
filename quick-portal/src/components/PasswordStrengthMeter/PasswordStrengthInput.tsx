import { PasswordInput, Stack, type PasswordInputProps } from '@mantine/core';
import { usePasswordStrength } from '@/hooks/password/usePasswordStrength';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

export type PasswordStrengthInputProps = Omit<PasswordInputProps, 'value'> & {
  value: string;
  /** Used to penalize passwords built from the user's e-mail. */
  email?: string | null;
};

/** Mantine `PasswordInput` with the strength meter below it. Never blocks submission. */
export function PasswordStrengthInput({ email, ...props }: PasswordStrengthInputProps) {
  const { result } = usePasswordStrength(props.value, email);
  return (
    <Stack gap="xs">
      <PasswordInput autoComplete="new-password" {...props} />
      <PasswordStrengthMeter result={result} />
    </Stack>
  );
}
