import { Link } from '@tanstack/react-router';
import { Anchor, Container, Stack, Text, Title } from '@mantine/core';
import { ApiError, UNEXPECTED_ERROR_MESSAGE } from '@/lib/api-error';

type ErrorPageProps = { title?: string; error?: unknown };

export function ErrorPage({ title = 'Algo deu errado', error }: ErrorPageProps) {
  // Only our own messages are shown; anything else may be in English or leak details.
  const message =
    error instanceof ApiError ? error.message : error ? UNEXPECTED_ERROR_MESSAGE : null;
  return (
    <Container size="sm" py="xl">
      <Stack gap="sm">
        <Title order={1} size="h2">
          {title}
        </Title>
        {message && <Text c="dimmed">{message}</Text>}
        <Anchor component={Link} to="/">
          Voltar ao início
        </Anchor>
      </Stack>
    </Container>
  );
}
