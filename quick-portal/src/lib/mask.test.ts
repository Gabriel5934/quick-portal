import { applyMask, formatDocument, MASKS, unmask } from './mask';

describe('applyMask', () => {
  it('formats a phone and drops trailing literals', () => {
    expect(applyMask('11987654321', MASKS.phone)).toBe('(11) 98765-4321');
    expect(applyMask('11', MASKS.phone)).toBe('(11');
    expect(applyMask('abc', MASKS.phone)).toBe('');
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
