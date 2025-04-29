import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [
    tsconfigPaths(),
    react(),
  ],
  test: {
    environment: 'jsdom',
    include: [ '**/**.test.ts', ],

    setupFiles: [
      'tests/setupEnv.ts',
      'tests/setupMocks.ts',
    ],
    mockReset: true,

    outputFile: {
      json: 'coverage/test-results.json',
      html: 'reports/tests/index.html',
    },
    coverage: {
      enabled: true,
      reportsDirectory: 'reports',
      include: [ 'src/**/*.{ts,tsx}', ],
      clean: true,
      reporter: [
        [
          'cobertura',
          {
            file: '../coverage/cobertura-coverage.xml',
          },
        ],
        [
          'json-summary',
          {
            file: '../coverage/coverage-summary.json',
          },
        ],
        [
          'html',
          {
            subdir: 'coverage',
          },
        ],
      ],
    },
    reporters: [
      'default',
      'json',
      'html',
    ],
  },
});
