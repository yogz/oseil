import { defineConfig } from '@playwright/test'
import { loadEnvConfig } from '@next/env'

loadEnvConfig(process.cwd())

// `npm run test:e2e` runs against `next dev`, whose security policy allows
// eval: a policy that breaks production cannot show there. With E2E_PROD=1
// (`npm run test:e2e:prod`), the same journeys run against a production build
// instead — on port 3000 still, the address Supabase accepts for its links —
// and never against a server that happened to be running already.
const production = process.env.E2E_PROD === '1'
// The live journeys (`*.live.spec.ts`) run against the real site, by hand,
// after a merge: with E2E_LIVE=1 they run alone, and no local server starts.
// The ordinary runs leave them out.
const live = process.env.E2E_LIVE === '1'
// The demo reset (`*.demo.spec.ts`, `npm run demo:reset`) remakes the dev accounts « demo », « manu » and
// « nico »: with E2E_DEMO=1 it runs alone, and the ordinary runs leave it out.
const demo = process.env.E2E_DEMO === '1'

// mise gives this machine the dev base (mise-supabase-dev.tmpl). The live journeys talk to
// https://oseil.fr, so to the real base: their admin client takes its keys (PROD_*, from
// mise-supabase.tmpl), never the dev ones.
if (live) {
  for (const [name, prod] of [
    ['NEXT_PUBLIC_SUPABASE_URL', 'PROD_SUPABASE_URL'],
    ['SUPABASE_SECRET_KEY', 'PROD_SUPABASE_SECRET_KEY'],
  ]) {
    const value = process.env[prod]
    if (!value) throw new Error(`${prod} is missing: the live journeys need the real base (mise exec).`)
    process.env[name] = value
  }
}

export default defineConfig({
  testDir: './e2e',
  ...(live
    ? { testMatch: '**/*.live.spec.ts' }
    : demo
      ? { testMatch: '**/*.demo.spec.ts' }
      : { testIgnore: ['**/*.live.spec.ts', '**/*.demo.spec.ts'] }),
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000' },
  webServer: live || process.env.E2E_BASE_URL
    ? undefined
    : production
      ? {
          command: 'npx next build && npx next start -p 3000',
          url: 'http://localhost:3000',
          reuseExistingServer: false,
          timeout: 300_000,
        }
      : { command: 'npm run dev', url: 'http://localhost:3000', reuseExistingServer: true },
})
