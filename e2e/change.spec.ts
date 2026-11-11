// The rate of a line's purchases, end to end (docs/superpowers/specs/2026-11-11-change-a-l-achat-design.md),
// against the real Supabase project: a confirmed test user is created with the secret key before the test,
// and deleted after it, whatever happens. Its figures come from e2e/fixtures/mes-chiffres.xlsx, whose Apple
// shares are in dollars over three snapshots at three rates. Prices and rates are refused, so that the
// figures are the file's.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { firstSignIn, need, shot, type TestUser } from './support'

const PHONE = { width: 390, height: 844 }
test.use({ viewport: PHONE })

const user: TestUser = {
  email: `e2e-change-${Date.now()}@example.com`,
  password: randomBytes(12).toString('base64url'),
  id: null,
}
let admin: SupabaseClient

test.beforeAll(async () => {
  admin = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { authSecret } = await deriveSecrets(user.password, user.email)
  const { data, error } = await admin.auth.admin.createUser({ email: user.email, password: authSecret, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  user.id = data.user.id
})

test.afterAll(async () => {
  if (!user.id) return
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw new Error(`Cleanup of the test user failed: ${error.message}`)
})

test('a line in dollars: the rate of its purchases on its fiche, corrected, then in euros', async ({ page }) => {
  test.setTimeout(180_000)
  await page.route(/\/api\/(quotes|rates)(\/search)?$/, (route) => route.fulfill({ status: 503, json: { ok: false } }))
  await firstSignIn(page, user)

  // The figures of the file.
  await page.getByRole('link', { name: 'Importer un fichier ou passer par ton IA' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choisir le fichier' }).click()
  await (await chooser).setFiles('e2e/fixtures/mes-chiffres.xlsx')
  await page.getByRole('button', { name: 'Importer ces chiffres' }).click({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible({ timeout: 60_000 })

  // The stock market, then Apple's fiche: the rate of its purchases, computed from the snapshots.
  await page.getByRole('link', { name: 'Placements en bourse' }).first().click()
  await expect(page.getByRole('heading', { name: 'Placements en bourse' })).toBeVisible()
  await shot(page, 'change-1-bourse')
  // The lines are ranged by zone: Apple is in « États-Unis ».
  await page.getByText('États-Unis', { exact: false }).first().click()
  await page.getByRole('link', { name: /Apple/ }).first().click()
  const row = page.getByRole('button', { name: /^Le dollar à l’achat/ })
  await expect(row).toBeVisible({ timeout: 15_000 })
  await expect(row).toContainText('calculé par Oseil')
  await expect(row).toContainText(/1\s€\s=\s\d+,\d\d\s\$US/)
  await shot(page, 'change-2-fiche')

  // Corrected: a rate typed, said as « ton chiffre ».
  await row.click()
  await expect(page.getByLabel(/1\s€ valait combien de dollars américains\s\?/)).toBeVisible()
  await shot(page, 'change-3-formulaire')
  await page.getByLabel(/1\s€ valait combien de dollars américains\s\?/).fill('1,2')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('button', { name: /^Le dollar à l’achat/ })).toContainText('ton chiffre', { timeout: 30_000 })
  await expect(page.getByRole('button', { name: /^Le dollar à l’achat/ })).toContainText(/1\s€\s=\s1,20\s\$US/)
  await shot(page, 'change-4-ton-chiffre')

  // In euros: the average price copied from a broker that gives it change included.
  await page.getByRole('button', { name: /^Le dollar à l’achat/ }).click()
  await page.getByRole('button', { name: 'Euros' }).click()
  await shot(page, 'change-5-en-euros')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('button', { name: /^Le dollar à l’achat/ })).toContainText('en euros', { timeout: 30_000 })

  // Back to Oseil's rate.
  await page.getByRole('button', { name: /^Le dollar à l’achat/ }).click()
  await page.getByRole('button', { name: 'Dollars américains' }).click()
  await page.getByRole('button', { name: 'Revenir au calcul d’Oseil' }).click()
  await expect(page.getByRole('button', { name: /^Le dollar à l’achat/ })).toContainText('calculé par Oseil', { timeout: 30_000 })
})
