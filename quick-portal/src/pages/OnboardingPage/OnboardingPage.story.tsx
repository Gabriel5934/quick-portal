import type { Meta, StoryObj } from '@storybook/react-vite';
import { atBreakpoint } from '../../../.storybook/breakpoints';
import { withAppProviders, withAuthLayout } from '../../../.storybook/providers';
import { OnboardingPage } from './OnboardingPage';

/** Route `/cadastro-cielo`. */
const meta = {
  title: 'Rotas/Cadastrar Cielo (/cadastro-cielo)',
  component: OnboardingPage,
  decorators: [withAuthLayout, withAppProviders()],
} satisfies Meta<typeof OnboardingPage>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Mobile: Story = atBreakpoint('mobile');
export const TabletPortrait: Story = atBreakpoint('tabletPortrait');
export const TabletLandscape: Story = atBreakpoint('tabletLandscape');
export const Desktop: Story = atBreakpoint('desktop');
