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
  // Splitting must be on so the dynamically-imported TUI (`import('../tui/run.js')`)
  // is emitted as a resolvable chunk; otherwise the built binary can't find it
  // at runtime and silently falls back to the readline UI.
  splitting: true,
  sourcemap: true,
  clean: true,
  dts: true,
  external: ['openai', '@anthropic-ai/sdk'],
  // Ink/React JSX is compiled via the automatic runtime.
  esbuildOptions(options) {
    options.jsx = 'automatic';
  },
  banner: {
    js: '#!/usr/bin/env node',
  },
});
