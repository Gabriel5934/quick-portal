import { strengthColor, strengthLabel } from './strength-labels';

describe('strengthLabel', () => {
  it('maps each score to its pt-BR adjective', () => {
    expect(strengthLabel(0)).toBe('Risco Muito Alto');
    expect(strengthLabel(1)).toBe('Risco Alto');
    expect(strengthLabel(2)).toBe('Risco Médio');
    expect(strengthLabel(3)).toBe('Seguro');
    expect(strengthLabel(4)).toBe('Muito Seguro');
  });
});

describe('strengthColor', () => {
  it('is red up to 2, yellow at 3 and green at 4', () => {
    expect(strengthColor(0)).toBe('red');
    expect(strengthColor(1)).toBe('red');
    expect(strengthColor(2)).toBe('red');
    expect(strengthColor(3)).toBe('yellow');
    expect(strengthColor(4)).toBe('green');
  });
});
