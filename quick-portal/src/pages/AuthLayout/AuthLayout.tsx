import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from '@tanstack/react-router';
import { Avatar, Burger, Button, Container, Group, Menu } from '@mantine/core';
import type { Business } from '@/api/types';
import logoUrl from '@/assets/quick-digital-icon.svg?url';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { clearUserData } from '@/hooks/auth/session';
import { useLogout } from '@/hooks/auth/useLogout';
import { useMe } from '@/hooks/auth/useMe';
import { useSession } from '@/hooks/auth/useSession';
import { useBusinesses } from '@/hooks/business/useBusinesses';
import { useSelectedBusiness, type SelectedBusiness } from '@/hooks/business/useSelectedBusiness';
import { BusinessAutocomplete } from './BusinessAutocomplete';
import classes from './AuthLayout.module.css';

export function AuthLayout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const session = useSession();
  const { data: me } = useMe();
  const logout = useLogout();
  const {
    data: businesses,
    isError: businessesError,
    refetch: refetchBusinesses,
  } = useBusinesses();
  const selection = useSelectedBusiness();
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
        <div className={classes.bar}>
          <Group gap="sm" wrap="nowrap" className={classes.start}>
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

          <BusinessAutocomplete className={classes.business} />

          <Menu position="bottom-end" shadow="md">
            <Menu.Target>
              <Avatar
                component="button"
                type="button"
                className={`${classes.avatarButton} ${classes.end}`}
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
        </div>
      </header>
      <main className={classes.main}>
        <BusinessGate
          status={selection.status}
          businesses={businesses}
          error={businessesError}
          onRetry={() => void refetchBusinesses()}
        >
          {children}
        </BusinessGate>
      </main>
    </>
  );
}

/**
 * Every page under the layout is scoped to a business: its content renders
 * only once one is selected. Nothing renders until the selection is read
 * (after mount) and the business list is loaded; a failed list shows an
 * error with a retry instead.
 */
function BusinessGate({
  status,
  businesses,
  error,
  onRetry,
  children,
}: {
  status: SelectedBusiness['status'];
  businesses: Business[] | undefined;
  error: boolean;
  onRetry: () => void;
  children: React.ReactNode;
}) {
  // The selection cannot be checked against a list that failed to load.
  if (error) {
    return (
      <Container size="lg" px={0}>
        <EmptyState
          error
          message="Não foi possível carregar as empresas."
          action={<Button onClick={onRetry}>Tentar novamente</Button>}
        />
      </Container>
    );
  }
  if (status === 'unknown' || !businesses) {
    return null;
  }
  if (status === 'selected') {
    return children;
  }
  return (
    <Container size="lg" px={0}>
      <EmptyState
        message={
          businesses.length === 0
            ? 'Você não tem acesso a nenhuma empresa'
            : 'Selecione uma empresa para visualizar as informações.'
        }
      />
    </Container>
  );
}
