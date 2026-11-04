import type { Meta, StoryObj } from '@storybook/react-vite';
import { Text } from '@mantine/core';
import { atBreakpoint } from '../../../.storybook/breakpoints';
import { withAppProviders } from '../../../.storybook/providers';
import { AuthLayout } from './AuthLayout';

/** Pathless `_auth` layout shared by every authenticated route. */
const meta = {
  title: 'Routes/Auth Layout',
  component: AuthLayout,
  decorators: [withAppProviders()],
  args: { children: <Text c="dimmed">Conteúdo da rota</Text> },
} satisfies Meta<typeof AuthLayout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = atBreakpoint('mobile');
export const TabletPortrait: Story = atBreakpoint('tabletPortrait');
export const TabletLandscape: Story = atBreakpoint('tabletLandscape');
export const Desktop: Story = atBreakpoint('desktop');
