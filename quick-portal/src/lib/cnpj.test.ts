import { normalizeCnpj } from './cnpj';

describe('normalizeCnpj', () => {
  it('strips punctuation', () => {
    expect(normalizeCnpj('61.805.098/0001-49')).toBe('61805098000149');
    expect(normalizeCnpj(' 61805098000149 ')).toBe('61805098000149');
  });

  it('uppercases alphanumeric CNPJs', () => {
    expect(normalizeCnpj('12.abc.345/01de-35')).toBe('12ABC34501DE35');
  });

  it('rejects anything but 14 characters', () => {
    expect(normalizeCnpj('6180509800014')).toBeNull();
    expect(normalizeCnpj('618050980001490')).toBeNull();
    expect(normalizeCnpj('')).toBeNull();
  });

  it('drops symbols and accented letters instead of keeping them', () => {
    expect(normalizeCnpj('6180509800014É')).toBeNull();
    expect(normalizeCnpj('618050980001$9')).toBeNull();
  });
});
