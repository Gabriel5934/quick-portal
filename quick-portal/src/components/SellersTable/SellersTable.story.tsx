import type { Meta, StoryObj } from '@storybook/react-vite';
import { mockSellers } from '../../../.storybook/fixtures';
import { SellersTable } from './SellersTable';

const meta = {
  title: 'Components/SellersTable',
  component: SellersTable,
} satisfies Meta<typeof SellersTable>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithSellers: Story = {
  args: { sellers: mockSellers },
};

export const Empty: Story = {
  args: { sellers: [] },
};
