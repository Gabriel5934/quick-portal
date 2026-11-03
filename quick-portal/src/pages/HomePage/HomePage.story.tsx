import type { Meta, StoryObj } from '@storybook/react-vite';
import { atBreakpoint } from '../../../.storybook/breakpoints';
import { withAppProviders, withAuthLayout } from '../../../.storybook/providers';
import { HomePage } from './HomePage';

/** Route `/inicio`. */
const meta = {
  title: 'Rotas/Início (/inicio)',
  component: HomePage,
  // Decorators apply inside-out: the layout needs the providers around it.
  decorators: [withAuthLayout, withAppProviders()],
} satisfies Meta<typeof HomePage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = atBreakpoint('mobile');
export const TabletPortrait: Story = atBreakpoint('tabletPortrait');
export const TabletLandscape: Story = atBreakpoint('tabletLandscape');
export const Desktop: Story = atBreakpoint('desktop');
