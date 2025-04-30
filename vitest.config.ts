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
      json: 'output/internal/test-results.json',
      html: 'output/reports/index.html',
    },
    coverage: {
      enabled: true,
      reportsDirectory: 'output/reports/coverage',
      include: [ 'src/**/*.{ts,tsx}', ],
      exclude: [ 'src/**/__mocks__/*.{ts,tsx}', ],
      clean: true,
      reporter: [
        [
          'cobertura',
          {
            file: '../../internal/cobertura-coverage.xml',
          },
        ],
        [
          'json-summary',
          {
            file: '../../internal/coverage-summary.json',
          },
        ],
        'html',
      ],
    },
    reporters: [
      'default',
      'json',
      'html',
    ],
  },
});
