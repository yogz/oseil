// A forgotten password, in a phone-sized browser, against the real Supabase
// project. A confirmed test user is created with the secret key, signs in once
// through the library — which creates the vault and hands back its recovery
// key — and seals a document; the user is deleted after, whatever happens.
//
// No e-mail is ever sent. The reset request is answered in the browser
// itself, and the reset links are made by the admin API, which only returns
// them: the link the e-mail would carry, and that leads to the same place.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { signIn as signInWithLibrary } from '../lib/auth/account'
import { memoryKeyStore } from '../lib/vault/device'
import { deriveSecrets } from '../lib/vault/kdf'
import { loadDocuments, resetWithRecoveryKey, saveDocument, unlockVault } from '../lib/vault/store'
import { confirmRecoveryKey, expectApplication, keysOnDevice, need, signInThroughPage } from './support'

test.use({ viewport: { width: 390, height: 844 } })
// Each journey starts from where the previous one left the account.
test.describe.configure({ mode: 'serial' })

const BASE = 'http://localhost:3000'
const email = `e2e-mot-de-passe-${Date.now()}@example.com`
const password = randomBytes(12).toString('base64url')
const newPassword = randomBytes(12).toString('base64url')
const freshPassword = randomBytes(12).toString('base64url')
const PROFILE = { firstName: 'Camille', household: 2 }
let admin: SupabaseClient
let userId: string | null = null
let recovery = ''

