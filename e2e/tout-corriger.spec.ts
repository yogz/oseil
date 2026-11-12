// Everything corrected from a line's fiche, end to end (docs/superpowers/specs/2026-11-11-tout-corriger-depuis-la-fiche-design.md),
// against the real Supabase project: a confirmed test user is created with the secret key before the test,
// and deleted after it, whatever happens. Its figures come from e2e/fixtures/mes-chiffres.xlsx. Nicolas's case,
// on the euro fund of the life insurance: a new PEA-PME, Placements en bourse, slow, counted in parts, then
// its account turned into a securities account. Prices and rates are refused: the figures are the file's.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { firstSignIn, need, shot, type TestUser } from './support'

const PHONE = { width: 390, height: 844 }
test.use({ viewport: PHONE })

const user: TestUser = {
  email: `e2e-corriger-${Date.now()}@example.com`,
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

test('a line filed wrong: new account, category, slow, counted in parts, type of its account', async ({ page }) => {
  test.setTimeout(240_000)
  await page.route(/\/api\/(quotes|rates)(\/search)?$/, (route) => route.fulfill({ status: 503, json: { ok: false } }))
  await firstSignIn(page, user)

  await page.getByRole('link', { name: 'Importer un fichier ou passer par ton IA' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choisir le fichier' }).click()
  await (await chooser).setFiles('e2e/fixtures/mes-chiffres.xlsx')
  await page.getByRole('button', { name: 'Importer ces chiffres' }).click({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible({ timeout: 60_000 })

  // The euro fund, in « Épargne sécurisée ».
  await page.getByRole('link', { name: 'Épargne sécurisée' }).first().click()
  await expect(page.getByRole('heading', { name: 'Épargne sécurisée' })).toBeVisible()
  const fund = page.getByRole('link', { name: /Fonds euros/ }).first()
  if (!(await fund.isVisible())) await page.getByText('Fonds en euros', { exact: false }).first().click()
  await page.getByRole('link', { name: /Fonds euros/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Cette ligne' })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Assurance-vie · Crédit Agricole', { exact: true })).toBeVisible()
  await shot(page, 'corriger-1-fiche')

  // A new PEA-PME, from « Où il est rangé ».
  await page.getByRole('button', { name: /^Où il est rangé/ }).click()
  await page.getByRole('button', { name: '+ Un nouveau compte' }).click()
  await shot(page, 'corriger-2-types')
  await page.getByRole('button', { name: /^PEA-PME/ }).click()
  await expect(page.getByLabel('Son nom')).toHaveValue('PEA-PME')
  await shot(page, 'corriger-3-nom')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText('PEA-PME · Crédit Agricole', { exact: true })).toBeVisible({ timeout: 30_000 })

  // Its category, its own answer to « Récupérable », counted in parts.
  await page.getByRole('button', { name: /^Catégorie/ }).click()
  await page.getByRole('button', { name: 'Placements en bourse' }).click()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('button', { name: /^Catégorie/ })).toContainText('Placements en bourse', { timeout: 30_000 })

  await page.getByRole('button', { name: /^Récupérable en quelques semaines/ }).click()
  await page.getByRole('button', { name: 'Non' }).click()
  await expect(page.getByRole('button', { name: /^Récupérable en quelques semaines/ })).toContainText('non', { timeout: 30_000 })

  await page.getByRole('button', { name: /^Compté en/ }).click()
  await page.getByRole('button', { name: 'En parts' }).click()
  await page.getByLabel(/Combien de parts aujourd’hui/).fill('4')
  await expect(page.getByText(/relevés? suivr/)).toContainText('ne change pas')
  await shot(page, 'corriger-4-compte-en')
  await page.getByRole('button', { name: 'Recompter' }).click()
  await expect(page.getByRole('button', { name: /^Compté en/ })).toContainText('parts · €', { timeout: 30_000 })
  await expect(page.getByText(/^4 parts/)).toBeVisible()

  // The account becomes a securities account: its name follows its type.
  await page.getByRole('button', { name: /^Type du compte/ }).click()
  await page.getByRole('button', { name: /^Compte-titres/ }).click()
  await expect(page.getByText('Compte-titres · Crédit Agricole', { exact: true })).toBeVisible({ timeout: 30_000 })
  await shot(page, 'corriger-5-apres')

  // Everything held after a reload: it was written, not only drawn.
  await page.reload()
  await expect(page.getByRole('button', { name: /^Compté en/ })).toContainText('parts · €', { timeout: 60_000 })
  await expect(page.getByRole('button', { name: /^Catégorie/ })).toContainText('Placements en bourse')
  await expect(page.getByRole('button', { name: /^Récupérable en quelques semaines/ })).toContainText('non')
  await expect(page.getByText('Compte-titres · Crédit Agricole', { exact: true })).toBeVisible()
})
