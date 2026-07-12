import { defineConfig } from 'tsup';

// Produces the single-file CLI bundle plus the library entry point.
// The provider SDKs are marked external so they stay optional at runtime.
export default defineConfig({
  entry: {
    'cli/main': 'src/cli/main.ts',
    index: 'src/index.ts',
  },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  splitting: false,
  sourcemap: true,
  clean: true,
  dts: true,
  external: ['openai', '@anthropic-ai/sdk'],
  banner: {
    js: '#!/usr/bin/env node',
  },
});
