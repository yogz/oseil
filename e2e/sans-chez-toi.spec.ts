// « Ta grille : sans chez toi », end to end (docs/superpowers/specs/2026-11-12-grille-sans-chez-toi-design.md),
// against the real Supabase project: a confirmed test user is created with the secret key before the test,
// and deleted after it, whatever happens. Its figures come from e2e/fixtures/mes-chiffres.xlsx, whose home is
// financed by a loan. Prices and rates are refused: the figures are the file's.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { firstSignIn, need, shot, type TestUser } from './support'

const PHONE = { width: 390, height: 844 }
test.use({ viewport: PHONE })

const user: TestUser = {
  email: `e2e-sans-chez-toi-${Date.now()}@example.com`,
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

test('the grid without the home: Mon argent, Évolution and Immobilier follow, and it comes back', async ({ page }) => {
  test.setTimeout(180_000)
  await page.route(/\/api\/(quotes|rates)(\/search)?$/, (route) => route.fulfill({ status: 503, json: { ok: false } }))
  await firstSignIn(page, user)

  await page.getByRole('link', { name: 'Importer un fichier ou passer par ton IA' }).click()
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choisir le fichier' }).click()
  await (await chooser).setFiles('e2e/fixtures/mes-chiffres.xlsx')
  await page.getByRole('button', { name: 'Importer ces chiffres' }).click({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('Ce qui est vraiment à toi')).toBeVisible()
  await shot(page, 'sans-chez-toi-1-tout')

  // The setting, under « En euros / En % ».
  await page.getByRole('link', { name: 'Réglages', exact: true }).click()
  await expect(page.getByText('Ta grille')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tout compter' })).toHaveAttribute('aria-pressed', 'true')
  const written = page.waitForResponse((r) => r.url().includes('/rest/v1/documents') && r.request().method() !== 'GET')
  await page.getByRole('button', { name: 'Sans chez toi' }).click()
  expect((await written).ok()).toBe(true)
  await expect(page.getByRole('button', { name: 'Sans chez toi' })).toHaveAttribute('aria-pressed', 'true')
  await shot(page, 'sans-chez-toi-2-reglage')

  // Mon argent says it, and the whole beneath.
  await page.getByRole('link', { name: 'Mon argent' }).first().click()
  await expect(page.getByText('À toi, hors chez toi')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/en comptant chez toi$/)).toBeVisible()
  await shot(page, 'sans-chez-toi-3-mon-argent')

  // Évolution follows.
  await page.getByRole('link', { name: 'Évolution' }).first().click()
  await expect(page.getByText(/hors chez toi/).first()).toBeVisible({ timeout: 30_000 })

  // After a reload, it held: it was written, not only drawn.
  await page.goto('/')
  await expect(page.getByText('À toi, hors chez toi')).toBeVisible({ timeout: 60_000 })

  // Back, from Immobilier's detail, the way one thinks of it.
  await page.goto('/categorie/property')
  // Immobilier follows the grid; the home is listed out of it, with its fiche (Nicolas, 12 November 2026).
  await expect(page.getByRole('heading', { name: 'Hors de ta grille' })).toBeVisible({ timeout: 60_000 })
  await expect(page.getByRole('link', { name: /^Ma maison/ })).toBeVisible()
  await shot(page, 'sans-chez-toi-4-immobilier')
  await page.getByRole('link', { name: 'Remettre chez toi dans ma grille ›' }).click()
  // The pill follows the touch at once; the save is awaited before leaving, or the reload would cut it.
  await expect(page.getByRole('button', { name: 'Sans chez toi' })).toHaveAttribute('aria-pressed', 'true')
  const saved = page.waitForResponse((r) => r.url().includes('/rest/v1/documents') && r.request().method() !== 'GET')
  await page.getByRole('button', { name: 'Tout compter' }).click()
  expect((await saved).ok()).toBe(true)
  await page.goto('/')
  await expect(page.getByText('Ce qui est vraiment à toi')).toBeVisible({ timeout: 60_000 })
})
