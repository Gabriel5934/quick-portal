import { Paper, Table, Text } from '@mantine/core';
import type { CieloSeller } from '@/api/types';
import { formatDocument } from '@/lib/mask';

export function SellersTable({ sellers }: { sellers: CieloSeller[] }) {
  return (
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
  );
}
