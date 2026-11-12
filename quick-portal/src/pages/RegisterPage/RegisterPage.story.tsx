import type { Meta, StoryObj } from '@storybook/react-vite';
import { atBreakpoint } from '../../../.storybook/breakpoints';
import { withAppProviders } from '../../../.storybook/providers';
import { RegisterPage } from './RegisterPage';

/** Route `/cadastro`. */
const meta = {
  title: 'Routes/Register',
  component: RegisterPage,
  decorators: [withAppProviders({ session: null })],
} satisfies Meta<typeof RegisterPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = atBreakpoint('mobile');
export const TabletPortrait: Story = atBreakpoint('tabletPortrait');
export const TabletLandscape: Story = atBreakpoint('tabletLandscape');
export const Desktop: Story = atBreakpoint('desktop');
