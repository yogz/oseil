// The total paid in on an account, end to end, in a phone-sized browser, against the real Supabase
// project (docs/superpowers/specs/2026-11-14-total-verse-design.md): a confirmed test user is created
// with the secret key before the test, and deleted after it, whatever happens.
//
// Three relevés of one assurance-vie (a fonds euros): the first launch, six days ago on the browser's
// clock, at 20 000 €; an update three days ago at 20 300 €, its total paid in typed as 18 400 €; an
// update today at 21 000 €, its total 19 000 €. The second update says « Soit 600 € versés… », and
// Évolution's « D’où ça vient » counts 600 € of effort. Then the middle relevé's total is corrected
// from its page, and the effort follows.
//
// With E2E_SHOTS=<directory>, the main screens are also saved there as full-page screenshots.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, shot, stillActive, type TestUser } from './support'

test.use({ viewport: { width: 375, height: 812 }, actionTimeout: 20_000 })

const user: TestUser = {
  email: `e2e-total-verse-${Date.now()}@example.com`,
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

function daysAgo(days: number): Date {
  const day = new Date()
  day.setDate(day.getDate() - days)
  day.setHours(12, 0, 0, 0)
  return day
}

// Moves the browser's clock, as a person still there, and reopens Mon argent.
async function moveTo(page: Page, day: Date) {
  await page.clock.setFixedTime(day)
  await stillActive(page)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible({ timeout: 30_000 })
}

// One update of the only bank: the fonds euros at `value`, the total paid in at `total`. `deduced`:
// the sentence expected once the total is typed, or null when none may show.
async function update(page: Page, value: string, total: string, deduced: RegExp | null) {
  await page.getByRole('link', { name: 'Mettre à jour' }).click()
  await expect(page.getByRole('heading', { name: 'Mettre à jour tes chiffres' })).toBeVisible()
  await page.getByRole('button', { name: 'Commencer par BoursoBank' }).click()
  await expect(page.getByRole('heading', { name: 'BoursoBank', exact: true })).toBeVisible()
  const fund = page.getByRole('region', { name: 'Fonds euros', exact: true }).getByLabel('Combien y a-t-il dessus ?')
  await fund.fill(value)
  await fund.blur()
  const paid = page.getByLabel('Total versé depuis l’ouverture')
  // It opens empty, never pre-filled.
  await expect(paid).toHaveValue('')
  await paid.fill(total)
  await paid.blur()
  if (deduced) await expect(page.getByText(deduced)).toBeVisible()
  else await expect(page.getByText(/^Soit .* depuis le /)).toHaveCount(0)
}

async function save(page: Page) {
  await page.getByRole('button', { name: 'Voir le résultat' }).click()
  await expect(page).toHaveURL(/\/mise-a-jour\/resultat$/)
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
}

const comesFrom = (page: Page) => page.getByRole('region', { name: 'D’où ça vient' })
const effortRow = (page: Page) => comesFrom(page).getByRole('listitem').filter({ hasText: 'Ton effort' })

test('the total paid in, typed at two updates, makes the effort, and corrects on a past relevé', async ({ page }) => {
  test.setTimeout(300_000)

  // Every body sent to Supabase during the journey: the totals leave nothing in clear.
  const supabase = need('NEXT_PUBLIC_SUPABASE_URL')
  const bodies: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(supabase)) return
    const body = request.postData()
    if (body) bodies.push(body)
  })
  // The market is never reached: nothing here is followed, and whatever is asked is answered empty.
  await page.route(/\/api\/(quotes|rates)(\/search)?$/, (route) => route.fulfill({ status: 502, json: { ok: false } }))

  // 1. The first launch, six days ago: an assurance-vie with a fonds euros of 20 000 €.
  await page.clock.setFixedTime(daysAgo(6))
  await firstSignIn(page, user)
  await page.getByRole('link', { name: 'C’est parti' }).click()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: /^Assurance-vie/ }).click()
  await add(page).click()
  await page.getByRole('button', { name: '+ Le fonds euros' }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '20000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Fonds euros · 20\s000\s€$/ })).toBeVisible()
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

  // 2. Three days ago: 20 300 €, a first total of 18 400 €. No total before it: nothing deduced.
  await moveTo(page, daysAgo(3))
  await update(page, '20300', '18400', null)
  await shot(page, 'total-1-premier-total')
  await save(page)
  await expect(page.getByText(/20\s300\s€/).first()).toBeVisible({ timeout: 15_000 })

  // 3. Today: 21 000 €, a total of 19 000 €. The previous one is recalled, and the difference said.
  await moveTo(page, new Date())
  await update(page, '21000', '19000', /^Soit 600\s€ versés depuis le /)
  await expect(page.getByText(/Au relevé du .*\s:\s18\s400\s€\./)).toBeVisible()
  await shot(page, 'total-2-soit-verses')
  await page.getByRole('button', { name: 'Voir le résultat' }).click()
  await expect(page).toHaveURL(/\/mise-a-jour\/resultat$/)
  // 700 € more: 600 € of effort, 100 € of markets.
  await expect(page.getByRole('listitem').filter({ hasText: 'Ton effort' }).getByText(/^600\s€$/)).toBeVisible()
  await expect(
    page.getByRole('listitem').filter({ hasText: 'Les marchés et les intérêts' }).getByText(/^100\s€$/),
  ).toBeVisible()
  await shot(page, 'total-3-resultat')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByText(/21\s000\s€/).first()).toBeVisible({ timeout: 15_000 })

  // 4. Évolution, since the first relevé: 1 000 € more, of which 600 € of effort.
  await page.getByRole('link', { name: 'Évolution' }).click()
  await expect(page).toHaveURL(/\/evolution$/)
  await expect(effortRow(page).getByText(/^600\s€$/)).toBeVisible({ timeout: 15_000 })
  await shot(page, 'total-4-d-ou-ca-vient')

  // 5. The middle relevé (20 300 €): its row « Total versé sur Assurance-vie », at 18 400 €.
  const statements = page.getByRole('region', { name: 'Tes relevés' })
  await expect(statements.getByRole('listitem')).toHaveCount(3)
  await statements.getByRole('link').filter({ hasText: /20\s300\s€/ }).click()
  await expect(page).toHaveURL(/\/releve\/[^/]+$/)
  const row = page.getByRole('link', { name: /^Total versé sur Assurance-vie/ })
  await expect(row).toContainText(/18\s400\s€/, { timeout: 15_000 })
  await shot(page, 'total-5-releve')
  await row.click()

  // 6. The correction screen: open on that relevé's own total; 18 600 € in fact.
  await expect(page).toHaveURL(/\/releve\/[^/]+\/total\/[^/]+$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Total versé sur Assurance-vie' })).toBeVisible()
  const field = page.getByLabel('Total versé depuis l’ouverture')
  await expect(field).toHaveValue(/^18\s400$/)
  await field.fill('18600')
  await field.blur()
  await shot(page, 'total-6-correction')
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // 7. Back on the relevé, which says so, with the new total.
  await expect(page.getByText('Corrigé. Ta courbe et D’où ça vient en tiennent compte.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /^Total versé sur Assurance-vie/ })).toContainText(/18\s600\s€/)

  // 8. Évolution: the effort of the last period is now 19 000 − 18 600 = 400 €.
  await page.getByRole('link', { name: '‹ Évolution' }).click()
  await expect(page).toHaveURL(/\/evolution(#releves)?$/)
  await expect(effortRow(page).getByText(/^400\s€$/)).toBeVisible({ timeout: 15_000 })

  // The oldest relevé had none: its row asks for it.
  await page.getByRole('region', { name: 'Tes relevés' }).getByRole('link').filter({ hasText: /20\s000\s€/ }).click()
  await expect(page.getByRole('link', { name: /^Total versé sur Assurance-vie/ })).toContainText('à recopier', { timeout: 15_000 })

  // Nothing in clear.
  expect(bodies.some((body) => body.includes('ciphertext'))).toBe(true)
  // The names, and the totals in cents (18 400 €, 19 000 €, 18 600 €).
  for (const word of ['assurance-vie', 'fonds euros', '1840000', '1900000', '1860000']) {
    expect(bodies.filter((body) => body.toLowerCase().includes(word))).toEqual([])
  }
})
