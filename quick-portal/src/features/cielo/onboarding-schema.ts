import { z } from 'zod';
import type { BankAccountType, OnboardPayload } from '@/api/types';
import { documentMask, maskLength, unmask } from '@/lib/mask';

const REQUIRED = 'Campo obrigatório';
const maxChars = (max: number) => `Máximo de ${max} caracteres`;
const ONLY_DIGITS = 'Use apenas números';
const SINGLE_DIGIT = 'Informe um único dígito';

const requiredText = (max: number) => z.string().trim().min(1, REQUIRED).max(max, maxChars(max));

const requiredDigits = (max: number) =>
  z
    .string()
    .trim()
    .min(1, REQUIRED)
    .regex(/^\d+$/, ONLY_DIGITS)
    .max(max, `Máximo de ${max} dígitos`);

/**
 * A Select value. Refined rather than typed so an empty Select reports its own
 * message without stopping the form-level checks below.
 */
const selected = <T extends string>(message: string, allowed?: readonly T[]) =>
  z
    .string()
    .nullable()
    .optional()
    .refine((value) => !!value && (!allowed || allowed.includes(value as T)), message)
    .transform((value) => value as T);

const httpUrl = z.url({ protocol: /^https?$/, hostname: z.regexes.domain });

/** Parses DD/MM/YYYY into a local date, or null when it is not a real date. */
export function parseBirthday(value: string): Date | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  if (!match) {
    return null;
  }
  const [, day, month, year] = match.map(Number);
  const date = new Date(year, month - 1, day);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    return null;
  }
  return date;
}

export const DOCUMENT_TYPE_OPTIONS = [
  { value: 'CPF', label: 'CPF' },
  { value: 'CNPJ', label: 'CNPJ' },
] as const;

export const BANK_ACCOUNT_TYPE_OPTIONS = [
  { value: 'SavingsAccount', label: 'Conta Poupança' },
  { value: 'CheckingAccount', label: 'Conta Corrente' },
] as const;

export const onboardingSchema = z
  .object({
    contact_name: requiredText(100),
    contact_phone: z
      .string()
      .min(1, REQUIRED)
      .refine((value) => [10, 11].includes(unmask(value).length), 'Telefone incompleto'),
    corporate_name: requiredText(100),
    document_type: z.enum(['CPF', 'CNPJ'], { error: 'Selecione o tipo de documento' }),
    document_number: z.string().min(1, REQUIRED),
    birthday_date: z.string(),
    business_activity_id: z.string().nullable(),
    fancy_name: requiredText(50),
    mail_address: z
      .string()
      .trim()
      .min(1, REQUIRED)
      .max(50, maxChars(50))
      .pipe(z.email('E-mail inválido')),
    website: z
      .string()
      .trim()
      .max(200, maxChars(200))
      .refine(
        (value) => value === '' || httpUrl.safeParse(value).success,
        'URL inválida (ex.: https://exemplo.com.br)'
      ),
    bank_account: z.object({
      bank: selected<string>('Selecione o banco'),
      bank_account_type: selected<BankAccountType>('Selecione o tipo de conta', [
        'CheckingAccount',
        'SavingsAccount',
      ]),
      number: requiredDigits(10),
      verifier_digit: z.string().trim().min(1, REQUIRED).regex(/^\d$/, SINGLE_DIGIT),
      agency_number: requiredDigits(4),
      agency_digit: z.string().trim().regex(/^\d?$/, SINGLE_DIGIT),
    }),
    address: z.object({
      zip_code: z
        .string()
        .min(1, REQUIRED)
        .regex(/^\d{5}-\d{3}$/, 'CEP incompleto'),
      street: requiredText(100),
      number: requiredDigits(15),
      complement: z.string().trim().max(80, maxChars(80)),
      neighborhood: requiredText(50),
      city: requiredText(50),
      state: requiredText(2),
    }),
  })
  .superRefine((values, ctx) => {
    const expected = maskLength(documentMask(values.document_type));
    const raw = unmask(values.document_number);
    if (raw && raw.length !== expected) {
      ctx.addIssue({
        code: 'custom',
        path: ['document_number'],
        message: `${values.document_type} incompleto`,
      });
    }
    // Only CNPJs are alphanumeric; CPFs are digits only.
    const allowedChars = values.document_type === 'CNPJ' ? /^[A-Z0-9.\-/]+$/i : /^[\d.-]+$/;
    if (values.document_number && !allowedChars.test(values.document_number)) {
      ctx.addIssue({
        code: 'custom',
        path: ['document_number'],
        message: values.document_type === 'CNPJ' ? 'Use apenas letras e números' : ONLY_DIGITS,
      });
    }

    if (values.document_type !== 'CPF') {
      return;
    }
    if (!values.birthday_date) {
      ctx.addIssue({ code: 'custom', path: ['birthday_date'], message: REQUIRED });
    } else {
      const birthday = parseBirthday(values.birthday_date);
      if (!birthday) {
        ctx.addIssue({ code: 'custom', path: ['birthday_date'], message: 'Data inválida' });
      } else if (birthday.getTime() > Date.now()) {
        ctx.addIssue({
          code: 'custom',
          path: ['birthday_date'],
          message: 'A data não pode estar no futuro',
        });
      }
    }
    if (!values.business_activity_id) {
      ctx.addIssue({
        code: 'custom',
        path: ['business_activity_id'],
        message: 'Selecione a atividade',
      });
    }
  });

