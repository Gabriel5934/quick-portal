import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH, passwordLength, passwordSchema } from './policy';

const issues = (value: string) => {
  const result = passwordSchema.safeParse(value);
  return result.success ? [] : result.error.issues.map((issue) => issue.message);
};

describe('passwordSchema', () => {
  it('requires a password', () => {
    expect(issues('')).toEqual(['Informe a senha']);
  });

  it('enforces the length boundaries', () => {
    expect(PASSWORD_MIN_LENGTH).toBe(15);
    expect(PASSWORD_MAX_LENGTH).toBe(64);
    expect(issues('a'.repeat(14))).toEqual(['A senha deve ter pelo menos 15 caracteres']);
    expect(issues('a'.repeat(15))).toEqual([]);
    expect(issues('a'.repeat(64))).toEqual([]);
    expect(issues('a'.repeat(65))).toEqual(['A senha deve ter no máximo 64 caracteres']);
  });

  it('counts code points, so an emoji is one character', () => {
    const emoji = '🔐';
    expect(emoji.length).toBe(2);
    expect(passwordLength(emoji)).toBe(1);
    expect(issues('a'.repeat(14) + emoji)).toEqual([]);
    expect(issues('a'.repeat(13) + emoji)).toHaveLength(1);
    expect(issues(emoji.repeat(64))).toEqual([]);
    expect(issues(emoji.repeat(65))).toHaveLength(1);
  });

  it('preserves whitespace and unicode', () => {
    const value = '  çãé ñ 漢字 tab\there  ';
    expect(passwordSchema.parse(value)).toBe(value);
    expect(issues(' '.repeat(15))).toEqual([]);
  });
});
