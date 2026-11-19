import { Container } from '@mantine/core';
import { EmptyState } from '@/components/EmptyState/EmptyState';
import { useBusinesses } from '@/hooks/business/useBusinesses';
import { useSelectedBusiness } from '@/hooks/business/useSelectedBusiness';

export function HomePage() {
  const { data: businesses } = useBusinesses();
  const selection = useSelectedBusiness();

  // Nothing until the selection is read (after mount) and the list is loaded,
  // and nothing yet for a selected business.
  if (selection.status !== 'none' || !businesses) {
    return null;
  }

  return (
    <Container size="lg" px={0}>
      <EmptyState
        message={
          businesses.length === 0
            ? 'Nenhum negócio disponível.'
            : 'Selecione um negócio para visualizar as informações.'
        }
      />
    </Container>
  );
}
