import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { Controller, useForm } from 'react-hook-form';
import { Alert, Anchor, Button, Group, Paper, Stack, Text, TextInput, Title } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import logoUrl from '@/assets/quick-digital-icon.svg?url';
import { PasswordStrengthInput } from '@/components/PasswordStrengthMeter/PasswordStrengthInput';
import { useRegister } from '@/hooks/auth/useRegister';
import { createRegisterSchema, type RegisterValues } from './register-schema';
import classes from './RegisterPage.module.css';

const registerSchema = createRegisterSchema();

export function RegisterPage() {
  const navigate = useNavigate();
  const register = useRegister();
  const { control, handleSubmit, watch } = useForm<RegisterValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '' },
  });
  const email = watch('email');

  const onSubmit = handleSubmit((values) =>
    register.mutate(values, {
      onSuccess: () => {
        notifications.show({
          color: 'green',
          title: 'Conta criada',
          message: 'Conta criada. Entre para continuar.',
        });
        void navigate({ to: '/' });
      },
    })
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
                  Criar conta
                </Title>
                <Text size="sm" c="dimmed">
                  Cadastre-se no Quick Portal com seu e-mail e uma senha.
                </Text>
              </div>
            </Group>

            {register.error && (
              <Alert color="red" variant="light" title="Não foi possível criar a conta">
                {register.error.message}
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
                <PasswordStrengthInput
                  {...field}
                  email={email}
                  label="Senha"
                  withAsterisk
                  error={fieldState.error?.message}
                />
              )}
            />
            <Button type="submit" fullWidth loading={register.isPending}>
              Criar conta
            </Button>
            <Text size="sm" ta="center">
              <Anchor component={Link} to="/">
                Já tenho conta
              </Anchor>
            </Text>
          </Stack>
        </form>
      </Paper>
    </main>
  );
}
