import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Avatar, Burger, Group, Menu } from '@mantine/core';
import logoUrl from '@/assets/quick-digital-icon.svg?url';
import { clearUserData } from '@/hooks/auth/session';
import { useLogout } from '@/hooks/auth/useLogout';
import { useMe } from '@/hooks/auth/useMe';
import { useSession } from '@/hooks/auth/useSession';
import classes from './AuthLayout.module.css';

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSession();
  const { data: me } = useMe();
  const logout = useLogout();
  const [menuOpened, setMenuOpened] = useState(false);

  const initials = me.email.slice(0, 2).toUpperCase();

  // Leaves as soon as the session is gone: after "Sair", or when Quick API
  // rejected the access token.
  useEffect(() => {
    if (session.data === null) {
      void navigate({ to: '/' }).then(() => clearUserData(queryClient));
    }
  }, [session.data, navigate, queryClient]);

  return (
    <>
      <header className={classes.header}>
        <Group justify="space-between" wrap="nowrap">
          <Group gap="sm" wrap="nowrap">
            <Link to="/inicio" aria-label="Início">
              <img src={logoUrl} alt="Quick Digital" className={classes.logo} />
            </Link>
            <Menu opened={menuOpened} onChange={setMenuOpened} position="bottom-start" shadow="md">
              <Menu.Target>
                <Burger
                  opened={menuOpened}
                  size="sm"
                  aria-label={menuOpened ? 'Fechar menu' : 'Abrir menu'}
                />
              </Menu.Target>
              <Menu.Dropdown>
                <Menu.Item onClick={() => navigate({ to: '/cadastro-cielo' })}>
                  Cadastrar Cielo
                </Menu.Item>
              </Menu.Dropdown>
            </Menu>
          </Group>

          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <Avatar
                component="button"
                type="button"
                className={classes.avatarButton}
                name={initials}
                color="initials"
                aria-label={`Conta de ${me.email}`}
              >
                {initials}
              </Avatar>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Label>{me.email}</Menu.Label>
              <Menu.Item onClick={() => logout.mutate()} disabled={logout.isPending}>
                Sair
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </header>
      <main className={classes.main}>{children}</main>
    </>
  );
}
