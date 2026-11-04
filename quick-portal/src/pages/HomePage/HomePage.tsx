import { Link } from '@tanstack/react-router';
import { Button, Container, Group, Paper, Table, Text, Title } from '@mantine/core';
import { useSellers } from '@/hooks/cielo/useSellers';
import { formatDocument } from '@/lib/mask';

export function HomePage() {
  const { data: sellers } = useSellers();

  return (
    <Container size="lg" px={0}>
      <Group justify="space-between" align="center" mb="md" gap="sm">
        <Title order={1} size="h2">
          Sellers Cielo
        </Title>
        <Button component={Link} to="/cadastro-cielo" w={{ base: '100%', xs: 'auto' }}>
          Cadastrar seller
        </Button>
      </Group>

      <Paper withBorder radius="md">
        {sellers.length === 0 ? (
          <Text c="dimmed" ta="center" p="xl">
            Nenhum seller cadastrado ainda.
          </Text>
        ) : (
          <Table.ScrollContainer minWidth={320}>
            <Table striped highlightOnHover verticalSpacing="sm" horizontalSpacing="md">
              <Table.Thead>
                <Table.Tr>
                  <Table.Th>Nome</Table.Th>
                  <Table.Th>Documento</Table.Th>
                </Table.Tr>
              </Table.Thead>
              <Table.Tbody>
                {sellers.map((seller) => (
                  <Table.Tr key={seller.id}>
                    <Table.Td>{seller.fancy_name || '—'}</Table.Td>
                    <Table.Td>
                      <Text span ff="monospace" size="sm">
                        {formatDocument(seller.document_number, seller.document_type)}
                      </Text>
                    </Table.Td>
                  </Table.Tr>
                ))}
              </Table.Tbody>
            </Table>
          </Table.ScrollContainer>
        )}
      </Paper>
    </Container>
  );
}