export type OnboardingFormInput = z.input<typeof onboardingSchema>;
export type OnboardingFormValues = z.output<typeof onboardingSchema>;

export const onboardingDefaultValues: OnboardingFormInput = {
  contact_name: '',
  contact_phone: '',
  corporate_name: '',
  // Picked by the user; the Select starts empty.
  document_type: undefined as unknown as OnboardingFormInput['document_type'],
  document_number: '',
  birthday_date: '',
  business_activity_id: null,
  fancy_name: '',
  mail_address: '',
  website: '',
  bank_account: {
    bank: null,
    bank_account_type: null,
    number: '',
    verifier_digit: '',
    agency_number: '',
    agency_digit: '',
  },
  address: {
    zip_code: '',
    street: '',
    number: '',
    complement: '',
    neighborhood: '',
    city: '',
    state: '',
  },
};

/** DD/MM/YYYY -> YYYY/MM/DD, as Cielo expects. */
function toCieloDate(value: string): string {
  const [day, month, year] = value.split('/');
  return `${year}/${month}/${day}`;
}

/** Turns validated form values into the `POST /cielo/onboard` body. */
export function toOnboardPayload(values: OnboardingFormValues): OnboardPayload {
  const isCpf = values.document_type === 'CPF';
  const { bank_account: bank, address } = values;
  return {
    contact_name: values.contact_name,
    // Quick API and Cielo accept at most 11 characters: digits only.
    contact_phone: unmask(values.contact_phone),
    corporate_name: values.corporate_name,
    document_number: unmask(values.document_number),
    document_type: values.document_type,
    fancy_name: values.fancy_name,
    mail_address: values.mail_address,
    ...(values.website ? { website: values.website } : {}),
    ...(isCpf && values.birthday_date ? { birthday_date: toCieloDate(values.birthday_date) } : {}),
    ...(isCpf && values.business_activity_id
      ? { business_activity_id: values.business_activity_id }
      : {}),
    bank_account: {
      bank: bank.bank,
      bank_account_type: bank.bank_account_type,
      number: bank.number,
      verifier_digit: bank.verifier_digit,
      agency_number: bank.agency_number,
      agency_digit: bank.agency_digit || 'x',
    },
    address: {
      street: address.street,
      number: address.number,
      ...(address.complement ? { complement: address.complement } : {}),
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
      // Cielo's ZipCode allows 9 characters, but cielo-mock (and the digits-only
      // convention of the other fields) expects only the 8 digits.
      zip_code: unmask(address.zip_code),
    },
  };
}
