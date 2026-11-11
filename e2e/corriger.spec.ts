// Correcting a line after the fact, end to end, in a phone-sized browser, against the real
// Supabase project: a confirmed test user is created with the secret key before the test,
// and deleted after it, whatever happens.
//
// The market is never reached: the site's /api/quotes*, /api/rates routes are answered here
// with `page.route`, and `unanswered` stays empty to prove none went through.
//
// With E2E_SHOTS=<directory>, the main screens are also saved there as full-page
// screenshots. Without it, no screenshot is taken.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, shot, type TestUser, stillActive } from './support'

test.use({ viewport: { width: 375, height: 812 }, actionTimeout: 20_000 })

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

// What the journey types in, first launch included: none of it may leave the browser in clear.
// Amounts are in cents; 8 characters or more, since a shorter string can appear by chance in base64
// (« 1100000 » and « 3000000 » are 7 and are kept because the brief lists them).
const NEVER_IN_CLEAR = ['livret a', 'fonds monde', 'fonds monde etf', '1100000', '3000000']

test('correcting a line: rename, figures, close and reopen, delete', async ({ page }) => {
  test.setTimeout(420_000)

  // Every body sent to Supabase during the journey.
  const supabase = need('NEXT_PUBLIC_SUPABASE_URL')
  const bodies: string[] = []
  const unanswered: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(supabase)) return
    const body = request.postData()
    if (body) bodies.push(body)
  })
  // The market is played, never reached: the fund is typed by hand, so nothing is expected here,
  // and whatever is asked is answered empty.
  await page.route(/\/api\/(quotes|rates)(\/search)?$/, async (route) => {
    unanswered.push(route.request().url())
    await route.fulfill({ status: 502, json: { ok: false } })
  })

  // 1. The first launch happens three days ago on the browser's clock; then it comes back to today.
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
  await fill(page, 'Combien y a-t-il dessus ?', '11000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Livret A · 11\s000\s€$/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: /^PEA plan d’épargne en actions$/ }).click()
  await add(page).click()
  await page.getByRole('button', { name: '+ Une action ou un fonds' }).click()
  await fill(page, 'Son nom', 'Fonds monde')
  await fill(page, 'Combien de parts as-tu ?', '100')
  await fill(page, /À quel prix les as-tu achetées/, '200')
  await fill(page, 'Combien vaut une part aujourd’hui ?', '250')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Fonds monde · 25\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Terminé', exact: true }).click()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()

  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByRole('heading', { name: /Combien dépenses-tu par mois/ })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByRole('heading', { name: 'Tes objectifs' })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()

  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await page.clock.setFixedTime(new Date())
  await stillActive(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/36\s000\s€/).first()).toBeVisible({ timeout: 15_000 })

  // 2. The fiche, opened from the category's detail.
  await page.getByRole('link', { name: 'Placements en bourse' }).first().click()
  await page.getByRole('link', { name: /Fonds monde/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Fonds monde', exact: true })).toBeVisible()
  await expect(page.getByText('Corriger une erreur de saisie')).toBeVisible()
  await expect(page.getByRole('button', { name: /Fermé ou tout vendu/ })).toBeVisible()
  await expect(page.getByRole('button', { name: /Supprimer, saisi par erreur/ })).toBeVisible()
  await shot(page, 'ligne-1-fiche')

  // 3. Rename.
  await page.getByRole('button', { name: /^Son nom/ }).click()
  await fill(page, 'Son nom', 'Fonds monde ETF')
  await shot(page, 'ligne-2-nom')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('heading', { name: 'Fonds monde ETF', exact: true })).toBeVisible({ timeout: 30_000 })

  // 4. Figures: 120 shares at 250 € are 30 000 €.
  await page.getByRole('button', { name: /^Ses parts et son prix moyen/ }).click()
  await fill(page, 'Ses parts', '120')
  await expect(page.getByText(/C’est une correction/)).toBeVisible()
  await shot(page, 'ligne-3-chiffres')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText(/30\s000\s€/).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/120 parts/).first()).toBeVisible()
  await page.getByRole('link', { name: /^‹/ }).click()
  // On the category, not still on the fiche: both say the name and the amount.
  await page.waitForURL(/\/categorie\//)
  await expect(page.getByText(/Fonds monde ETF/).first()).toBeVisible()
  await expect(page.getByText(/30\s000\s€/).first()).toBeVisible()
  await page.getByRole('link', { name: '‹ Mon argent' }).click()
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByText(/41\s000\s€/).first()).toBeVisible({ timeout: 15_000 })

  // 5. Close the Livret A today: nothing is rewritten, so nothing is asked.
  await page.getByRole('link', { name: /Argent disponible/ }).first().click()
  await page.getByRole('link', { name: /Livret A/ }).first().click()
  await expect(page.getByRole('heading', { name: 'Livret A', exact: true })).toBeVisible()
  await page.getByRole('button', { name: /Fermé ou tout vendu/ }).click()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByText(/^Fermé le /)).toBeVisible({ timeout: 30_000 })
  // Nothing is rewritten, so no confirmation was asked.
  await expect(page.getByRole('button', { name: 'Oui, le fermer' })).toHaveCount(0)
  await shot(page, 'ligne-4-fermee')
  await page.getByRole('button', { name: 'Ce n’était pas fermé' }).click()
  await expect(page.getByText(/^Fermé le /)).toHaveCount(0, { timeout: 30_000 })
  await expect(page.getByRole('button', { name: /Supprimer, saisi par erreur/ })).toBeVisible()

  // 6. Delete it.
  await page.getByRole('button', { name: /Supprimer, saisi par erreur/ }).click()
  await expect(page.getByText('Il disparaîtra de tous tes relevés. Ça ne se défait pas.')).toBeVisible()
  await shot(page, 'ligne-5-supprimer')
  await page.getByRole('button', { name: 'Oui, le supprimer' }).click()
  // The category held only the Livret A: once it is gone the category no longer opens, and the app returns to Mon argent.
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByRole('link', { name: /Argent disponible/ })).toHaveCount(0)
  // The net itself moved from 41 000 € to 30 000 €.
  const net = page.getByText('Ce qui est vraiment à toi', { exact: true }).locator('xpath=following-sibling::p[1]')
  await expect(net).toHaveText(/^30\s000\s€$/, { timeout: 15_000 })
  await expect(page.getByText(/41\s000\s€/)).toHaveCount(0)

  // 7. Nothing in clear.
  expect(unanswered).toEqual([])
  expect(bodies.some((body) => body.includes('ciphertext'))).toBe(true)
  for (const word of NEVER_IN_CLEAR) {
    expect(bodies.filter((body) => body.toLowerCase().includes(word))).toEqual([])
  }
})
