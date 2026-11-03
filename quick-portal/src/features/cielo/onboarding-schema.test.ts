import { onboardingSchema, toOnboardPayload, type OnboardingFormInput } from './onboarding-schema';

const valid: OnboardingFormInput = {
  contact_name: 'Ana Souza',
  contact_phone: '(11) 98765-4321',
  corporate_name: 'Ana Souza ME',
  document_type: 'CPF',
  document_number: '528.397.898-01',
  birthday_date: '15/04/1990',
  business_activity_id: '2',
  fancy_name: 'Salão da Ana',
  mail_address: 'ana@exemplo.com.br',
  website: '',
  bank_account: {
    bank: '341',
    bank_account_type: 'CheckingAccount',
    number: '12345',
    verifier_digit: '6',
    agency_number: '1234',
    agency_digit: '',
  },
  address: {
    zip_code: '01310-100',
    street: 'Avenida Paulista',
    number: '1000',
    complement: '',
    neighborhood: 'Bela Vista',
    city: 'São Paulo',
    state: 'SP',
  },
};

const messagesFor = (input: OnboardingFormInput, path: string) => {
  const result = onboardingSchema.safeParse(input);
  return result.success
    ? []
    : result.error.issues.filter((issue) => issue.path.join('.') === path).map((i) => i.message);
};

describe('onboardingSchema', () => {
  it('accepts a complete CPF seller', () => {
    expect(onboardingSchema.safeParse(valid).success).toBe(true);
  });

  it('requires birthday and activity only for CPF', () => {
    const cpf = { ...valid, birthday_date: '', business_activity_id: null };
    expect(messagesFor(cpf, 'birthday_date')).toEqual(['Campo obrigatório']);
    expect(messagesFor(cpf, 'business_activity_id')).toEqual(['Selecione a atividade']);

    const cnpj = { ...cpf, document_type: 'CNPJ' as const, document_number: '61.805.098/0001-49' };
    expect(onboardingSchema.safeParse(cnpj).success).toBe(true);
  });

  it('rejects invalid and future birthdays', () => {
    expect(messagesFor({ ...valid, birthday_date: '31/02/1990' }, 'birthday_date')).toEqual([
      'Data inválida',
    ]);
    expect(messagesFor({ ...valid, birthday_date: '01/01/2999' }, 'birthday_date')).toEqual([
      'A data não pode estar no futuro',
    ]);
  });

  it('checks the document length for its type', () => {
    expect(messagesFor({ ...valid, document_number: '528.397.898' }, 'document_number')).toEqual([
      'CPF incompleto',
    ]);
  });
});

describe('toOnboardPayload', () => {
  it('unmasks, converts the date and defaults the agency digit', () => {
    const payload = toOnboardPayload(onboardingSchema.parse(valid));
    expect(payload).toMatchObject({
      contact_phone: '11987654321',
      document_number: '52839789801',
      birthday_date: '1990/04/15',
      business_activity_id: '2',
      bank_account: { agency_digit: 'x' },
      address: { zip_code: '01310100' },
    });
    expect(payload).not.toHaveProperty('website');
    expect(payload.address).not.toHaveProperty('complement');
  });

  it('omits CPF-only fields for CNPJ sellers', () => {
    const payload = toOnboardPayload(
      onboardingSchema.parse({
        ...valid,
        document_type: 'CNPJ',
        document_number: '12.ABC.345/01DE-35',
      })
    );
    expect(payload.document_number).toBe('12ABC34501DE35');
    expect(payload).not.toHaveProperty('birthday_date');
    expect(payload).not.toHaveProperty('business_activity_id');
  });
});
