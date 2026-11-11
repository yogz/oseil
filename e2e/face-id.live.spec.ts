// The Face ID journey, live: against the real site, once the branch is merged
// and passkeys are enabled in the production auth settings. A passkey is tied
// to the site's address, so no local server can stand in. A virtual
// authenticator, through the DevTools protocol, stands in for the phone's:
// it checks the person and gives the PRF secret.
//
// Never part of `test:e2e` or `test:e2e:prod`: playwright.config.ts leaves
// `*.live.spec.ts` out unless E2E_LIVE=1. Run it by hand:
//   E2E_LIVE=1 mise exec -- npx playwright test e2e/face-id.live.spec.ts
//
// A confirmed test user is created with the secret key before the test, and
// deleted after it, whatever happens in between: its vault, its Face ID row
// and its passkey go with it.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { faceIdNoLongerOpens, type FaceIdLabel } from '../lib/auth/messages'
import { deriveSecrets } from '../lib/vault/kdf'
import { prfSalt } from '../lib/vault/passkey'
import { confirmRecoveryKey, expectApplication, keysOnDevice, need, signInThroughPage as signIn } from './support'

const LIVE = process.env.E2E_LIVE === '1'
// The relying party the production auth settings name.
const RP_ID = 'oseil.fr'

test.skip(!LIVE, 'Live only: E2E_LIVE=1, against https://oseil.fr, after the merge')
test.use({ baseURL: `https://${RP_ID}`, viewport: { width: 390, height: 844 } })

const email = `e2e-face-id-${Date.now()}@example.com`
const password = randomBytes(12).toString('base64url')
let admin: SupabaseClient
let userId: string | null = null

test.beforeAll(async () => {
  if (!LIVE) return
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
  // Deleting the user cascades to its vault and its Face ID row.
  if (!userId) return
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(`Cleanup of the test user failed: ${error.message}`)
})

async function signOut(page: Page) {
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion$/)
}

type Sent = { url: string; body: string; raw: Buffer | null }

