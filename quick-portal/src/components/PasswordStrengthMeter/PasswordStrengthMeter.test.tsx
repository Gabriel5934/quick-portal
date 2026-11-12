import { render, screen } from '@test-utils';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

describe('PasswordStrengthMeter', () => {
  it('renders an empty bar and the lowest label without a result', () => {
    render(<PasswordStrengthMeter result={null} />);
    const bar = screen.getByRole('progressbar', { name: 'Força da senha' });
    expect(bar).toHaveAttribute('aria-valuenow', '0');
    expect(screen.getByText('Risco Muito Alto')).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('shows the suggestions above the bar and the label below it, without the warning', () => {
    render(
      <PasswordStrengthMeter
        result={{ score: 3, warning: 'Aviso', suggestions: ['Dica'], pwned: false }}
      />
    );
    const bar = screen.getByRole('progressbar', { name: 'Força da senha' });
    expect(bar).toHaveAttribute('aria-valuenow', '3');
    expect(bar).toHaveAttribute('aria-valuetext', 'Seguro');
    const suggestion = screen.getByText('Dica');
    const label = screen.getByText('Seguro');
    expect(suggestion.compareDocumentPosition(bar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(bar.compareDocumentPosition(label) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.queryByText('Aviso')).not.toBeInTheDocument();
  });
});
