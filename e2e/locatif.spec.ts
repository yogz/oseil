// A home rented out, end to end, in a phone-sized browser, against the real Supabase project:
// the first launch with « Mon logement » and « Un autre logement » as « Investissement locatif »
// under its loan, goals with a rental share, then Mon argent split in « Chez toi » and
// « En location », the simulation, the detail of Immobilier and the fiche of the rental.
// One confirmed test user is created with the secret key before, and deleted after, whatever happens.
//
// With E2E_SHOTS=<directory>, each screen is also saved there, for a visual check by hand.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, shot, type TestUser } from './support'

test.use({ viewport: { width: 375, height: 812 } })

const user: TestUser = {
  email: `e2e-locatif-${Date.now()}@example.com`,
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
  const { data, error } = await admin.auth.admin.createUser({ email: user.email, password: authSecret, email_confirm: true })
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

test('a home rented out: first launch, goals with its share, Mon argent in two pockets', async ({ page }) => {
  test.setTimeout(240_000)
  await firstSignIn(page, user)

  await page.getByRole('link', { name: 'C’est parti' }).click()
  await expect(page.getByRole('heading', { name: 'Où est ton argent ?' })).toBeVisible()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await page.getByRole('button', { name: /^Un autre logement/ }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()

  // Chez toi: the home one lives in, 300 000 €, asked no type.
  await expect(page.getByRole('heading', { name: 'Qu’as-tu hors des banques ?' })).toBeVisible()
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await expect(page.getByRole('button', { name: 'Investissement locatif' })).toHaveCount(0)
  await fill(page, 'Combien vaut-il, à peu près ?', '300000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Logement · 300\s000\s€$/ })).toBeVisible()

  // The other home: its screen says so, its type is asked, its name follows the type.
  await page.getByRole('button', { name: /^Un autre logement/ }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Un autre logement' })).toBeVisible()
  await page.getByRole('button', { name: 'Investissement locatif', exact: true }).click()
  await expect(page.getByLabel('Son nom')).toHaveValue('Logement en location')
  await fill(page, 'Combien vaut-il, à peu près ?', '200000')
  await shot(page, 'locatif-1-un-autre-logement')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Logement en location · 200\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai tout ajouté' }).click()

  // BoursoBank: a Livret A, and the loan of the rental, 120 000 € still owed.
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: 'Livret A', exact: true }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '50000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Livret A · 50\s000\s€$/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: /^Crédit ce qu’il te reste à rembourser$/ }).click()
  await fill(page, 'Combien reste-t-il à rembourser ?', '120000')
  // What the loan finances is named by the home's name.
  await page.getByRole('button', { name: 'Logement en location', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Logement en location', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Crédit · 120\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()

  // The reveal: 300 000 + 200 000 + 50 000 − 120 000.
  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await expect(page.getByText(/Ce qui est vraiment à toi\s:\s430\s000\s€\./)).toBeVisible()
  await page.getByRole('button', { name: 'Continuer' }).click()

  // Goals: outside Chez toi is the Livret A and the rental net of its loan, 130 000 €. The fifth row
  // is there, with its note; « Équilibré » gives it nothing, 20 % are moved to it from the stock market.
  await expect(page.getByRole('heading', { name: 'Tes objectifs' })).toBeVisible()
  await expect(page.getByText(/hors chez toi \(130\s000\s€ aujourd’hui\)/)).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: /^Immobilier locatif/ })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Plus de Immobilier locatif' })).toBeVisible()
  await expect(page.getByText(/^Un logement ne se vend pas par carré/)).toBeVisible()
  await page.getByRole('button', { name: 'Équilibré', exact: true }).click()
  for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Moins de Placements en bourse' }).click()
  for (let i = 0; i < 20; i++) await page.getByRole('button', { name: 'Plus de Immobilier locatif' }).click()
  await expect(page.getByRole('img', { name: /Immobilier locatif 20\s%/ })).toBeVisible()
  await expect(page.getByText(/^100\s%\srépartis$/)).toBeVisible()
  await shot(page, 'locatif-2-objectifs')
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  await expect(page.getByRole('heading', { name: /Combien dépenses-tu par mois/ })).toBeVisible()
  await fill(page, 'Tes dépenses par mois', '2500')
  await page.getByRole('button', { name: 'Terminer' }).click()

  // Mon argent: Immobilier in its two pockets, the goals compared outside Chez toi.
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByText(/430\s000\s€/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/^Hors chez toi, /)).toBeVisible()
  // « Chez toi » in its own green in the grid, the rental in Immobilier's (11 November 2026).
  const grid = page.getByRole('img', { name: /^Ta grille/ })
  await expect(grid.locator('[data-home]').first()).toBeVisible()
  await expect(grid.locator('[data-category="property"]:not([data-home])').first()).toBeVisible()
  // Immobilier closed at first: one line for the rental's goal, a touch opens both pockets.
  const toggle = page.getByRole('button', { name: /^En location\s:\s/ })
  await expect(toggle).toHaveAttribute('aria-expanded', 'false')
  await expect(page.locator('[data-pocket="chez-toi"]')).toBeHidden()
  await shot(page, 'locatif-3a-ferme')
  await toggle.click()
  const home = page.locator('[data-pocket="chez-toi"]')
  const rental = page.locator('[data-pocket="location"]')
  await expect(home).toContainText('Chez toi')
  await expect(home).toContainText(/300\s000\s€/)
  await expect(rental).toContainText('En location')
  await expect(rental).toContainText(/80\s000\s€/)
  await expect(rental.getByRole('img')).toBeVisible()
  await shot(page, 'locatif-3-mon-argent')

  // The simulation, then back to the real figures.
  await page.getByRole('button', { name: 'Montre-moi mes objectifs' }).click()
  await expect(page.getByText('Si tu étais pile à tes objectifs')).toBeVisible()
  await expect(page.getByText('Simulation · ce n’est pas ta situation')).toBeVisible()
  await shot(page, 'locatif-4-simulation')
  await page.getByRole('button', { name: 'Revenir à mes vrais chiffres' }).click()
  await expect(page.getByText(/^Hors chez toi, /)).toBeVisible()

  // The detail of Immobilier: its two groups, « Pour y vivre » first.
  await page.getByRole('link', { name: 'Immobilier' }).first().click()
  await expect(page.getByRole('heading', { name: 'Immobilier', exact: true })).toBeVisible()
  const live = page.getByRole('button', { name: /^Pour y vivre 300\s000\s€$/ })
  const rented = page.getByRole('button', { name: /^En location 80\s000\s€$/ })
  await expect(live).toBeVisible()
  await expect(rented).toBeVisible()
  await expect(page.getByText(/au-dessus de ton objectif/)).toBeVisible()
  await shot(page, 'locatif-5-immobilier')

  // The fiche of the rental: its type, as chosen at the first launch.
  await rented.click()
  await page.getByRole('link', { name: /^Logement en location/ }).click()
  await expect(page).toHaveURL(/\/ligne\//)
  await expect(page.getByText('Type', { exact: true })).toBeVisible({ timeout: 15_000 })
  // Its name and its type no longer say the same words (until 10 November 2026, the line below found
  // the name « Investissement locatif », not the type).
  await expect(page.getByRole('heading', { level: 1, name: 'Logement en location' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Type Investissement locatif' })).toBeVisible()
  await shot(page, 'locatif-6-fiche')
})
