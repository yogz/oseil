// Correcting a past relevé, end to end, in a phone-sized browser, against the real Supabase project
// (docs/superpowers/specs/2026-11-12-corriger-un-releve-design.md): a confirmed test user is created
// with the secret key before the test, and deleted after it, whatever happens.
//
// Two relevés: the first launch, three days ago on the browser's clock, then an update today. The
// oldest is opened from Évolution › Tes relevés, its Livret A corrected, and its total changes there.
//
// With E2E_SHOTS=<directory>, the main screens are also saved there as full-page screenshots.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, shot, stillActive, type TestUser } from './support'

test.use({ viewport: { width: 375, height: 812 }, actionTimeout: 20_000 })

const user: TestUser = {
  email: `e2e-releve-${Date.now()}@example.com`,
  password: randomBytes(12).toString('base64url'),
  id: null,
}
let admin: SupabaseClient

test.beforeAll(async () => {
  admin = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // What the application sends as a password is the secret derived from it.
  const { authSecret } = await deriveSecrets(user.password, user.email)
  const { data, error } = await admin.auth.admin.createUser({
    email: user.email,
    password: authSecret,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  user.id = data.user.id
})

test.afterAll(async () => {
  // Deleting a user cascades to its vault and documents.
  if (!user.id) return
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw new Error(`Cleanup of the test user failed: ${error.message}`)
})

const add = (page: Page) => page.getByRole('button', { name: /^(\+ Ajouter un compte|Ajouter)$/ })

test('correcting the oldest relevé from Évolution changes its total there', async ({ page }) => {
  test.setTimeout(300_000)

  // Every body sent to Supabase during the journey: the correction leaves nothing in clear.
  const supabase = need('NEXT_PUBLIC_SUPABASE_URL')
  const bodies: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(supabase)) return
    const body = request.postData()
    if (body) bodies.push(body)
  })
  // The market is never reached: nothing here is followed, and whatever is asked is answered empty.
  await page.route(/\/api\/(quotes|rates)(\/search)?$/, (route) => route.fulfill({ status: 502, json: { ok: false } }))

  // 1. The first launch, three days ago on the browser's clock: one Livret A of 10 000 €.
  const past = new Date()
  past.setDate(past.getDate() - 3)
  past.setHours(12, 0, 0, 0)
  await page.clock.setFixedTime(past)

  await firstSignIn(page, user)
  await page.getByRole('link', { name: 'C’est parti' }).click()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: 'Livret A', exact: true }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '10000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Livret A · 10\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()
  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByRole('heading', { name: /Combien dépenses-tu par mois/ })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByRole('heading', { name: 'Tes objectifs' })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()

  // Back to today, as a person still there.
  await page.clock.setFixedTime(new Date())
  await stillActive(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/10\s000\s€/).first()).toBeVisible({ timeout: 15_000 })

  // 2. An update today: the Livret A is at 12 000 €.
  await page.getByRole('link', { name: 'Mettre à jour' }).click()
  await expect(page.getByRole('heading', { name: 'Mettre à jour tes chiffres' })).toBeVisible()
  await page.getByRole('button', { name: 'Commencer par BoursoBank' }).click()
  await expect(page.getByRole('heading', { name: 'BoursoBank', exact: true })).toBeVisible()
  const livret = page.getByRole('region', { name: 'Livret A', exact: true }).getByLabel('Combien y a-t-il dessus ?')
  await livret.fill('12000')
  await livret.blur()
  await page.getByRole('button', { name: 'Voir le résultat' }).click()
  await expect(page).toHaveURL(/\/mise-a-jour\/resultat$/)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByText(/12\s000\s€/).first()).toBeVisible({ timeout: 15_000 })

  // 3. Évolution › Tes relevés: two rows; the oldest is the one not marked « le dernier ».
  await page.getByRole('link', { name: 'Évolution' }).click()
  await expect(page).toHaveURL(/\/evolution$/)
  const statements = page.getByRole('region', { name: 'Tes relevés' })
  await expect(statements.getByRole('listitem')).toHaveCount(2, { timeout: 15_000 })
  const oldest = statements.getByRole('link').filter({ hasNotText: 'le dernier' })
  await expect(oldest).toContainText(/10\s000\s€/)
  await shot(page, 'releve-1-evolution')
  await oldest.click()

  // 4. Its page: dated, with its Livret A of that day.
  await expect(page).toHaveURL(/\/releve\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1, name: /^Relevé du / })).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('Les chiffres de ce jour-là. Les corriger change ta courbe, pas tes chiffres d’aujourd’hui.')).toBeVisible()
  await shot(page, 'releve-2-page')
  await page.getByRole('link', { name: /^Livret A/ }).click()

  // 5. The correction: 10 500 € that day; today's 12 000 € is untouched.
  await expect(page.getByRole('heading', { level: 1, name: /^Son montant au / })).toBeVisible()
  await expect(page.getByText(/Aujourd’hui\s:\s12\s000\s€, inchangé/)).toBeVisible()
  await fill(page, /Son montant ce jour-là/, '10500')
  await shot(page, 'releve-3-correction')
  await page.getByRole('button', { name: /^Corriger le / }).click()

  // 6. Back on the relevé, which says so.
  await expect(page.getByText('Corrigé. Ta courbe et D’où ça vient en tiennent compte.')).toBeVisible({ timeout: 30_000 })
  await shot(page, 'releve-4-corrige')

  // 7. Back to Évolution: that relevé's total changed, the latest did not.
  await page.getByRole('link', { name: '‹ Évolution' }).click()
  await expect(page).toHaveURL(/\/evolution(#releves)?$/)
  const rows = page.getByRole('region', { name: 'Tes relevés' }).getByRole('link')
  await expect(rows.filter({ hasNotText: 'le dernier' })).toContainText(/10\s500\s€/, { timeout: 15_000 })
  await expect(rows.filter({ hasText: 'le dernier' })).toContainText(/12\s000\s€/)

  // Nothing in clear.
  expect(bodies.some((body) => body.includes('ciphertext'))).toBe(true)
  // The name, and the corrected figure as typed and in cents (10 500 €).
  for (const word of ['livret a', '10500', '1050000']) {
    expect(bodies.filter((body) => body.toLowerCase().includes(word))).toEqual([])
  }
})
