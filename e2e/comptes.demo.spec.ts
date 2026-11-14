// The dev accounts « demo », « manu » and « nico », made again from scratch and filled with the demo wealth
// (lib/demo/showcase.ts): `npm run demo:reset` for the three, `DEMO_ACCOUNT=manu npm run demo:reset` for one.
// Dev base only: it refuses to run when this machine points at the real base.
//
// For each account: deleted if it exists (its vault and documents go with it, by cascade), created again with
// its password from Proton Pass (vault « Cecile&Manu », one login item per account, « Oseil dev - demo » and so on,
// with the address and the local site's URL so that a browser fills them in), signed in once
// through the site (the vault is made in the browser; its recovery key is confirmed and kept nowhere, the next
// reset replaces it), then filled by the site's own import of the demo wealth.
import { execFileSync } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { showcaseInput } from '../lib/demo/showcase'
import { exportSheets } from '../lib/transfer/export'
import { writeWorkbook } from '../lib/transfer/xlsx'
import { deriveSecrets } from '../lib/vault/kdf'
import { firstSignIn, need, shot } from './support'

const VAULT = 'Cecile&Manu'
const ACCOUNTS = ['demo', 'manu', 'nico'] as const

const base = need('NEXT_PUBLIC_SUPABASE_URL')
if (!base.includes(need('DEV_SUPABASE_PROJECT_REF')) || base === process.env.PROD_SUPABASE_URL) {
  throw new Error(`The demo accounts live on the dev base only, and this machine points at ${base}.`)
}

const only = process.env.DEMO_ACCOUNT
if (only && !ACCOUNTS.includes(only as (typeof ACCOUNTS)[number])) {
  throw new Error(`DEMO_ACCOUNT is one of ${ACCOUNTS.join(', ')}, not ${only}.`)
}

// Read from Proton Pass when needed, never written anywhere nor printed.
function passwordOf(name: string): string {
  const item = `Oseil dev - ${name}`
  return execFileSync('pass-cli', ['item', 'view', '--vault-name', VAULT, '--item-title', item, '--field', 'password'], {
    encoding: 'utf8',
  }).trim()
}

async function userIdOf(admin: SupabaseClient, email: string): Promise<string | null> {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 })
    if (error) throw new Error(`listUsers failed: ${error.message}`)
    const found = data.users.find((u) => u.email === email)
    if (found) return found.id
    if (data.users.length < 1000) return null
  }
}

let admin: SupabaseClient
let file: string

test.beforeAll(async () => {
  admin = createClient(base, need('SUPABASE_SECRET_KEY'), { auth: { persistSession: false, autoRefreshToken: false } })
  const blob = await writeWorkbook(exportSheets(showcaseInput()))
  file = join(await mkdtemp(join(tmpdir(), 'oseil-demo-')), 'mes-chiffres-demo.xlsx')
  await writeFile(file, Buffer.from(await blob.arrayBuffer()))
})

for (const name of ACCOUNTS.filter((a) => !only || a === only)) {
  test(`le compte ${name}@oseil.fr, remis à neuf et pré-rempli`, async ({ page }) => {
    test.setTimeout(240_000)
    const email = `${name}@oseil.fr`
    const password = passwordOf(name)

    const existing = await userIdOf(admin, email)
    if (existing) {
      const { error } = await admin.auth.admin.deleteUser(existing)
      if (error) throw new Error(`Deleting ${email} failed: ${error.message}`)
    }
    // What the application sends as a password is the secret derived from it.
    const { authSecret } = await deriveSecrets(password, email)
    const { data, error } = await admin.auth.admin.createUser({ email, password: authSecret, email_confirm: true })
    if (error || !data.user) throw new Error(`Creating ${email} failed: ${error?.message}`)

    // The prices of the day are not asked during the reset: Mon argent shows the last relevé as saved.
    await page.route(/\/api\/(quotes|rates)(\/search)?$/, (route) => route.fulfill({ status: 503, json: { ok: false } }))
    await firstSignIn(page, { email, password, id: data.user.id })
    await page.getByRole('link', { name: 'Importer un fichier ou passer par ton IA' }).click()
    const chooser = page.waitForEvent('filechooser')
    await page.getByRole('button', { name: 'Choisir le fichier' }).click()
    await (await chooser).setFiles(file)
    const confirm = page.getByRole('button', { name: 'Importer ces chiffres' })
    await expect(confirm).toBeVisible({ timeout: 30_000 })
    await expect(page.getByRole('list', { name: 'Les relevés' }).getByRole('listitem')).toHaveCount(25)
    await confirm.click()

    await expect(page).toHaveURL(/\/$/, { timeout: 60_000 })
    await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
    await expect(page.getByRole('img', { name: /^Ta grille/ })).toBeVisible({ timeout: 30_000 })
    await shot(page, `demo-${name}-mon-argent`)
  })
}
