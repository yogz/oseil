// Deleting one's account, in a phone-sized browser, against the real Supabase project: a confirmed
// test user is created with the secret key, signs in, and deletes the account from the Réglages.
// Needs the migration of `delete_my_account` in that project. The user is removed after the test
// only if it still exists.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { firstSignIn, keysOnDevice, need, signInThroughPage } from './support'

test.use({ viewport: { width: 390, height: 844 } })

const email = `e2e-supprimer-${Date.now()}@example.com`
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
  // The account is normally gone already; delete it only if the journey stopped before.
  if (!userId) return
  const { data } = await admin.auth.admin.getUserById(userId)
  if (!data.user) return
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(`Cleanup of the test user failed: ${error.message}`)
})

test('delete the account from the Réglages, with the password', async ({ page }) => {
  test.setTimeout(120_000)

  // Everything the page sends: addresses and bodies.
  const sent: string[] = []
  page.on('request', (request) => {
    sent.push(request.url())
    const body = request.postData()
    if (body) sent.push(body)
  })

  await firstSignIn(page, { email, password, id: userId })
  expect(await keysOnDevice(page)).toBe(1)

  // The last row of « Mon compte » leads to the screen.
  await page.goto('/reglages')
  await page.getByRole('link', { name: 'Supprimer mon compte' }).click()
  await expect(page).toHaveURL(/\/reglages\/supprimer$/)
  await expect(page.getByRole('heading', { name: 'Supprimer mon compte' })).toBeVisible()

  // A wrong password is refused, and nothing is deleted.
  const field = page.getByLabel('Ton mot de passe, pour confirmer')
  const button = page.getByRole('button', { name: 'Supprimer mon compte et mes chiffres' })
  await expect(button).toBeEnabled({ timeout: 15_000 })
  await field.fill(wrongPassword)
  await button.click()
  await expect(page.getByText('Ce n’est pas ton mot de passe actuel.')).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/\/reglages\/supprimer$/)
  expect((await admin.auth.admin.getUserById(userId!)).data.user).not.toBeNull()

  // The right one deletes the account and leads to the landing, with its goodbye.
  await field.fill(password)
  await button.click()
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/\?compte=supprime$/, { timeout: 60_000 })
  await expect(page.getByText('Ton compte a été supprimé.')).toBeVisible()
  expect(await keysOnDevice(page)).toBe(0)

  // The account is gone: signing in again fails, and the admin API does not find it.
  await page.goto('/connexion')
  await signInThroughPage(page, email, password)
  await expect(page.getByText('Adresse e-mail ou mot de passe incorrect. Vérifie-les et réessaie.')).toBeVisible({
    timeout: 30_000,
  })
  const { data } = await admin.auth.admin.getUserById(userId!)
  expect(data.user).toBeNull()

  // The password never left the browser.
  for (const secret of [password, wrongPassword]) {
    expect(sent.filter((item) => item.includes(secret))).toEqual([])
  }
})
