import { fileURLToPath } from 'node:url';
import type { StorybookConfig } from '@storybook/react-vite';

const config: StorybookConfig = {
  core: {
    disableWhatsNewNotifications: true,
    disableTelemetry: true,
    enableCrashReports: false,
    builder: {
      name: '@storybook/builder-vite',
      options: { viteConfigPath: 'vitest.config.mjs' },
    },
  },
  stories: ['../src/**/*.mdx', '../src/**/*.story.@(js|jsx|ts|tsx)'],
  addons: ['@storybook/addon-themes'],
  framework: {
    name: '@storybook/react-vite',
    options: {},
  },
  async viteFinal(viteConfig) {
    const { mergeConfig } = await import('vite');
    return mergeConfig(viteConfig, {
      resolve: {
        alias: [
          {
            // Server functions need the TanStack Start compiler and a server;
            // stories use fixtures instead.
            find: /^@\/server\/quick-api$/,
            replacement: fileURLToPath(new URL('./mocks/quick-api.ts', import.meta.url)),
          },
        ],
      },
    });
  },
};

export default config;
