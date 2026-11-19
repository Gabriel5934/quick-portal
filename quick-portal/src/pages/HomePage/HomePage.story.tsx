import type { Meta, StoryObj } from '@storybook/react-vite';
import { clearSelectedBusiness } from '@/hooks/business/selection-store';
import { atBreakpoint } from '../../../.storybook/breakpoints';
import { withAppProviders, withAuthLayout } from '../../../.storybook/providers';
import { HomePage } from './HomePage';

/** Route `/inicio`. Stories start without a selected business, so the layout shows its empty state. */
const meta = {
  title: 'Routes/Home',
  component: HomePage,
  // Decorators apply inside-out: the layout needs the providers around it.
  // `parameters.providers` overrides the seeded query cache per story.
  decorators: [
    withAuthLayout,
    (Story, context) => withAppProviders(context.parameters.providers)(Story, context),
  ],
  beforeEach: () => {
    clearSelectedBusiness();
  },
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = atBreakpoint('mobile');
export const TabletPortrait: Story = atBreakpoint('tabletPortrait');
export const TabletLandscape: Story = atBreakpoint('tabletLandscape');
export const Desktop: Story = atBreakpoint('desktop');
