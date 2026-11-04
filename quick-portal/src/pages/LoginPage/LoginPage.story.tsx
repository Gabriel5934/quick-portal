import type { Meta, StoryObj } from '@storybook/react-vite';
import { atBreakpoint } from '../../../.storybook/breakpoints';
import { withAppProviders } from '../../../.storybook/providers';
import { LoginPage } from './LoginPage';

/** Route `/`. */
const meta = {
  title: 'Routes/Login',
  component: LoginPage,
  decorators: [withAppProviders({ session: null })],
} satisfies Meta<typeof LoginPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = atBreakpoint('mobile');
export const TabletPortrait: Story = atBreakpoint('tabletPortrait');
export const TabletLandscape: Story = atBreakpoint('tabletLandscape');
export const Desktop: Story = atBreakpoint('desktop');
