import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from '@mantine/core';
import { clearSelectedBusiness, selectBusiness } from '@/hooks/business/selection-store';
import { atBreakpoint } from '../../../.storybook/breakpoints';
import { mockBusinesses } from '../../../.storybook/fixtures';
import { withAppProviders } from '../../../.storybook/providers';
import { AuthLayout } from './AuthLayout';

/**
 * Pathless `_auth` layout shared by every authenticated route. Its content
 * renders only when a business is selected; stories start without one.
 */
const meta = {
  title: 'Routes/Auth Layout',
  component: AuthLayout,
  // `parameters.providers` overrides the seeded query cache per story.
  decorators: [(Story, context) => withAppProviders(context.parameters.providers)(Story, context)],
  args: { children: <Text c="dimmed">Conteúdo da rota</Text> },
  beforeEach: () => {
    clearSelectedBusiness();
  },
} satisfies Meta<typeof AuthLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = atBreakpoint('mobile');
export const TabletPortrait: Story = atBreakpoint('tabletPortrait');
export const TabletLandscape: Story = atBreakpoint('tabletLandscape');
export const Desktop: Story = atBreakpoint('desktop');

export const NoBusinessSelected: Story = atBreakpoint('desktop');

export const Selected: Story = {
  ...atBreakpoint('desktop'),
  beforeEach: () => {
    selectBusiness(mockBusinesses[0].cnpj);
  },
};

export const NoBusinesses: Story = {
  ...atBreakpoint('desktop'),
  parameters: { providers: { businesses: [] } },
};
