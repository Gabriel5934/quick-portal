import type { Meta, StoryObj } from '@storybook/react-vite';
import { selectBusiness } from '@/hooks/business/selection-store';
import { atBreakpoint } from '../../../.storybook/breakpoints';
import { mockBusinesses } from '../../../.storybook/fixtures';
import { withAppProviders, withAuthLayout } from '../../../.storybook/providers';
import { IntegrationPage } from './IntegrationPage';

/** Route `/integracao`. */
const meta = {
  title: 'Routes/Integration',
  component: IntegrationPage,
  decorators: [withAuthLayout, withAppProviders()],
  beforeEach: () => {
    selectBusiness(mockBusinesses[0].cnpj);
  },
} satisfies Meta<typeof IntegrationPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = atBreakpoint('mobile');
export const TabletPortrait: Story = atBreakpoint('tabletPortrait');
export const TabletLandscape: Story = atBreakpoint('tabletLandscape');
export const Desktop: Story = atBreakpoint('desktop');
