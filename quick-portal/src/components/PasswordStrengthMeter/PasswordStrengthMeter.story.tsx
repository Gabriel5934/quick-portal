import type { Meta, StoryObj } from '@storybook/react-vite';
import { PasswordStrengthMeter } from './PasswordStrengthMeter';

const meta = {
  title: 'Components/PasswordStrengthMeter',
  component: PasswordStrengthMeter,
  decorators: [
    (Story) => (
      <div style={{ maxWidth: 360 }}>
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PasswordStrengthMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Empty: Story = {
  args: { result: null },
};

export const Pwned: Story = {
  args: {
    result: {
      score: 0,
      warning: 'Esta senha já foi exposta por uma violação de dados na Internet.',
      suggestions: ['Se você usar esta senha em outro lugar, você deve alterá-la.'],
      pwned: true,
    },
  },
};

export const Medium: Story = {
  args: {
    result: {
      score: 2,
      warning: null,
      suggestions: ['Adicione mais palavras que são menos comuns.'],
      pwned: false,
    },
  },
};

export const Safe: Story = {
  args: { result: { score: 3, warning: null, suggestions: [], pwned: false } },
};

export const VerySafe: Story = {
  args: { result: { score: 4, warning: null, suggestions: [], pwned: false } },
};
