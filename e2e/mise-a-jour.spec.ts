// The monthly update, end to end, in a phone-sized browser, against the real
// Supabase project: a confirmed test user is created with the secret key before
// the test, and deleted after it, whatever happens.
//
// With E2E_SHOTS=<directory>, the main screens are also saved there as
// full-page screenshots. Without it, no screenshot is taken.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, shot, type TestUser } from './support'

test.use({ viewport: { width: 375, height: 812 } })

const user: TestUser = {
  email: `e2e-miseajour-${Date.now()}@example.com`,
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

// What the journey types in, first launch included: none of it may leave the
// browser in clear. Amounts are in cents; 8 characters or more, since a shorter
// string can appear by chance in base64.
const NEVER_IN_CLEAR = ['boursobank', 'fonds monde', '30000000', '18000000', '1100000', '17890000', '20000000']

test('the monthly update, with a loan held in its bank, from the start to the saved snapshot', async ({ page }) => {
  test.setTimeout(300_000)

  // Every body sent to Supabase during the journey.
  const supabase = need('NEXT_PUBLIC_SUPABASE_URL')
  const bodies: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(supabase)) return
    const body = request.postData()
    if (body) bodies.push(body)
  })

  // 1. The starting point: the first launch, as premier-lancement does it.
  await firstSignIn(page, user)
  await page.getByRole('link', { name: 'C’est parti' }).click()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()

  await expect(page.getByRole('heading', { name: 'Qu’as-tu hors des banques ?' })).toBeVisible()
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await fill(page, 'Combien vaut-il, à peu près ?', '300000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Logement · 300\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai tout ajouté' }).click()

  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: 'Livret A', exact: true }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '10000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Livret A · 10\s000\s€$/ })).toBeVisible()

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

  await add(page).click()
  await page.getByRole('button', { name: /^Crédit ce qu’il te reste à rembourser$/ }).click()
  await fill(page, 'Combien reste-t-il à rembourser ?', '180000')
  await expect(page.getByRole('button', { name: 'Logement', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Crédit · 180\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()

  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await expect(page.getByText(/Ce qui est vraiment à toi\s:\s155\s000\s€\./)).toBeVisible()
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByRole('heading', { name: /Combien dépenses-tu par mois/ })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByRole('heading', { name: 'Tes objectifs' })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()

  // Mon argent: 155 000 €, and « Mettre à jour » is a link.
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByText(/155\s000\s€/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('link', { name: 'Mettre à jour' })).toBeVisible()

  // 2. The start.
  await page.getByRole('link', { name: 'Mettre à jour' }).click()
  await expect(page.getByRole('heading', { name: 'Mettre à jour tes chiffres' })).toBeVisible()
  await shot(page, 'maj-1-depart')
  await page.getByRole('button', { name: 'Commencer par Chez toi' }).click()

  // 3. Chez toi: the house is confirmed.
  await expect(page.getByRole('heading', { name: 'Chez toi', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'C’est toujours ça' }).click()
  await expect(page.getByRole('button', { name: 'C’est toujours ça' })).toHaveAttribute('aria-pressed', 'true')

  // A home added here asks its type, between all three, nothing chosen in advance. Given up:
  // nothing is added, and the figures below stay those of the house alone.
  await page.getByRole('button', { name: '+ Ajouter un compte' }).click()
  await page.getByRole('button', { name: /^Logement/ }).click()
  await page.getByRole('button', { name: 'Je l’avais déjà' }).click()
  await expect(page.getByText('Quel type de logement ?')).toBeVisible()
  for (const name of ['Résidence principale', 'Résidence secondaire', 'Investissement locatif']) {
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'false')
  }
  await page.getByRole('button', { name: 'Investissement locatif', exact: true }).click()
  await expect(page.getByLabel('Son nom')).toHaveValue('Logement en location')
  await shot(page, 'mise-a-jour-type')
  await page.getByRole('button', { name: 'Annuler' }).click()
  await expect(page.getByRole('heading', { name: 'Chez toi', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Suivant : BoursoBank' }).click()

  // 4. BoursoBank, first part: the Livret A and the fund change.
  await expect(page.getByRole('heading', { name: 'BoursoBank', exact: true })).toBeVisible()
  const line = (name: string) => page.getByRole('region', { name, exact: true })
  await line('Livret A').getByLabel('Combien y a-t-il dessus ?').fill('11000')
  await line('Livret A').getByLabel('Combien y a-t-il dessus ?').blur()
  await expect(line('Livret A').getByText(/avant\s:\s10\s000\s€/)).toBeVisible()
  await line('Fonds monde').getByLabel('Combien vaut une part aujourd’hui').fill('260')
  await line('Fonds monde').getByLabel('Combien vaut une part aujourd’hui').blur()
  await expect(line('Fonds monde').getByText(/100 parts = 26\s000\s€/)).toBeVisible()
  await shot(page, 'maj-2-banque')

  // Leave in the middle: « Fermer » waits for what was typed to be saved.
  await page.getByRole('button', { name: 'Fermer' }).click()

  // 5. Mon argent while the draft waits: the saved figures, the banner.
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByText(/155\s000\s€/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Mise à jour en cours/)).toBeVisible()
  await expect(page.getByRole('link', { name: 'Reprendre la mise à jour' })).toBeVisible()
  await shot(page, 'maj-3-mon-argent-brouillon')
  await page.reload()
  await expect(page.getByText(/Mise à jour en cours/)).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/155\s000\s€/).first()).toBeVisible()
  await page.getByRole('link', { name: 'Reprendre la mise à jour' }).click()
  await page.getByRole('button', { name: 'Reprendre avec BoursoBank' }).click()
  await expect(page.getByRole('heading', { name: 'BoursoBank', exact: true })).toBeVisible()
  await expect(line('Livret A').getByLabel('Combien y a-t-il dessus ?')).toHaveValue(/^11\s000$/)
  await expect(line('Livret A').getByText(/avant\s:\s10\s000\s€/)).toBeVisible()
  await expect(line('Fonds monde').getByLabel('Combien vaut une part aujourd’hui')).toHaveValue('260,00')

  // 6. BoursoBank, the end. The loan is held in its bank: it is listed here, under BoursoBank, and not under Chez toi.
  await line('Crédit').getByLabel('Combien reste-t-il à rembourser ?').fill('178900')
  await line('Crédit').getByLabel('Combien reste-t-il à rembourser ?').blur()
  await expect(line('Crédit').getByText(/avant\s:\s180\s000\s€/)).toBeVisible()

  await page.getByRole('button', { name: '+ Ajouter un compte' }).click()
  await page.getByRole('button', { name: /^LEP/ }).click()
  await page.getByRole('button', { name: 'Ouvert depuis la dernière fois' }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '2000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /LEP.*2\s000\s€/ })).toBeVisible()
  await page.getByRole('button', { name: 'Voir le résultat' }).click()

  // 7. The result.
  await expect(page).toHaveURL(/\/mise-a-jour\/resultat$/)
  await expect(page.getByText('C’est à jour. Ce qui est vraiment à toi :')).toBeVisible()
  await expect(page.getByText(/^160\s100\s€$/)).toBeVisible()
  await expect(page.getByText(/5\s100\s€ de plus/)).toBeVisible()
  await expect(page.getByText(/Un carré vaut maintenant 1\s601\s€/)).toBeVisible()
  await expect(page.getByRole('listitem').filter({ hasText: 'Ton effort' }).getByText(/^4\s100\s€$/)).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Les marchés et les intérêts' }).getByText(/^1\s000\s€$/),
  ).toBeVisible()
  await expect(page.getByText(/Crédit remboursé 1\s100\s€/)).toBeVisible()
  await shot(page, 'maj-4-resultat')

  // 8. The save: Mon argent shows the new figures, and the banner is gone. On a small phone with
  // two snapshots: an iPhone SE once Safari's bars are counted, about 375 × 560.
  await page.setViewportSize({ width: 375, height: 560 })
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByText(/160\s100\s€/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/Mise à jour en cours/)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Mettre à jour' })).toBeVisible()
  await shot(page, 'maj-5-mon-argent-apres')

  // C1: the whole grid in the first screen, above the tab bar, without scrolling (on Nicolas's
  // iPhone, with his two snapshots, its last row went under the tab bar).
  await page.evaluate(() => window.scrollTo(0, 0))
  const gridBox = (await page.getByRole('img', { name: /^Ta grille/ }).boundingBox())!
  const tabsBox = (await page.getByRole('navigation', { name: 'Onglets' }).boundingBox())!
  expect(gridBox.y + gridBox.height).toBeLessThanOrEqual(tabsBox.y)

  // A square touched opens its category's detail, as on a computer (Nicolas, 9 November 2026). Mon
  // argent's grid stays above the detail, where it was and as wide: nothing jumps. This runs on the
  // small phone (375 × 560), where the grid is shrunk to fit: the case that could jump. A second
  // touch, on a square of that category, lights its line and sets its row forth.
  const board = page.getByRole('img', { name: /^Ta grille/ })
  const before = (await board.boundingBox())!
  const square = board.locator('[data-square]').first()
  const owner = await square.getAttribute('data-category')
  await square.click()
  await expect(page).toHaveURL(new RegExp(`/categorie/${owner}$`))
  const detail = page.locator('[data-detail]')
  await expect(detail.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(page.getByRole('link', { name: '‹ Mon argent' })).toBeVisible()
  const grid = page.getByRole('img', { name: /^Ta grille/ })
  const after = (await grid.boundingBox())!
  expect(Math.abs(after.y - before.y)).toBeLessThanOrEqual(1)
  expect(Math.abs(after.width - before.width)).toBeLessThanOrEqual(1)
  const headingBox = (await detail.getByRole('heading', { level: 1 }).boundingBox())!
  expect(after.y + after.height).toBeLessThanOrEqual(headingBox.y)
  await shot(page, 'maj-5c-detail')
  await grid.locator(`[data-square][data-category="${owner}"]`).first().click()
  await expect(page.locator('[data-focused]')).toBeVisible()
  await shot(page, 'maj-5d-ligne')
  // A touch on plain text, outside the grid, goes back to Mon argent, where the grid is whole.
  await detail.getByText(/carrés? sur 100/).first().click()
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByText('Ce qui est vraiment à toi')).toBeVisible()
  await expect(page.getByRole('img', { name: /^Ta grille/ }).locator('[data-dim]')).toHaveCount(0)

  // Back to the usual phone for the rest of the journey.
  await page.setViewportSize({ width: 375, height: 812 })

  // Option 2: what is owned opens from the amount, over the grid, and closes with Escape.
  const amount = page.getByRole('button', { name: /^160\s100\s€$/ })
  await amount.click()
  await expect(page.getByText(/^Tu possèdes .* prêtés pour ton logement\.$/)).toBeVisible()
  await shot(page, 'maj-5b-tu-possedes')
  await page.keyboard.press('Escape')
  await expect(page.getByText(/^Tu possèdes/)).toHaveCount(0)

  // 8b. Évolution: two snapshots now, so the list shows two rows. Both are of today: one day on
  // the calendar, so no curve is drawn, and it is said.
  await page.getByRole('link', { name: 'Évolution' }).click()
  await expect(page).toHaveURL(/\/evolution$/)
  const statements = page.getByRole('region', { name: 'Tes relevés' })
  await expect(statements).toBeVisible({ timeout: 15_000 })
  await expect(statements.getByRole('listitem')).toHaveCount(2)
  const curve = page.getByRole('region', { name: 'La courbe' })
  await expect(curve.getByText(/Tes relevés sont tous du même jour/)).toBeVisible()
  await expect(curve.getByRole('slider')).toHaveCount(0)
  await expect(statements.getByText(/160\s100\s€/)).toBeVisible()
  await expect(statements.getByText(/155\s000\s€/)).toBeVisible()
  await shot(page, 'maj-6-evolution')

  // 8c. Repères: where the money is. The loan sits under BoursoBank, which lent it, and « Chez toi »
  // comes last without a bar. No budget was given, so the cushion says how to get one.
  await page.getByRole('link', { name: 'Repères' }).click()
  await expect(page).toHaveURL(/\/reperes$/)
  const where = page.getByRole('region', { name: 'Où est ton argent' })
  await expect(where).toBeVisible({ timeout: 15_000 })
  const places = where.getByRole('listitem')
  await expect(places).toHaveCount(2)
  await expect(places.nth(0)).toContainText('BoursoBank')
  await expect(places.nth(0)).toContainText(/Crédit.*178\s900\s€ à rembourser/)
  await expect(places.nth(1)).toContainText('Chez toi')
  await expect(page.getByText('Indique tes dépenses dans les Réglages pour le calculer.')).toBeVisible()
  await shot(page, 'maj-7-reperes')

  // 8d. Ranger par zone: the only markets line (the fund) is put in « Europe », from the detail
  // of the category to the saved choice. One line makes one chapter, so the detail shows no
  // chapters: the choice is read back from the ranging screen, without a reason under it.
  await page.getByRole('link', { name: 'Mon argent' }).click()
  await expect(page).toHaveURL(/\/$/)
  await page.getByRole('link', { name: /Placements en bourse/ }).first().click()
  await expect(page).toHaveURL(/\/categorie\/markets$/)
  await page.getByRole('link', { name: /^Ranger par zone/ }).click()
  await expect(page).toHaveURL(/\/categorie\/markets\/ranger$/)
  await expect(page.getByRole('heading', { name: 'Ranger par zone' })).toBeVisible()
  const zone = page.getByRole('combobox', { name: /Fonds monde/ })
  await zone.selectOption({ label: 'Europe' })
  await shot(page, 'maj-9-ranger')
  await page.getByRole('button', { name: /^Valider ce(s \d+)? choix?/ }).click()
  await expect(page).toHaveURL(/\/categorie\/markets$/, { timeout: 30_000 })
  await expect(page.getByRole('link', { name: /Fonds monde/ }).or(page.getByText('Fonds monde')).first()).toBeVisible()
  await page.getByRole('link', { name: /^Ranger par zone/ }).click()
  await expect(page.getByRole('combobox', { name: /Fonds monde/ })).toHaveValue(/europe/i)
  await expect(page.getByText(/deviné d’après son nom|ne se devine pas/)).toHaveCount(0)

  // 9. Nothing in clear.
  expect(bodies.some((body) => body.includes('ciphertext'))).toBe(true)
  for (const word of NEVER_IN_CLEAR) {
    expect(bodies.filter((body) => body.toLowerCase().includes(word))).toEqual([])
  }
})
