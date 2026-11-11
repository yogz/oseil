// The whole account journey, in a phone-sized browser, against the real
// Supabase project: a confirmed test user is created with the secret key
// before the test, and deleted after it, whatever happens in between.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { askedGroup, expectApplication, keysOnDevice, need, SHOWN_KEY, signInThroughPage as signIn } from './support'

test.use({ viewport: { width: 390, height: 844 } })

const email = `e2e-compte-${Date.now()}@example.com`
const password = randomBytes(12).toString('base64url')
const wrongPassword = randomBytes(12).toString('base64url')
let admin: SupabaseClient
let userId: string | null = null

test.beforeAll(async () => {
  admin = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // What the application sends as a password is the secret derived from it.
  const { authSecret } = await deriveSecrets(password, email)
  const { data, error } = await admin.auth.admin.createUser({ email, password: authSecret, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  userId = data.user.id
})

test.afterAll(async () => {
  // Deleting the user cascades to its vault.
  if (!userId) return
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(`Cleanup of the test user failed: ${error.message}`)
})

test('sign in, see the recovery key once, stay signed in, sign out', async ({ page }) => {
  test.setTimeout(120_000)

  // Everything the page sends: addresses and bodies.
  const sent: string[] = []
  page.on('request', (request) => {
    sent.push(request.url())
    const body = request.postData()
    if (body) sent.push(body)
  })

  // A visitor without a session sees the landing at the address of the site,
  // which keeps its address; its internal path leads back there.
  const first = await page.goto('/')
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Ton argent, en 100 carrés' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible()
  await page.goto('/accueil')
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/)
  await expect(page.getByRole('link', { name: 'J’ai déjà un compte' })).toBeVisible()
  // Any other screen sends that visitor to sign in.
  await page.goto('/reglages')
  await expect(page).toHaveURL(/\/connexion$/)
  // Under `npm run test:e2e:prod`, proof that the journey runs under the
  // production policy, the one without eval.
  if (process.env.E2E_PROD === '1') {
    expect(first?.headers()['content-security-policy']).toContain("'wasm-unsafe-eval'")
    expect(first?.headers()['content-security-policy']).not.toMatch(/'unsafe-eval'/)
  }
  await expect(page.getByRole('heading', { name: 'Te connecter' })).toBeVisible()

  // A wrong password says so, plainly.
  await signIn(page, email, wrongPassword)
  await expect(page.getByText('Adresse e-mail ou mot de passe incorrect. Vérifie-les et réessaie.')).toBeVisible({ timeout: 30_000 })

  // The right one, with the address typed in capitals: the first sign-in
  // creates the vault and shows its recovery key.
  await signIn(page, email.toUpperCase(), password)
  await expect(page.getByRole('heading', { name: 'Ta clé de secours' })).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/\/cle-de-secours$/)
  const shown = page.getByText(SHOWN_KEY)
  await expect(shown).toBeVisible()
  const recovery = (await shown.textContent())!
  const compact = recovery.replaceAll('-', '')

  // The key is on the screen and nowhere else: not in the address, not in
  // any browser storage, not in a cookie.
  const kept = await page.evaluate(() =>
    JSON.stringify({ url: location.href, local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }),
  )
  expect(kept).not.toContain(recovery)
  expect(kept).not.toContain(compact)

  // « Je l’ai rangée » hides the key and asks for one of its groups.
  await page.getByRole('button', { name: 'Je l’ai rangée' }).click()
  await expect(page.getByRole('heading', { name: /^Rangée pour de vrai/ })).toBeVisible()
  await expect(page.getByText(SHOWN_KEY)).toHaveCount(0)
  const groups = recovery.split('-')
  const firstAsked = await askedGroup(page)
  const field = page.getByRole('textbox', { name: /morceau$/ })
  const done = page.getByRole('button', { name: 'C’est fait' })
  await expect(done).toBeDisabled()
  // Another group is refused.
  await field.fill(groups[(firstAsked + 1) % 8])
  await done.click()
  await expect(page.getByText(/^Ce n’est pas ce morceau-là/)).toBeVisible()
  // Looking at the key again shows the same key, then asks for another group.
  await page.getByRole('button', { name: 'Oups, revoir ma clé' }).click()
  await expect(page.getByText(SHOWN_KEY)).toHaveText(recovery)
  await page.getByRole('button', { name: 'Je l’ai rangée' }).click()
  const secondAsked = await askedGroup(page)
  expect(secondAsked).not.toBe(firstAsked)
  await field.fill(groups[secondAsked].toLowerCase())
  await done.click()

  // A person with nothing yet is sent on to the first launch.
  await expect(page).toHaveURL(/\/premier-lancement$/, { timeout: 15_000 })
  await expectApplication(page)
  expect(await keysOnDevice(page)).toBe(1)

  // A reload keeps the person signed in, and the vault open.
  await page.reload()
  await expect(page).toHaveURL(/\/premier-lancement$/)
  await expectApplication(page)

  // With a session, the landing's internal path leads home like `/` does: no landing.
  await page.goto('/accueil')
  await expect(page).toHaveURL(/\/premier-lancement$/, { timeout: 15_000 })
  await expectApplication(page)
  // The first launch shares the landing's title: what tells them apart is the session.
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Me connecter' })).toHaveCount(0)

  // The key screen, opened again by a full page load (a reload, a bookmark),
  // has nothing to show: the key was in memory only. It leads home, which
  // sends a person with nothing yet on to the first launch.
  await page.goto('/cle-de-secours')
  await expect(page).toHaveURL(/\/premier-lancement$/, { timeout: 15_000 })
  await expectApplication(page)

  // Signing out leads back to /connexion, and the key has left the device.
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion$/)
  expect(await keysOnDevice(page)).toBe(0)

  // The session is closed too: the home screen is out of reach again, and the
  // address of the site shows the landing.
  await page.goto('/')
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Ton argent, en 100 carrés' })).toBeVisible()
  // An account has served on this browser: signing in comes first.
  await expect(page.getByRole('link', { name: 'Me connecter' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toHaveCount(0)
  await page.goto('/reglages')
  await expect(page).toHaveURL(/\/connexion$/)

  // The key was confirmed with « Continuer »: signing in again does not show a
  // new one.
  await signIn(page, email, password)
  await expect(page).toHaveURL(/\/premier-lancement$/, { timeout: 30_000 })
  await expectApplication(page)
  await expect(page.getByRole('link', { name: 'Me connecter' })).toHaveCount(0)
  await expect(page.getByRole('heading', { name: 'Ta clé de secours' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion$/)

  // Neither password, nor the recovery key, ever left the browser.
  for (const secret of [password, wrongPassword, recovery, compact]) {
    expect(sent.filter((item) => item.includes(secret))).toEqual([])
  }
})
