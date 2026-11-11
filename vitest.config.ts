import { defineConfig } from 'vitest/config'
import tsconfigPaths from 'vite-tsconfig-paths'

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    // Key derivation (Argon2id) is deliberately slow, and a loaded machine —
    // a `next build` that just finished is enough — can push a test past the
    // 5 s default without any assertion failing. A net that trips one run in
    // ten stops being believed. Component tests opt into jsdom per file with
    // a `// @vitest-environment jsdom` directive.
    testTimeout: 30_000,
    include: [
      'lib/**/*.test.ts',
      'lib/**/__tests__/**/*.test.ts',
      'app/**/__tests__/**/*.test.ts',
      'app/**/__tests__/**/*.test.tsx',
      'components/**/__tests__/**/*.test.tsx',
    ],
  },
})
