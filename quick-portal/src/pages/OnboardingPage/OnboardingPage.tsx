import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useNavigate } from '@tanstack/react-router';
import { useForm, useWatch } from 'react-hook-form';
import {
  Alert,
  Button,
  Container,
  Group,
  Loader,
  Paper,
  SimpleGrid,
  Stack,
  Text,
  Title,
} from '@mantine/core';
import { notifications } from '@mantine/notifications';
import {
  BANK_ACCOUNT_TYPE_OPTIONS,
  DOCUMENT_TYPE_OPTIONS,
  onboardingDefaultValues,
  onboardingSchema,
  toOnboardPayload,
  type OnboardingFormInput,
  type OnboardingFormValues,
} from '@/features/cielo/onboarding-schema';
import { BANK_OPTIONS } from '@/features/cielo/options/banks';
import { BUSINESS_ACTIVITY_OPTIONS } from '@/features/cielo/options/business-activities';
import { useCep } from '@/hooks/brasil-api/useCep';
import { useOnboardSeller } from '@/hooks/cielo/useOnboardSeller';
import { applyMask, documentMask, MASKS, type DocumentType } from '@/lib/mask';
import { SelectField, TextField } from './fields';
import classes from './OnboardingPage.module.css';

/** Address fields filled from BrasilAPI's CEP lookup. */
const MANAGED_ADDRESS_FIELDS = ['street', 'neighborhood', 'city', 'state'] as const;
type ManagedAddressField = (typeof MANAGED_ADDRESS_FIELDS)[number];

