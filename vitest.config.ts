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
    restoreMocks: true,

    coverage: {
      enabled: true,
      reportsDirectory: 'coverage',
      include: [ 'src/**/*.{ts,tsx}', ],
      clean: true,
      reporter: [
        'lcov',
        'cobertura',
        'json-summary',
      ],
    },
    reporters: [
      'default',
      [
        'json',
        {
          outputFile: 'coverage/test-results.json',
        },
      ],
    ],
  },
});
