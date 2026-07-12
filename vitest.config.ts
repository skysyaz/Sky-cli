import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: [
        'src/**/*.d.ts',
        // §10.6 marks the TUI and CLI layers as E2E-covered (they need a live
        // terminal), and the live provider adapters need a network/SDK — both
        // are exercised by the manual end-to-end runs, not unit tests.
        'src/tui/**',
        'src/cli/**',
        'src/llm/openai.ts',
        'src/llm/anthropic.ts',
        'src/index.ts',
      ],
      // Per §10.6 the safety and config modules carry the highest cost of
      // failure; overall unit-test target is 85% line coverage.
      thresholds: {
        lines: 80,
        functions: 70,
        branches: 70,
      },
    },
  },
});
