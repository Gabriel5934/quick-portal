import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';
import {
  Alert,
  Anchor,
  Button,
  Group,
  Paper,
  PasswordInput,
  Stack,
  Text,
  TextInput,
  Title,
} from '@mantine/core';
import logoUrl from '@/assets/quick-digital-icon.svg?url';
import { useLogin } from '@/hooks/auth/useLogin';
import classes from './LoginPage.module.css';

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Informe o e-mail').pipe(z.email('E-mail inválido')),
  password: z.string().min(1, 'Informe a senha'),
});

type LoginValues = z.infer<typeof loginSchema>;

export function LoginPage() {
  const navigate = useNavigate();
  const login = useLogin();
  const { control, handleSubmit } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const onSubmit = handleSubmit((values) =>
    login.mutate(values, { onSuccess: () => navigate({ to: '/inicio' }) })
  );

  return (
    <main className={classes.root}>
      <Paper
        className={classes.card}
        withBorder
        shadow="sm"
        radius="md"
        p={{ base: 'lg', sm: 'xl' }}
      >
        <form onSubmit={onSubmit} noValidate>
          <Stack gap="md">
            <Group gap="sm">
              <img src={logoUrl} alt="" className={classes.logo} />
              <div>
                <Title order={1} size="h3">
                  Entrar
                </Title>
                <Text size="sm" c="dimmed">
                  Acesse o Quick Portal com seu e-mail e senha.
                </Text>
              </div>
            </Group>

            {login.error && (
              <Alert color="red" variant="light" title="Não foi possível entrar">
                {login.error.message}
              </Alert>
            )}

            <Controller
              control={control}
              name="email"
              render={({ field, fieldState }) => (
                <TextInput
                  {...field}
                  label="E-mail"
                  type="email"
                  autoComplete="email"
                  placeholder="voce@empresa.com.br"
                  withAsterisk
                  error={fieldState.error?.message}
                />
              )}
            />
            <Controller
              control={control}
              name="password"
              render={({ field, fieldState }) => (
                <PasswordInput
                  {...field}
                  label="Senha"
                  autoComplete="current-password"
                  withAsterisk
                  error={fieldState.error?.message}
                />
              )}
            />
            <Button type="submit" fullWidth loading={login.isPending}>
              Entrar
            </Button>
            <Text size="sm" ta="center">
              Não tem conta?{' '}
              <Anchor component={Link} to="/cadastro">
                Criar conta
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </main>
  );
}