const NOT_EDITABLE: Record<ManagedAddressField, boolean> = {
  street: false,
  neighborhood: false,
  city: false,
  state: false,
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Paper withBorder radius="md" p={{ base: 'md', sm: 'lg' }}>
      <Title order={2} size="h4" mb="md">
        {title}
      </Title>
      <SimpleGrid cols={{ base: 1, sm: 2 }} spacing="md" verticalSpacing="md">
        {children}
      </SimpleGrid>
    </Paper>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const onboard = useOnboardSeller();
  const { control, handleSubmit, setValue, getValues } = useForm<
    OnboardingFormInput,
    unknown,
    OnboardingFormValues
  >({
    resolver: zodResolver(onboardingSchema),
    defaultValues: onboardingDefaultValues,
    mode: 'onTouched',
  });

  const documentType = useWatch({ control, name: 'document_type' }) as DocumentType | undefined;
  const zipCode = useWatch({ control, name: 'address.zip_code' });
  const cep = useCep(zipCode);
  // A managed field becomes editable only when BrasilAPI has no value for it
  // (e.g. a city-wide CEP without street or neighborhood).
  const [editable, setEditable] = useState(NOT_EDITABLE);

  useEffect(() => {
    const data = cep.data;
    for (const field of MANAGED_ADDRESS_FIELDS) {
      const value = data?.[field] ?? '';
      if (getValues(`address.${field}`) !== value) {
        setValue(`address.${field}`, value, { shouldValidate: Boolean(data) });
      }
    }
    setEditable(
      data
        ? {
            street: !data.street,
            neighborhood: !data.neighborhood,
            city: !data.city,
            state: !data.state,
          }
        : NOT_EDITABLE
    );
  }, [cep.data, getValues, setValue]);

  const onSubmit = handleSubmit((values) =>
    onboard.mutate(toOnboardPayload(values), {
      onSuccess: (seller) => {
        notifications.show({
          color: 'green',
          title: 'Seller cadastrado',
          message: `${seller.fancy_name} foi cadastrado na Cielo.`,
        });
        void navigate({ to: '/inicio' });
      },
    })
  );

  const isCpf = documentType === 'CPF';

  return (
    <Container size="md" px={0}>
      <Stack gap="lg">
        <div>
          <Title order={1} size="h2">
            Cadastrar seller Cielo
          </Title>
          <Text c="dimmed" size="sm">
            Preencha os dados do seller para cadastrá-lo na Cielo.
          </Text>
        </div>

        <form onSubmit={onSubmit} noValidate>
          <Stack gap="lg">
            <Section title="Dados do seller">
              <SelectField
                control={control}
                name="document_type"
                label="Tipo de documento"
                placeholder="Selecione"
                withAsterisk
                data={DOCUMENT_TYPE_OPTIONS}
                onValueChange={(value) => {
                  if (value === 'CPF' || value === 'CNPJ') {
                    const current = getValues('document_number');
                    setValue('document_number', applyMask(current, documentMask(value)));
                  }
                }}
              />
              <TextField
                control={control}
                name="document_number"
                label="Número do documento"
                withAsterisk
                disabled={!documentType}
                placeholder={documentType ? documentMask(documentType) : 'Selecione o tipo'}
                mask={documentMask(documentType ?? 'CNPJ')}
                autoCapitalize="characters"
              />
              <TextField
                control={control}
                name="corporate_name"
                label="Razão social"
                withAsterisk
                maxLength={100}
              />
              <TextField
                control={control}
                name="fancy_name"
                label="Nome fantasia"
                withAsterisk
                maxLength={50}
              />
              {isCpf && (
                <>
                  <TextField
                    control={control}
                    name="birthday_date"
                    label="Data de nascimento"
                    withAsterisk
                    placeholder="DD/MM/AAAA"
                    inputMode="numeric"
                    mask={MASKS.date}
                  />
                  <SelectField
                    control={control}
                    name="business_activity_id"
                    label="Atividade"
                    placeholder="Selecione"
                    withAsterisk
                    data={BUSINESS_ACTIVITY_OPTIONS}
                  />
                </>
              )}
              <TextField
                control={control}
                name="mail_address"
                label="E-mail"
                type="email"
                autoComplete="email"
                withAsterisk
                maxLength={50}
              />
              <TextField
                control={control}
                name="website"
                label="Site"
                type="url"
                placeholder="https://"
                maxLength={200}
              />
            </Section>

            <Section title="Contato">
              <TextField
                control={control}
                name="contact_name"
                label="Nome do contato"
                autoComplete="name"
                withAsterisk
                maxLength={100}
              />
              <TextField
                control={control}
                name="contact_phone"
                label="Telefone do contato"
                type="tel"
                autoComplete="tel-national"
                inputMode="numeric"
                placeholder="(00) 00000-0000"
                withAsterisk
                mask={MASKS.phone}
              />
            </Section>

            <Section title="Conta bancária">
              <SelectField
                control={control}
                name="bank_account.bank"
                label="Banco"
                placeholder="Selecione"
                withAsterisk
                data={BANK_OPTIONS}
              />
              <SelectField
                control={control}
                name="bank_account.bank_account_type"
                label="Tipo de conta"
                placeholder="Selecione"
                withAsterisk
                data={BANK_ACCOUNT_TYPE_OPTIONS}
              />
              <TextField
                control={control}
                name="bank_account.agency_number"
                label="Agência"
                inputMode="numeric"
                withAsterisk
                maxLength={4}
              />
              <TextField
                control={control}
                name="bank_account.agency_digit"
                label="Dígito da agência"
                description="Deixe em branco se a agência não tiver dígito"
                inputMode="numeric"
                maxLength={1}
              />
              <TextField
                control={control}
                name="bank_account.number"
                label="Número da conta"
                inputMode="numeric"
                withAsterisk
                maxLength={10}
              />
              <TextField
                control={control}
                name="bank_account.verifier_digit"
                label="Dígito da conta"
                inputMode="numeric"
                withAsterisk
                maxLength={1}
              />
            </Section>

            <Section title="Endereço">
              <TextField
                control={control}
                name="address.zip_code"
                label="CEP"
                inputMode="numeric"
                autoComplete="postal-code"
                placeholder="00000-000"
                withAsterisk
                mask={MASKS.zipCode}
                rightSection={cep.isFetching ? <Loader size="xs" /> : null}
                extraError={cep.error?.message}
              />
              <TextField
                control={control}
                name="address.street"
                label="Rua"
                withAsterisk
                readOnly={!editable.street}
                className={editable.street ? undefined : classes.managed}
                maxLength={100}
              />
              <TextField
                control={control}
                name="address.number"
                label="Número"
                inputMode="numeric"
                withAsterisk
                maxLength={15}
              />
              <TextField
                control={control}
                name="address.complement"
                label="Complemento"
                maxLength={80}
              />
              <TextField
                control={control}
                name="address.neighborhood"
                label="Bairro"
                withAsterisk
                readOnly={!editable.neighborhood}
                className={editable.neighborhood ? undefined : classes.managed}
                maxLength={50}
              />
              <SimpleGrid cols={{ base: 1, xs: 2 }} spacing="md">
                <TextField
                  control={control}
                  name="address.city"
                  label="Cidade"
                  withAsterisk
                  readOnly={!editable.city}
                  className={editable.city ? undefined : classes.managed}
                  maxLength={50}
                />
                <TextField
                  control={control}
                  name="address.state"
                  label="UF"
                  withAsterisk
                  readOnly={!editable.state}
                  className={editable.state ? undefined : classes.managed}
                  maxLength={2}
                />
              </SimpleGrid>
            </Section>

            {onboard.error && (
              <Alert color="red" variant="light" title="Não foi possível cadastrar o seller">
                {onboard.error.message}
              </Alert>
            )}

            <Group justify="flex-end" gap="sm" className={classes.actions}>
              <Button component={Link} to="/inicio" variant="default">
                Cancelar
              </Button>
              <Button type="submit" loading={onboard.isPending}>
                Cadastrar seller
              </Button>
            </Group>
          </Stack>
        </form>
      </Stack>
    </Container>
  );
}
