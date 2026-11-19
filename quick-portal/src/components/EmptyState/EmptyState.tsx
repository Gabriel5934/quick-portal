import { Paper, Text } from '@mantine/core';

export function EmptyState({ message }: { message: string }) {
  return (
    <Paper withBorder radius="md">
      <Text c="dimmed" ta="center" p="xl">
        {message}
      </Text>
    </Paper>
  );
}
