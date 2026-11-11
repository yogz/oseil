// The computer layout (lot 6b, planche 20), end to end, in a 1280 px browser, against the real
// Supabase project: a confirmed test user is created with the secret key before the test, and
// deleted after it, whatever happens.
//
// With E2E_SHOTS=<directory>, the main screens are also saved there as full-page screenshots.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, shot, type TestUser } from './support'

test.use({ viewport: { width: 1280, height: 900 } })

const user: TestUser = {
  email: `e2e-ordinateur-${Date.now()}@example.com`,
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
const menu = (page: Page) => page.getByRole('navigation', { name: 'Menu principal' })
const tabBar = (page: Page) => page.getByRole('navigation', { name: 'Onglets' })

test('on a computer: the menu at the top, Mon argent and a category in two columns', async ({ page }) => {
  test.setTimeout(300_000)

  // 1. The first launch, centred and without a menu: a house and its loan, a Livret A, a fund.
  await firstSignIn(page, user)
  await expect(menu(page)).toHaveCount(0)
  await page.getByRole('link', { name: 'C’est parti' }).click()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await expect(page.getByRole('heading', { name: 'Qu’as-tu hors des banques ?' })).toBeVisible()
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await fill(page, 'Combien vaut-il, à peu près ?', '300000')
  await add(page).click()
  await page.getByRole('button', { name: 'J’ai tout ajouté' }).click()
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: 'Livret A', exact: true }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '10000')
  await add(page).click()
  await add(page).click()
  await page.getByRole('button', { name: /^PEA plan d’épargne en actions$/ }).click()
  await add(page).click()
  await page.getByRole('button', { name: '+ Une action ou un fonds' }).click()
  await fill(page, 'Son nom', 'Fonds monde')
  await fill(page, 'Combien de parts as-tu ?', '100')
  await fill(page, /À quel prix les as-tu achetées/, '200')
  await fill(page, 'Combien vaut une part aujourd’hui ?', '250')
  await add(page).click()
  await page.getByRole('button', { name: 'Terminé', exact: true }).click()
  await add(page).click()
  await page.getByRole('button', { name: /^Crédit ce qu’il te reste à rembourser$/ }).click()
  await fill(page, 'Combien reste-t-il à rembourser ?', '180000')
  await add(page).click()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()
  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await shot(page, 'ordinateur-0-revelation')
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Équilibré', exact: true }).click()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await fill(page, 'Tes dépenses par mois', '2500')
  await page.getByRole('button', { name: 'Terminer' }).click()

  // 2. Mon argent: the menu at the top, no tab bar.
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText(/155\s000\s€/).first()).toBeVisible({ timeout: 15_000 })
  await expect(menu(page)).toBeVisible()
  await expect(tabBar(page)).toBeHidden()
  await expect(menu(page).getByRole('link', { name: 'Mon argent' })).toHaveAttribute('aria-current', 'page')
  const header = page.getByRole('banner')
  // A2 (11 November 2026): the date of the figures left the menu for the page, under the grid.
  await expect(header.getByText(/^Chiffres du /)).toHaveCount(0)
  await expect(page.getByText(/^Chiffres du /).first()).toBeVisible()
  await expect(header.getByRole('link', { name: 'Mettre à jour' })).toBeVisible()
  await expect(header.getByRole('link', { name: 'Réglages' })).toBeVisible()
  await shot(page, 'ordinateur-1-mon-argent')

  // Two columns: the grid on the left, the list on the right, and the two glance cards.
  const grid = page.getByRole('img', { name: /^Ta grille/ })
  const list = page.getByRole('link', { name: 'Placements en bourse' }).first()
  const gridBox = (await grid.boundingBox())!
  const listBox = (await list.boundingBox())!
  expect(gridBox.x + gridBox.width).toBeLessThan(listBox.x)
  await expect(page.getByRole('link', { name: /Ton coussin de sécurité/ })).toHaveAttribute('href', '/reperes')
  // No depuis-le-premier-relevé card yet: a single snapshot.
  await expect(page.getByRole('link', { name: /Depuis/ })).toHaveCount(0)
  // A row lights up under the mouse and the other squares fade.
  const faded = grid.locator('[data-category].opacity-25')
  await expect(faded).toHaveCount(0)
  await list.hover()
  await expect(faded).not.toHaveCount(0)
  await shot(page, 'ordinateur-2-survol')
  await page.mouse.move(0, 0)
  await expect(faded).toHaveCount(0)

  // The square under the mouse is told under the grid, in the place of « Un carré vaut… »: its
  // line, its category, its figure. Its row lights; the grid itself does not dim (9 November 2026).
  const told = page.locator('[data-told]')
  await grid.locator('[data-square]').first().hover()
  await expect(told).toHaveText(/^Livret A · Argent disponible · 10\s000\s€$/)
  await expect(page.getByText(/^Un carré vaut/)).toBeHidden()
  await expect(page.getByRole('link', { name: 'Argent disponible' }).first().locator('xpath=ancestor::li[1]')).toHaveClass(/lg:bg-field/)
  await expect(faded).toHaveCount(0)
  await shot(page, 'ordinateur-2a-carre-survole')
  await page.mouse.move(0, 0)
  await expect(told).toHaveCount(0)
  await expect(page.getByText(/^Un carré vaut/)).toBeVisible()

  // A category: the grid stays on the left with its own squares lit, the detail takes the right.
  await list.click()
  await expect(page.getByRole('heading', { name: 'Placements en bourse' })).toBeVisible()
  await expect(page).toHaveURL(/\/categorie\/markets$/)
  await expect(menu(page).getByRole('link', { name: 'Mon argent' })).toHaveAttribute('aria-current', 'page')
  await expect(page.getByRole('img', { name: /^Ta grille/ })).toBeVisible()
  await expect(faded).not.toHaveCount(0)
  await expect(page.getByRole('link', { name: '‹ Mon argent' })).toBeVisible()
  await expect(page.getByText(/^Chiffres du /)).toBeVisible()
  await shot(page, 'ordinateur-2b-categorie')
  await page.getByRole('link', { name: '‹ Mon argent' }).click()
  await expect(page).toHaveURL(/\/$/)

  // A click on a square opens its category's detail; the same square again lights its line;
  // Escape puts the line out, then goes back to Mon argent.
  const first = page.getByRole('img', { name: /^Ta grille/ }).locator('[data-square]').first()
  const owner = await first.getAttribute('data-category')
  await first.click()
  await expect(page).toHaveURL(new RegExp(`/categorie/${owner}$`))
  await expect(page.getByRole('link', { name: '‹ Mon argent' })).toBeVisible()
  await shot(page, 'ordi-1-detail')
  await page.getByRole('img', { name: /^Ta grille/ }).locator('[data-square]').first().click()
  await expect(page.locator('[data-focused]')).toBeVisible()
  await shot(page, 'ordi-2-ligne')
  await page.keyboard.press('Escape')
  await expect(page.locator('[data-focused]')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page).toHaveURL(/\/$/)

  // 3. The tabs are reached from the menu; Repères and Évolution keep the phone layout, centred.
  await menu(page).getByRole('link', { name: 'Repères' }).click()
  await expect(page.getByRole('heading', { name: 'Repères', level: 1 })).toBeVisible()
  await expect(menu(page).getByRole('link', { name: 'Repères' })).toHaveAttribute('aria-current', 'page')
  await expect(tabBar(page)).toBeHidden()
  await shot(page, 'ordinateur-3-reperes')
  await menu(page).getByRole('link', { name: 'Évolution' }).click()
  await expect(page.getByRole('heading', { name: 'Évolution', level: 1 })).toBeVisible()
  await shot(page, 'ordinateur-4-evolution')

  // 4. The full-screen update shows no menu.
  await menu(page).getByRole('link', { name: 'Mon argent' }).click()
  await header.getByRole('link', { name: 'Mettre à jour' }).click()
  await expect(page).toHaveURL(/\/mise-a-jour/)
  await expect(menu(page)).toHaveCount(0)
  await page.goBack()

  // 5. The break is at 1024 px: below, the tab bar and no menu; from 1024, the reverse.
  await page.setViewportSize({ width: 1023, height: 900 })
  await expect(tabBar(page)).toBeVisible()
  await expect(menu(page)).toBeHidden()
  await page.setViewportSize({ width: 1024, height: 900 })
  await expect(menu(page)).toBeVisible()
  await expect(tabBar(page)).toBeHidden()
})
