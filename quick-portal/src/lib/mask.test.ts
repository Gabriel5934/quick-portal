import { applyMask, formatDocument, formatPhone, MASKS, unmask } from './mask';

describe('applyMask', () => {
  it('formats a phone and drops trailing literals', () => {
    expect(applyMask('11987654321', MASKS.phone)).toBe('(11) 98765-4321');
    expect(applyMask('11', MASKS.phone)).toBe('(11');
    expect(applyMask('abc', MASKS.phone)).toBe('');
  });

  it('formats landlines until an 11th digit is typed', () => {
    expect(formatPhone('2133333334')).toBe('(21) 3333-3334');
    expect(formatPhone('21987654321')).toBe('(21) 98765-4321');
    expect(formatPhone('(21) 3333-3334' + '5')).toBe('(21) 33333-3345');
  });

  it('drops letters from CPFs but keeps them in CNPJs', () => {
    expect(applyMask('ABC', MASKS.cpf)).toBe('');
    expect(applyMask('52839789801', MASKS.cpf)).toBe('528.397.898-01');
    expect(applyMask('12abc345', MASKS.cnpj)).toBe('12.ABC.345');
  });

  it('uppercases alphanumeric CNPJs', () => {
    expect(applyMask('12abc34501de35', MASKS.cnpj)).toBe('12.ABC.345/01DE-35');
  });

  it('truncates input longer than the pattern', () => {
    expect(applyMask('0131010099', MASKS.zipCode)).toBe('01310-100');
  });
});

describe('unmask / formatDocument', () => {
  it('round-trips documents', () => {
    expect(unmask('528.397.898-01')).toBe('52839789801');
    expect(formatDocument('61805098000149', 'CNPJ')).toBe('61.805.098/0001-49');
    expect(formatDocument('52839789801', 'CPF')).toBe('528.397.898-01');
  });
});
