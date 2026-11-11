// A platform added during the monthly update (Nicolas, 10 November 2026): the person just bought
// crypto on Coinbase, which is not in their list. The settings refuse a new bank while an update
// runs, so the update's start screen has its own « + Ajouter une banque »: Coinbase is added,
// opens at once, takes its crypto, and both are in Mon argent and in « Mes banques » once saved.

import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, shot, type TestUser } from './support'

test.use({ viewport: { width: 375, height: 812 } })

const user: TestUser = {
  email: `e2e-majbanque-${Date.now()}@example.com`,
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

test('Coinbase added during the update, with its crypto, saved into Mon argent and the banks', async ({ page }) => {
  test.setTimeout(240_000)

  // Every body sent to Supabase: the name of the platform never leaves in clear.
  const supabase = need('NEXT_PUBLIC_SUPABASE_URL')
  const bodies: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(supabase)) return
    const body = request.postData()
    if (body) bodies.push(body)
  })

  // 1. A first launch with one Livret A at BoursoBank.
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
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByText(/10\s000\s€/).first()).toBeVisible({ timeout: 15_000 })

  // 2. The update: Coinbase is not in the list, it is added from the start screen.
  await page.getByRole('link', { name: 'Mettre à jour' }).click()
  await expect(page.getByRole('heading', { name: 'Mettre à jour tes chiffres' })).toBeVisible()
  await page.getByRole('button', { name: '+ Ajouter une banque' }).click()
  await page.getByLabel('Chercher une banque…').fill('coinb')
  await shot(page, 'maj-banque-1-recherche')
  await page.getByRole('button', { name: 'Coinbase', exact: true }).click()

  // 3. It opens at once; crypto comes first on a crypto platform.
  await expect(page.getByRole('heading', { name: 'Coinbase', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '+ Ajouter un compte' }).click()
  await page.getByRole('button', { name: /^Crypto/ }).click()
  await page.getByRole('button', { name: 'Ouvert depuis la dernière fois' }).click()
  await page.getByRole('button', { name: 'Je ne connais que le montant' }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '2500')
  await add(page).click()
  await expect(page.getByRole('button', { name: /2\s500\s€/ })).toBeVisible()
  await shot(page, 'maj-banque-2-coinbase')
  await page.getByRole('button', { name: 'Voir le résultat' }).click()

  // 4. The result, then the save.
  await expect(page).toHaveURL(/\/mise-a-jour\/resultat$/)
  await expect(page.getByText(/^12\s500\s€$/)).toBeVisible()
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByText(/12\s500\s€/).first()).toBeVisible({ timeout: 15_000 })

  // 5. Coinbase is one of the banks now, after BoursoBank.
  await page.goto('/reglages')
  const banks = page.getByRole('region', { name: 'Mes banques' })
  await expect(banks.getByText('BoursoBank', { exact: true })).toBeVisible({ timeout: 15_000 })
  await expect(banks.getByText('Coinbase', { exact: true })).toBeVisible()

  // Nothing typed went in clear: not the platform, not the amount (in cents).
  for (const body of bodies) {
    expect(body.toLowerCase()).not.toContain('coinbase')
    expect(body).not.toContain('250000')
  }
})
