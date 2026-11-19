import type { Meta, StoryObj } from '@storybook/react-vite';
import { EmptyState } from './EmptyState';

const meta = {
  title: 'Components/EmptyState',
  component: EmptyState,
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const NoSelection: Story = {
  args: { message: 'Selecione um negócio para visualizar as informações.' },
};

export const NoBusinesses: Story = {
  args: { message: 'Nenhum negócio disponível.' },
};