function libraryClient(): SupabaseClient {
  return createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

test.beforeAll(async () => {
  admin = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  // What the application sends as a password is the secret derived from it.
  const { authSecret } = await deriveSecrets(password, email)
  const { data, error } = await admin.auth.admin.createUser({ email, password: authSecret, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  userId = data.user.id

  // The first sign-in creates the vault, exactly as the sign-in screen does.
  const client = libraryClient()
  const keys = memoryKeyStore()
  const first = await signInWithLibrary(client, keys, { email, password })
  if (first.status !== 'new-vault') throw new Error('The test user should have started without a vault')
  recovery = first.recoveryDisplay
  await saveDocument(client, (await keys.get(userId))!, { kind: 'profile', value: PROFILE })
  await client.auth.signOut({ scope: 'local' })
})

test.afterAll(async () => {
  // Deleting the user cascades to its vault and documents.
  if (!userId) return
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(`Cleanup of the test user failed: ${error.message}`)
})

// The profile documents this password opens, read the way the application
// reads them — or « refused » when the password no longer signs in.
async function documentsOpenedBy(secret: string): Promise<unknown[] | 'refused'> {
  const client = libraryClient()
  const { authSecret, keyEncryptionKey } = await deriveSecrets(secret, email)
  const { error } = await client.auth.signInWithPassword({ email, password: authSecret })
  if (error?.code === 'invalid_credentials') return 'refused'
  if (error) throw error
  try {
    const dataKey = await unlockVault(client, keyEncryptionKey)
    if (dataKey === 'missing') throw new Error('The vault is missing')
    return (await loadDocuments(client, dataKey, 'profile')).documents.map((document) => document.value)
  } finally {
    await client.auth.signOut({ scope: 'local' })
  }
}

// The link of the reset e-mail, opened in this browser: Supabase checks it and
// sends the person on to the screen, with the session in the fragment.
async function openResetLink(page: Page) {
  const { data, error } = await admin.auth.admin.generateLink({
    type: 'recovery',
    email,
    options: { redirectTo: `${BASE}/nouveau-mot-de-passe` },
  })
  if (error) throw new Error(`generateLink failed: ${error.message}`)
  await page.goto(data.properties.action_link)
  await expect(page.getByRole('heading', { name: 'Nouveau mot de passe' })).toBeVisible()
  await expect(page.getByLabel('Nouveau mot de passe')).toBeVisible({ timeout: 15_000 })
  // The tokens have left the address bar. Checked without printing the
  // address: on failure, the message would show them.
  const address = page.url()
  expect(address.startsWith(`${BASE}/nouveau-mot-de-passe`)).toBe(true)
  expect(address.includes('#') || address.includes('token'), 'tokens left in the address bar').toBe(false)
}

test('asking for a link sends the address only, for a link any browser can open', async ({ page }) => {
  // Answered here: no request reaches Supabase, no e-mail leaves.
  const asked: Array<{ url: URL; body: Record<string, unknown> }> = []
  await page.route(
    (url) => url.pathname === '/auth/v1/recover',
    async (route) => {
      asked.push({ url: new URL(route.request().url()), body: route.request().postDataJSON() })
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        headers: { 'access-control-allow-origin': '*' },
        body: '{}',
      })
    },
  )

  await page.goto('/connexion')
  await page.getByRole('link', { name: 'Mot de passe oublié ?' }).click()
  await expect(page).toHaveURL(/\/mot-de-passe-oublie$/)
  await expect(page.getByRole('heading', { name: 'Mot de passe oublié' })).toBeVisible()
  await expect(
    page.getByText(
      "On t’envoie un lien pour en choisir un nouveau. Pour retrouver tes chiffres, il te faudra aussi ta clé de secours.",
    ),
  ).toBeVisible()

  await page.getByLabel('Ton adresse e-mail').fill(email.toUpperCase())
  await page.getByRole('button', { name: 'Envoyer le lien' }).click()
  await expect(page.getByText('Si un compte existe pour cette adresse, un lien vient de partir.')).toBeVisible()

  expect(asked).toHaveLength(1)
  expect(asked[0].body.email).toBe(email)
  // No PKCE challenge: the link would only work in the browser that asked.
  expect(asked[0].body.code_challenge ?? null).toBeNull()
  expect(asked[0].url.searchParams.get('redirect_to')).toBe(`${BASE}/nouveau-mot-de-passe`)
})

test('the reset link and a recovery key typed by hand bring back the documents sealed before', async ({ page }) => {
  test.setTimeout(120_000)

  // Everything the page sends: addresses and bodies.
  const sent: string[] = []
  page.on('request', (request) => {
    sent.push(request.url())
    const body = request.postData()
    if (body) sent.push(body)
  })

  await openResetLink(page)

  // A wrong key is refused, and the form stays as typed.
  await page.getByLabel('Ta clé de secours').fill('0'.repeat(32))
  await page.getByLabel('Nouveau mot de passe').fill(newPassword)
  await page.getByLabel('Confirme ton mot de passe').fill(newPassword)
  await page.getByRole('button', { name: 'Retrouver mes chiffres' }).click()
  await expect(page.getByText(/Cette clé de secours ne correspond pas à ton compte/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByLabel('Nouveau mot de passe')).toHaveValue(newPassword)

  // The right one, as someone copies it from paper: lower case, no dashes.
  const typed = recovery.replaceAll('-', '').toLowerCase()
  await page.getByLabel('Ta clé de secours').fill(typed)
  await page.getByRole('button', { name: 'Retrouver mes chiffres' }).click()

  // Signed in with the new password, the vault open on this device.
  await expect(page).toHaveURL(/\/(premier-lancement)?$/, { timeout: 30_000 })
  await expectApplication(page)
  expect(await keysOnDevice(page)).toBe(1)

  // The document sealed before opens with the new password; the old one no
  // longer signs in.
  expect(await documentsOpenedBy(newPassword)).toEqual([PROFILE])
  expect(await documentsOpenedBy(password)).toBe('refused')

  // And through the sign-in screen: the old password is refused, the new one
  // opens the vault.
  // « Se déconnecter » lives in the Réglages.
  await page.goto('/reglages')
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion$/)
  await signInThroughPage(page, email, password)
  await expect(page.getByText('Adresse e-mail ou mot de passe incorrect. Vérifie-les et réessaie.')).toBeVisible({ timeout: 30_000 })
  await signInThroughPage(page, email, newPassword)
  await expect(page).toHaveURL(/\/(premier-lancement)?$/, { timeout: 30_000 })
  await expectApplication(page)

  // Neither password, nor the recovery key as shown or as typed, ever left
  // the browser.
  for (const secret of [password, newPassword, recovery, recovery.replaceAll('-', ''), typed]) {
    expect(sent.filter((item) => item.includes(secret))).toEqual([])
  }
})

test('without the key, starting over gives an empty vault and a new key that opens it', async ({ page }) => {
  test.setTimeout(120_000)
  await openResetLink(page)

  await page.getByRole('button', { name: 'Je n’ai plus ma clé de secours' }).click()
  await expect(
    page.getByText(
      'Sans ta clé, tes chiffres sont perdus pour de bon. Si tu les as téléchargés dans les Réglages, tu pourras les reprendre juste après. Tu peux repartir de zéro avec un coffre vide.',
    ),
  ).toBeVisible()
  await page.getByLabel('Nouveau mot de passe').fill(freshPassword)
  await page.getByLabel('Confirme ton mot de passe').fill(freshPassword)
  const startOver = page.getByRole('button', { name: 'Repartir de zéro' })
  await expect(startOver).toBeDisabled()
  await page.getByLabel('Tape « repartir de zéro » pour confirmer').fill(' Repartir de zéro ')
  await expect(startOver).toBeEnabled()
  await startOver.click()

  // A new recovery key, shown once, as at the first sign-in.
  await expect(page.getByRole('heading', { name: 'Ta clé de secours' })).toBeVisible({ timeout: 30_000 })
  const shown = page.getByText(/^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/)
  const newRecovery = (await shown.textContent())!
  expect(newRecovery).not.toBe(recovery)
  // On the screen and nowhere else: not in the address, not in any browser
  // storage, not in a cookie.
  const kept = await page.evaluate(() =>
    JSON.stringify({ url: location.href, local: { ...localStorage }, session: { ...sessionStorage }, cookie: document.cookie }),
  )
  expect(kept.includes(newRecovery) || kept.includes(newRecovery.replaceAll('-', '')), 'new key kept').toBe(false)
  await confirmRecoveryKey(page)

  await expect(page).toHaveURL(/\/(premier-lancement)?$/)
  await expectApplication(page)
  expect(await keysOnDevice(page)).toBe(1)

  // The vault is empty, opened by the fresh password only.
  expect(await documentsOpenedBy(freshPassword)).toEqual([])
  expect(await documentsOpenedBy(newPassword)).toBe('refused')

  // The new key is the vault's: it resets the password once more.
  const client = libraryClient()
  const { authSecret } = await deriveSecrets(freshPassword, email)
  const { error } = await client.auth.signInWithPassword({ email, password: authSecret })
  if (error) throw error
  await resetWithRecoveryKey(client, { recoveryDisplay: newRecovery, newPassword: password, email })
  await client.auth.signOut({ scope: 'local' })
  expect(await documentsOpenedBy(password)).toEqual([])
})
