import { tanstackStart } from '@tanstack/react-start/plugin/vite';
import react from '@vitejs/plugin-react';
import { oxfmt, oxlint } from 'oxc-config-mantine';
import { visualizer } from 'rollup-plugin-visualizer';
import { defineConfig, lazyPlugins } from 'vite-plus';

export default defineConfig({
  fmt: {
    ...oxfmt,
    ignorePatterns: [
      ...oxfmt.ignorePatterns,
      'dist',
      '.output',
      '.tanstack',
      'storybook-static',
      'src/routeTree.gen.ts',
      '*.html',
      '*.yml',
      '*.json',
      '*.css',
    ],
  },
  lint: {
    ...oxlint,
    ignorePatterns: [
      '**/*.{mjs,cjs,js,d.ts,d.mts}',
      'dist',
      '.output',
      '.tanstack',
      'storybook-static',
      'src/routeTree.gen.ts',
    ],
    options: { typeAware: true, typeCheck: true },
  },
  server: {
    port: 3000,
  },
  resolve: {
    tsconfigPaths: true,
  },
  plugins: lazyPlugins(() => [
    tanstackStart(),
    react(),
    {
      ...visualizer({ filename: 'dist/stats.html', gzipSize: true, open: true }),
      apply: (_config, { mode }) => mode === 'analyze',
      applyToEnvironment: (environment) => environment.name === 'client',
    },
  ]),
});