// A query string leaves percent-encoded: it is read decoded too.
function decoded(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

// The forms of the secret found in what was sent, one line per request and
// form, as the unit tests scan for them (lib/auth/__tests__/face-id.test.ts):
// the raw bytes, base64 (with or without its padding), base64url, hex and a
// list of bytes.
function secretsIn(sent: Sent[], secret: Buffer): string[] {
  const forms = [
    { name: 'base64', text: secret.toString('base64').replace(/=+$/, '') },
    { name: 'base64url', text: secret.toString('base64url') },
    { name: 'hex', text: secret.toString('hex') },
    { name: 'hex in capitals', text: secret.toString('hex').toUpperCase() },
    { name: 'a list of bytes', text: [...secret].join(',') },
  ]
  return sent.flatMap(({ url, body, raw }) => [
    ...(raw?.includes(secret) ? [`${url}: raw bytes`] : []),
    ...forms
      .filter(({ text }) => [url, decoded(url), body].some((part) => part.includes(text)))
      .map(({ name }) => `${url}: ${name}`),
  ])
}

// The passkey's PRF secret itself, asked of the virtual authenticator with
// stefin's salt, in the page: the same secret the application received.
async function prfSecretOf(page: Page, credentialId: string): Promise<Buffer> {
  const secret = await page.evaluate(
    async ({ rpId, id, salt }) => {
      const credential = (await navigator.credentials.get({
        publicKey: {
          challenge: crypto.getRandomValues(new Uint8Array(32)),
          rpId,
          allowCredentials: [{ type: 'public-key', id: Uint8Array.from(atob(id), (c) => c.charCodeAt(0)) }],
          userVerification: 'required',
          extensions: { prf: { eval: { first: new Uint8Array(salt) } } },
        },
      })) as PublicKeyCredential
      const first = credential.getClientExtensionResults().prf?.results?.first
      return first ? [...new Uint8Array(first as ArrayBuffer)] : null
    },
    // The DevTools protocol gives the credential id in base64.
    { rpId: RP_ID, id: credentialId, salt: [...prfSalt()] },
  )
  expect(secret, 'the virtual authenticator gives the PRF secret').not.toBeNull()
  expect(secret).toHaveLength(32)
  return Buffer.from(secret!)
}

test('Face ID after a password, then the vault opened with one gesture', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The virtual authenticator is Chromium’s')
  test.setTimeout(240_000)

  // Before the first page loads: the sign-in page asks the browser, as it
  // opens, whether it can create a passkey.
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable', { enableUI: false })
  const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
      hasPrf: true,
    },
  })

  // Everything the page sends, wherever it goes: addresses and bodies, as text
  // and as bytes.
  const sent: Sent[] = []
  page.on('request', (request) => {
    sent.push({ url: request.url(), body: request.postData() ?? '', raw: request.postDataBuffer() })
  })

  // 1. The first sign-in, by password, creates the vault and shows its
  //    recovery key, confirmed here. No offer: the key was just made.
  await page.goto('/connexion')
  await expect(page.getByRole('heading', { name: 'Te connecter' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Utiliser / })).toBeVisible()
  await signIn(page, email, password)
  await expect(page.getByRole('heading', { name: 'Ta clé de secours' })).toBeVisible({ timeout: 30_000 })
  await confirmRecoveryKey(page)
  await expect(page).toHaveURL(/\/premier-lancement$/, { timeout: 15_000 })
  await expectApplication(page)

  // 2.
  await signOut(page)

  // 3. Signing in by password again: the key is confirmed, the device has no
  //    marker, the browser can. The offer shows; « Activer » makes the passkey.
  await signIn(page, email, password)
  await expect(page.getByRole('heading', { name: /^Ouvrir avec .+ la prochaine fois \?$/ })).toBeVisible({
    timeout: 30_000,
  })
  const activate = page.getByRole('button', { name: 'Activer' })
  await expect(activate).toBeEnabled()
  await activate.click()
  // The secret comes with the creation, or with a second gesture.
  const confirm = page.getByRole('button', { name: /^Confirmer avec / })
  await expect(confirm.or(page.getByRole('heading', { name: 'Ton argent, en 100 carrés' }))).toBeVisible({
    timeout: 30_000,
  })
  if (await confirm.isVisible()) await confirm.click()
  await expect(page).toHaveURL(/\/premier-lancement$/, { timeout: 30_000 })
  await expectApplication(page)
  // Since lot 6a the marker names this device's key: « 1:<credential id> ».
  expect(await page.evaluate(() => localStorage.getItem('stefin-face-id'))).toMatch(/^1:.+/)

  // One passkey on the device, and its row, under the same WebAuthn id.
  const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId })
  expect(credentials).toHaveLength(1)
  const { data: rows, error } = await admin.from('vault_passkeys').select('credential_id').eq('user_id', userId!)
  expect(error).toBeNull()
  expect(rows).toEqual([{ credential_id: Buffer.from(credentials[0].credentialId, 'base64').toString('base64url') }])

  // The secret to look for in everything sent, from the passkey itself.
  const secret = await prfSecretOf(page, credentials[0].credentialId)
  // A scan that cannot see the secret proves nothing: it finds it where it is.
  // Not alone, for base64url: without + or /, base64 writes the same text.
  const carrier = `https://x.test/?q=${secret.toString('base64url')}`
  expect(secretsIn([{ url: carrier, body: '', raw: null }], secret)).toContain(`${carrier}: base64url`)
  expect(secretsIn([{ url: 'https://x.test/', body: 'x', raw: Buffer.concat([Buffer.from('x'), secret]) }], secret)).toContain(
    'https://x.test/: raw bytes',
  )

  // 4. Signing out leaves Face ID in place: it is how the person comes back.
  await signOut(page)
  expect(await keysOnDevice(page)).toBe(0)

  // 5. One gesture opens the session and the vault: the empty vault's first launch.
  const faceId = page.getByRole('button', { name: /^Utiliser / })
  await expect(faceId).toBeEnabled({ timeout: 15_000 })
  await faceId.click()
  await expect(page).toHaveURL(/\/premier-lancement$/, { timeout: 30_000 })
  await expectApplication(page)
  expect(await keysOnDevice(page)).toBe(1)

  // 6.
  await signOut(page)

  // 7. The passkey removed from Supabase, as a start-over on another device
  //    would: GoTrue refuses it, the screen sends the person to their
  //    password, and the marker goes so that the offer can come back. This is
  //    where the code's reading of GoTrue's refusal (a 4xx) is checked.
  const { data: passkeys, error: listError } = await admin.auth.admin.passkey.listPasskeys({ userId: userId! })
  expect(listError).toBeNull()
  expect(passkeys).toHaveLength(1)
  const { error: deleteError } = await admin.auth.admin.passkey.deletePasskey({
    userId: userId!,
    passkeyId: passkeys![0].id,
  })
  expect(deleteError).toBeNull()
  await expect(faceId).toBeEnabled({ timeout: 15_000 })
  const label = (await faceId.textContent())!.replace(/^Utiliser /, '') as FaceIdLabel
  const refusal = page.waitForResponse((response) => response.url().includes('passkeys/authentication/verify'))
  await faceId.click()
  const refused = await refusal
  // For the record: what GoTrue really answers for a passkey it no longer knows.
  console.log(`GoTrue refused the removed passkey: ${refused.status()} ${await refused.text()}`)
  expect(refused.status()).toBeGreaterThanOrEqual(400)
  expect(refused.status()).toBeLessThan(500)
  // Next.js keeps an empty route announcer with role="alert": only the one
  // that says something is the page's.
  await expect(page.getByRole('alert').filter({ hasText: /\S/ })).toHaveText(faceIdNoLongerOpens(label), {
    timeout: 15_000,
  })
  await expect(page).toHaveURL(/\/connexion$/)
  expect(await page.evaluate(() => localStorage.getItem('stefin-face-id'))).toBeNull()
  expect(await keysOnDevice(page)).toBe(0)

  // The passkey's answers went to Supabase, extension results included...
  for (const [step, times] of [
    ['passkeys/registration/verify', 1],
    ['passkeys/authentication/verify', 2],
  ] as const) {
    const verify = sent.filter(({ url }) => url.includes(step))
    expect(verify, step).toHaveLength(times)
    for (const { body } of verify) expect(body).toContain('clientExtensionResults')
  }
  // ...and none of them, nor anything else sent anywhere, carried the PRF
  // secret: in no form, and not in the shape of a PRF result either.
  expect(secretsIn(sent, secret)).toEqual([])
  expect(sent.filter(({ body }) => /"prf"\s*:\s*\{[^}]*"results"/.test(body))).toEqual([])
  // Nor the password.
  expect(sent.filter(({ url, body }) => url.includes(password) || body.includes(password))).toEqual([])
})
