import { render, screen } from '@test-utils';
import { Button } from '@mantine/core';
import { EmptyState } from './EmptyState';

describe('EmptyState', () => {
  it('renders the message', () => {
    render(<EmptyState message="Nenhum negócio disponível." />);
    expect(screen.getByText('Nenhum negócio disponível.')).toBeInTheDocument();
  });

  it('renders the message dimmed by default, with no action', () => {
    render(<EmptyState message="Nenhum negócio disponível." />);
    expect(screen.getByText('Nenhum negócio disponível.').getAttribute('style')).toContain(
      '--mantine-color-dimmed'
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the message in red when it is an error', () => {
    render(<EmptyState error message="Não foi possível carregar." />);
    expect(screen.getByText('Não foi possível carregar.').getAttribute('style')).toContain(
      '--mantine-color-red'
    );
  });

  it('announces the message as an alert when it is an error', () => {
    render(<EmptyState error message="Não foi possível carregar." />);
    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível carregar.');
  });

  it('renders the action below the message', () => {
    render(
      <EmptyState
        error
        message="Não foi possível carregar."
        action={<Button>Tentar novamente</Button>}
      />
    );
    expect(screen.getByText('Não foi possível carregar.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
  });
});
