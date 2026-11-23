import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Code, Container, Group, Paper, Stack, Text, Title } from '@mantine/core';
import { useClipboard } from '@mantine/hooks';
import { businessesQueryKey, useBusinesses } from '@/hooks/business/useBusinesses';
import { useSelectedBusiness } from '@/hooks/business/useSelectedBusiness';
import { useGenerateCredentials, useRotateCredentials } from '@/hooks/oauth/useClientCredentials';
import { ApiError, UNEXPECTED_ERROR_MESSAGE } from '@/lib/api-error';
import { normalizeCnpj } from '@/lib/cnpj';
import classes from './IntegrationPage.module.css';

export const ROTATE_CONFLICT_MESSAGE =
  'Não foi possível rotacionar o client secret: as credenciais acabaram de ser alteradas. ' +
  'Os dados da empresa foram atualizados; tente novamente.';

export const COPY_FAILED_MESSAGE =
  'Não foi possível copiar. Selecione o texto e copie manualmente.';

/**
 * Route `/integracao`: the selected business's integration credentials.
 * The `client_id` comes from the business list (`GET /businesses`); the
 * secret is only ever shown right after a generate or a rotate.
 */
export function IntegrationPage() {
  const { cnpj } = useSelectedBusiness();
  const { data: businesses } = useBusinesses();
  // The auth layout renders the page only with a selected business.
  if (!cnpj) {
    return null;
  }
  const business = businesses?.find((item) => normalizeCnpj(item.cnpj) === cnpj);
  // Keyed by business: switching businesses drops the state, secret included.
  return (
    <ClientCredentialsPanel
      key={cnpj}
      businessCnpj={cnpj}
      knownClientId={business?.client_id ?? null}
    />
  );
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : UNEXPECTED_ERROR_MESSAGE;
}

function ClientCredentialsPanel({
  businessCnpj,
  knownClientId,
}: {
  businessCnpj: string;
  knownClientId: string | null;
}) {
  const queryClient = useQueryClient();
  const generate = useGenerateCredentials();
  const rotate = useRotateCredentials();
  // Returned by a generate or rotate in this visit, ahead of the business list.
  const [freshClientId, setFreshClientId] = useState<string | null>(null);
  const clientId = freshClientId ?? knownClientId;
  // The plaintext secret lives only in this state: it is gone once the page
  // unmounts (navigation, reload, sign-out) and is never stored or cached.
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmingRotate, setConfirmingRotate] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // Holds only the copied/error flags; the secret is passed per call.
  const clipboard = useClipboard();

  const busy = generate.isPending || rotate.isPending;

  // Refreshes the client_id; the business list never carries the secret.
  const refreshBusinesses = () =>
    void queryClient.invalidateQueries({ queryKey: businessesQueryKey });

  const onGenerate = async () => {
    setError(null);
    setNotice(null);
    clipboard.reset();
    try {
      const result = await generate.mutateAsync(businessCnpj);
      if (result.status === 'created') {
        setFreshClientId(result.credentials.client_id);
        setSecret(result.credentials.client_secret);
      } else {
        setFreshClientId(result.clientId);
        setSecret(null);
        setNotice('Esta empresa já possui credenciais. O client secret não pode ser exibido.');
      }
      refreshBusinesses();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      // Drops the response (and its secret) from the mutation state.
      generate.reset();
    }
  };

  const onRotate = async () => {
    setConfirmingRotate(false);
    setError(null);
    setNotice(null);
    clipboard.reset();
    // Any secret on screen stays until the outcome is known: a failure other
    // than 409 may mean the rotation never committed, so it may still work.
    try {
      const credentials = await rotate.mutateAsync(businessCnpj);
      setFreshClientId(credentials.client_id);
      setSecret(credentials.client_secret);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        // The credentials changed elsewhere, so the secret shown is stale.
        // Keeps the known client_id on screen and refetches the list.
        setSecret(null);
        setNotice(ROTATE_CONFLICT_MESSAGE);
        refreshBusinesses();
      } else {
        setError(errorMessage(caught));
      }
    } finally {
      rotate.reset();
    }
  };

  return (
    <Container size="md" px={0}>
      <Stack gap="lg">
        <div>
          <Title order={1} size="h2">
            Integração
          </Title>
          <Text c="dimmed" size="sm">
            Credenciais para integrar os sistemas da empresa à Quick API.
          </Text>
        </div>

        <Paper withBorder radius="md" p={{ base: 'md', sm: 'lg' }}>
          {clientId ? (
            <Stack gap="md">
              <div>
                <Text fw={500} size="sm">
                  Client ID
                </Text>
                <Code block className={classes.credential} data-testid="client-id">
                  {clientId}
                </Code>
              </div>
              {confirmingRotate ? (
                <Alert color="red" variant="light" title="Rotacionar o client secret?">
                  <Stack gap="sm">
                    <Text size="sm">
                      O client secret atual deixará de funcionar imediatamente e as sessões das
                      integrações serão encerradas.
                    </Text>
                    <Group gap="sm">
                      <Button color="red" onClick={() => void onRotate()}>
                        Confirmar rotação
                      </Button>
                      <Button variant="default" onClick={() => setConfirmingRotate(false)}>
                        Cancelar
                      </Button>
                    </Group>
                  </Stack>
                </Alert>
              ) : (
                <Group>
                  <Button
                    variant="outline"
                    color="red"
                    loading={rotate.isPending}
                    disabled={busy}
                    onClick={() => setConfirmingRotate(true)}
                  >
                    Rotacionar client secret
                  </Button>
                </Group>
              )}
            </Stack>
          ) : (
            <Stack gap="md" align="flex-start">
              <Text size="sm">
                Esta empresa ainda não possui credenciais. Gere um client_id e um client secret para
                integrar os sistemas da empresa.
              </Text>
              <Button
                loading={generate.isPending}
                disabled={busy}
                onClick={() => void onGenerate()}
              >
                Gerar credenciais
              </Button>
            </Stack>
          )}
        </Paper>

        {secret && (
          <Alert
            color="yellow"
            variant="light"
            title="Copie o client secret agora"
            aria-label="Client secret"
            classNames={{ body: classes.alertBody }}
          >
            <Stack gap="sm">
              <Text size="sm">
                Este client secret não será exibido novamente. Guarde-o em um local seguro antes de
                sair desta página.
              </Text>
              <Code block className={classes.credential} data-testid="client-secret">
                {secret}
              </Code>
              <Group>
                <Button
                  variant="light"
                  color={clipboard.copied ? 'teal' : 'blue'}
                  onClick={() => clipboard.copy(secret)}
                >
                  {clipboard.copied ? 'Copiado' : 'Copiar client secret'}
                </Button>
              </Group>
              {clipboard.error && (
                <Text size="sm" c="red" role="alert">
                  {COPY_FAILED_MESSAGE}
                </Text>
              )}
            </Stack>
          </Alert>
        )}

        {notice && (
          <Alert color="blue" variant="light">
            {notice}
          </Alert>
        )}

        {error && (
          <Alert color="red" variant="light" title="Não foi possível concluir a operação">
            {error}
          </Alert>
        )}
      </Stack>
    </Container>
  );
}
