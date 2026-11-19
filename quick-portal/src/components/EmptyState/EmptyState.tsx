import { Group, Paper, Text } from '@mantine/core';

export function EmptyState({
  message,
  error = false,
  action,
}: {
  message: string;
  error?: boolean;
  action?: React.ReactNode;
}) {
  return (
    <Paper withBorder radius="md" role={error ? 'alert' : undefined}>
      <Text c={error ? 'red' : 'dimmed'} ta="center" p="xl">
        {message}
      </Text>
      {action && (
        <Group justify="center" pb="xl">
          {action}
        </Group>
      )}
    </Paper>
  );
}
