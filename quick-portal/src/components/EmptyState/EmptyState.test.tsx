import { render, screen } from '@test-utils';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="Nenhum negócio disponível." />);
    expect(screen.getByText('Nenhum negócio disponível.')).toBeInTheDocument();
  });
});
