// The Réglages, end to end, in a phone-sized browser, against the real Supabase project: a confirmed
// test user is created with the secret key before the test, and deleted after it, whatever happens.
//
// Face ID is not part of this journey: its key is bound to the real site's address, so it cannot be
// activated here. Its list is covered by the unit tests and by e2e/face-id.live.spec.ts.
//
// With E2E_SHOTS=<directory>, the main screens are also saved there as full-page screenshots.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import {
  confirmRecoveryKey,
  expectApplication,
  fill,
  firstSignIn,
  need,
  shot,
  signInThroughPage,
  type TestUser,
} from './support'

test.use({ viewport: { width: 375, height: 812 } })

const user: TestUser = {
  email: `e2e-reglages-${Date.now()}@example.com`,
  password: randomBytes(12).toString('base64url'),
  id: null,
}
const newPassword = randomBytes(12).toString('base64url')
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
const section = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

// A number alone between two non-base64 characters: what a typed amount (in cents) would look like if
// it were sent in clear. Inside a sealed packet, the same digits are surrounded by base64 characters.
const standalone = (value: string) => new RegExp(`(^|[^A-Za-z0-9+/_=-])${value}([^A-Za-z0-9+/_=-]|$)`)

test('the settings, from the first launch to a new password and a new recovery key', async ({ page }) => {
  test.setTimeout(300_000)

  const supabase = need('NEXT_PUBLIC_SUPABASE_URL')
  const bodies: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(supabase)) return
    const body = request.postData()
    if (body) bodies.push(body)
  })

  // 1. A short first launch: one bank, a Livret A of 10 000 €.
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

  // 2. Mon argent leads to the Réglages.
  await page.getByRole('link', { name: 'Réglages', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible()
  // The first two titles open their screen (planche 3B): « Mes objectifs › ».
  await expect(page.getByRole('heading', { level: 2 })).toHaveText([
    /^Mes objectifs\s*›$/,
    /^Mes dépenses par mois\s*›$/,
    'Mes banques',
    'Affichage',
    'Mes chiffres en fichier',
    'Le rappel de mise à jour',
    'Mon compte',
  ])
  await expect(section(page, 'Mon compte').getByText(user.email)).toBeVisible()
  await shot(page, 'reglages-1-ecran')

  // 3. % and back.
  await section(page, 'Affichage').getByRole('button', { name: 'En %' }).click()
  await expect(section(page, 'Affichage').getByRole('button', { name: 'En %' })).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('link', { name: '‹ Mon argent' }).click()
  await expect(page.getByRole('button', { name: /\d\s?%$/ }).first()).toBeVisible({ timeout: 15_000 })
  await shot(page, 'reglages-2-pourcents')
  await page.getByRole('link', { name: 'Réglages', exact: true }).click()
  await section(page, 'Affichage').getByRole('button', { name: 'En euros' }).click()
  await expect(section(page, 'Affichage').getByRole('button', { name: 'En euros' })).toHaveAttribute('aria-pressed', 'true')

  // 4. The monthly spending comes from the first launch screen and returns here.
  await section(page, 'Mes dépenses par mois').getByRole('link', { name: 'Mes dépenses par mois' }).click()
  await expect(page).toHaveURL(/\/premier-lancement\/depenses\?depuis=reglages$/)
  await fill(page, 'Tes dépenses par mois', '2000')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/reglages$/)
  await expect(section(page, 'Mes dépenses par mois')).toContainText(/2\s000\s€/)
  await page.getByRole('link', { name: '‹ Mon argent' }).click()
  await page.getByRole('link', { name: 'Repères', exact: true }).click()
  await expect(page.getByText(/couvrirait environ 5\smois de dépenses/)).toBeVisible({ timeout: 15_000 })
  await shot(page, 'reglages-3-reperes-coussin')

  // 5. Amounts masked: « ••• » on Mon argent, and the grid stays.
  await page.goto('/reglages')
  await section(page, 'Affichage').getByRole('switch', { name: 'Masquer les montants' }).check()
  await expect(section(page, 'Affichage').getByRole('switch')).toBeChecked()
  await page.getByRole('link', { name: '‹ Mon argent' }).click()
  await expect(page.getByText('•••').first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/\d\s€/)).toHaveCount(0)
  await expect(page.locator('[data-square]')).toHaveCount(100)
  await shot(page, 'reglages-4-montants-masques')
  await page.getByRole('link', { name: 'Réglages', exact: true }).click()
  await section(page, 'Affichage').getByRole('switch', { name: 'Masquer les montants' }).uncheck()
  await expect(section(page, 'Affichage').getByRole('switch')).not.toBeChecked()

  // 6. A bank is added, moved up, and removed.
  const banks = section(page, 'Mes banques')
  await banks.getByRole('button', { name: '+ Ajouter une banque' }).click()
  await banks.getByLabel('Chercher une banque…').fill('Revolut')
  await banks.getByRole('button', { name: 'Revolut', exact: true }).click()
  await expect(banks.getByRole('button', { name: 'Retirer : Revolut' })).toBeVisible({ timeout: 15_000 })
  await expect(banks.getByRole('listitem').first()).toContainText('BoursoBank')
  // The arrows are hidden at rest (planche 2B): « Changer l’ordre » shows them, « Terminé » hides them.
  await expect(banks.getByRole('button', { name: /^Monter/ })).toHaveCount(0)
  await banks.getByRole('button', { name: 'Changer l’ordre' }).click()
  await banks.getByRole('button', { name: 'Monter : Revolut' }).click()
  await expect(banks.getByRole('listitem').first()).toContainText('Revolut', { timeout: 15_000 })
  await banks.getByRole('button', { name: 'Terminé' }).click()
  await expect(banks.getByRole('button', { name: /^Monter/ })).toHaveCount(0)
  await shot(page, 'reglages-5-banques')
  // A bank that still holds an account has no « Retirer ».
  await expect(banks.getByRole('button', { name: 'Retirer : BoursoBank' })).toHaveCount(0)
  await banks.getByRole('button', { name: 'Retirer : Revolut' }).click()
  await expect(banks.getByRole('button', { name: 'Retirer : Revolut' })).toHaveCount(0, { timeout: 15_000 })
  await expect(banks.getByRole('listitem')).toHaveCount(1)

  // 7. The password: a wrong current one is refused, the right one changes it.
  const account = section(page, 'Mon compte')
  await expect(account.getByText('Aucune clé Face ID pour l’instant.')).toBeVisible({ timeout: 15_000 })
  await account.getByRole('button', { name: 'Changer de mot de passe' }).click()
  await account.getByLabel('Mot de passe actuel').fill('pas-du-tout-le-bon')
  await account.getByLabel('Nouveau mot de passe', { exact: true }).fill(newPassword)
  await account.getByLabel('Nouveau mot de passe, encore une fois').fill(newPassword)
  await account.getByRole('button', { name: 'Changer le mot de passe' }).click()
  await expect(account.getByText('Ce n’est pas ton mot de passe actuel.')).toBeVisible({ timeout: 30_000 })
  await account.getByLabel('Mot de passe actuel').fill(user.password)
  await shot(page, 'reglages-6-mot-de-passe')
  await account.getByRole('button', { name: 'Changer le mot de passe' }).click()
  await expect(account.getByText('Ton mot de passe a changé.')).toBeVisible({ timeout: 30_000 })

  // 8. Signed out, the old password no longer opens the account; the new one does.
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion$/)
  await signInThroughPage(page, user.email, user.password)
  await expect(page.getByText('Adresse e-mail ou mot de passe incorrect. Vérifie-les et réessaie.')).toBeVisible({ timeout: 30_000 })
  await signInThroughPage(page, user.email, newPassword)
  await expectApplication(page)
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible({ timeout: 30_000 })

  // 9. A new recovery key, shown once, confirmed.
  await page.getByRole('link', { name: 'Réglages', exact: true }).click()
  await account.getByRole('button', { name: 'Refaire ma clé de secours' }).click()
  await account.getByLabel('Ton mot de passe').fill(newPassword)
  await account.getByRole('button', { name: 'Recevoir une nouvelle clé' }).click()
  await expect(page.getByRole('heading', { name: 'Ta clé de secours' })).toBeVisible({ timeout: 30_000 })
  await shot(page, 'reglages-7-cle-de-secours')
  await confirmRecoveryKey(page)
  await expect(page.getByText('Ta nouvelle clé de secours est en place.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Ta clé de secours' })).toHaveCount(0)
  await shot(page, 'reglages-8-fin')

  // Neither password, nor any typed amount or name, ever left the browser in clear.
  for (const secret of [user.password, newPassword, 'pas-du-tout-le-bon', 'Revolut', 'BoursoBank', 'Livret A']) {
    expect(bodies.filter((body) => body.includes(secret))).toEqual([])
  }
  for (const cents of ['1000000', '200000', '10000', '2000']) {
    expect(bodies.filter((body) => standalone(cents).test(body))).toEqual([])
  }
})
