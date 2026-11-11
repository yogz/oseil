// The landing, end to end, against the real Supabase project: a confirmed test user is created with
// the secret key before the test, and deleted after it, whatever happens.
//
// The landing is what `/` shows without a session, and Mon argent is what `/` shows with one. Signing
// in from the landing comes back to `/` by a client navigation: the browser must not show the landing
// it kept from before.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { expectApplication, firstSignIn, need, shot, signInThroughPage, type TestUser } from './support'

const user: TestUser = {
  email: `e2e-accueil-${Date.now()}@example.com`,
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

// The person has signed in on this browser before: the landing offers « Me connecter » first.
const signInLink = (page: Page) => page.getByRole('link', { name: 'Me connecter' })

test('from the landing to the signed-in home, without the landing kept from before', async ({ page }) => {
  test.setTimeout(180_000)

  // The vault exists and its key is confirmed, then the person signs out.
  await firstSignIn(page, user)
  await page.getByRole('button', { name: 'Se déconnecter' }).click()
  await expect(page).toHaveURL(/\/connexion$/)

  // The landing, at the address of the site.
  await page.goto('/')
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/)
  await expect(signInLink(page)).toBeVisible()

  // To sign in and back to `/`, by client navigations only: no page.goto, no reload.
  await signInLink(page).click()
  await expect(page).toHaveURL(/\/connexion$/)
  await signInThroughPage(page, user.email, user.password)

  // Home, signed in: a person with nothing yet is sent on to the first launch. Never the landing.
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible({ timeout: 30_000 })
  await expect(page).toHaveURL(/\/premier-lancement$/)
  await expect(signInLink(page)).toHaveCount(0)

  // Signed in, the address of the site is the application, never the landing.
  await page.goto('/')
  await expectApplication(page)
  await expect(page.getByRole('button', { name: 'Se déconnecter' })).toBeVisible()
  await expect(signInLink(page)).toHaveCount(0)
  await expect(page.getByRole('link', { name: 'Voir un exemple' })).toHaveCount(0)
})

test('signed out, a private screen leads to the sign-in', async ({ page }) => {
  await page.goto('/reglages')
  await expect(page).toHaveURL(/\/connexion$/)
  await expect(page.getByRole('heading', { name: 'Te connecter' })).toBeVisible()
})

// The example, from the landing and back: its three pages, the banner on each, what would save
// something, and the way out. It is made of invented figures shipped with the page: not one request
// goes to Supabase or to the site's own API while it is open.
test('the example, from the landing to the way out, without asking the server anything', async ({ page }) => {
  const supabase = new URL(need('NEXT_PUBLIC_SUPABASE_URL')).host
  const sent: string[] = []
  await page.setViewportSize(PHONE)
  await page.goto('/')
  page.on('request', (request) => sent.push(request.url()))

  await page.getByRole('link', { name: 'Voir un exemple' }).click()
  await expect(page).toHaveURL(/\/exemple$/)
  const banner = page.locator('[data-example-banner]')
  await expect(banner).toContainText('Exemple, chiffres inventés')
  await expect(banner.getByRole('link', { name: 'Créer mon compte' })).toBeVisible()

  // « Mettre à jour » and the gear: the example keeps nothing, and says so.
  const sheet = page.getByRole('dialog', { name: 'L’exemple ne garde rien' })
  await page.getByRole('button', { name: 'Mettre à jour' }).click()
  await expect(sheet).toBeVisible()
  await sheet.getByRole('button', { name: 'Continuer l’exemple' }).click()
  await expect(sheet).toHaveCount(0)
  await page.getByRole('button', { name: 'Réglages' }).click()
  await expect(sheet).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(sheet).toHaveCount(0)
  await shot(page, 'exemple-mon-argent')

  // A square opens its category's detail.
  await page.getByRole('img', { name: /^Sa grille/ }).locator('[data-square][data-category="markets"]').first().click()
  await expect(page).toHaveURL(/\/exemple\/categorie\/markets$/)
  await expect(page.getByRole('heading', { name: 'Placements en bourse' })).toBeVisible()
  // Its zones carry their gain since purchase; a zone opens on its lines.
  await expect(page.getByText(/depuis l’achat/).first()).toBeVisible()
  await page.getByRole('button', { name: /^Fonds monde/ }).click()
  await expect(page.getByText('Fonds monde (exemple)')).toBeVisible()
  await expect(banner).toContainText('Exemple, chiffres inventés')
  await shot(page, 'exemple-categorie')

  // Back to Mon argent, then its evolution.
  await page.getByRole('link', { name: '‹ Mon argent' }).first().click()
  await expect(page).toHaveURL(/\/exemple$/)
  await page.getByRole('link', { name: 'Son évolution sur un an' }).click()
  await expect(page).toHaveURL(/\/exemple\/evolution$/)
  await expect(page.getByRole('heading', { name: 'Évolution' })).toBeVisible()
  await expect(banner).toContainText('Exemple, chiffres inventés')
  await shot(page, 'exemple-evolution')

  // « Quitter »: back to the landing, at the address of the site.
  await banner.getByRole('link', { name: 'Quitter' }).click()
  await expect(page).toHaveURL(/^https?:\/\/[^/]+\/$/)
  await expect(page.getByRole('link', { name: 'Voir un exemple' })).toBeVisible()

  // The record is not empty (the pages did load), and none of it went to the server's data.
  expect(sent.some((url) => new URL(url).pathname.startsWith('/exemple'))).toBe(true)
  const toServer = sent.filter((url) => {
    const { host, pathname } = new URL(url)
    return host === supabase || pathname.startsWith('/api/')
  })
  expect(toServer).toEqual([])
})

// Face ID is a quiet link under the password form. Off the site's address (here, localhost) the page
// hides it, since the site's passkeys cannot work there: the browser is given a virtual
// authenticator, and Supabase's answer is replaced by one naming this address, so that it shows.
// Nothing is signed in: the test only reads where the link is.
test('on the sign-in screen, « Utiliser Face ID » comes after the form', async ({ page, browserName }) => {
  test.skip(browserName !== 'chromium', 'The virtual authenticator is Chromium’s')
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('WebAuthn.enable', { enableUI: false })
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  })
  const cors = {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
  }
  await page.route('**/auth/v1/passkeys/authentication/options*', (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({ status: 204, headers: cors })
      : route.fulfill({
          headers: cors,
          json: { challenge_id: 'e2e', options: { challenge: 'AAAAAAAAAAAAAAAAAAAAAA', rpId: 'localhost' } },
        }),
  )

  await page.setViewportSize(PHONE)
  await page.goto('/connexion')
  const faceId = page.getByRole('button', { name: /^Utiliser / })
  await expect(faceId).toBeVisible()
  await expect(faceId).toBeEnabled()

  // In the order of the page: the form, « Mot de passe oublié ? », Face ID, « Créer mon compte ».
  const order = await page.evaluate(() => {
    const form = document.querySelector('form')
    const pick = (text: string) =>
      [...document.querySelectorAll('a, button')].find((element) => element.textContent?.startsWith(text))
    return ['Mot de passe oublié', 'Utiliser ', 'Créer mon compte'].map((text) => {
      const element = pick(text)
      if (!form || !element) return 'missing'
      return form.compareDocumentPosition(element) & Node.DOCUMENT_POSITION_FOLLOWING ? 'after' : 'before'
    })
  })
  expect(order).toEqual(['after', 'after', 'after'])
  const forgot = await page.getByRole('link', { name: /^Mot de passe oublié/ }).boundingBox()
  const link = await faceId.boundingBox()
  const create = await page.getByRole('link', { name: 'Créer mon compte' }).boundingBox()
  const submit = await page.getByRole('button', { name: 'Me connecter' }).boundingBox()
  if (!forgot || !link || !create || !submit) throw new Error('No box')
  expect(link.y).toBeGreaterThan(submit.y + submit.height)
  expect(link.y).toBeGreaterThan(forgot.y)
  expect(link.y).toBeLessThan(create.y)
  await shot(page, 'connexion-face-id')
})

const PHONE = { width: 375, height: 667 }

// The whole first screen of a small iPhone, in both versions: the last choice is above the fold.
test('on a phone, the first screen holds the mark, the grid, the title, the sentence and the choices', async ({
  page,
}) => {
  await page.setViewportSize(PHONE)
  for (const [served, last] of [
    [false, 'J’ai déjà un compte'],
    [true, 'Créer un compte'],
  ] as const) {
    await page.goto('/')
    await page.evaluate((on) => (on ? localStorage.setItem('oseil-compte-ici', '1') : localStorage.clear()), served)
    await page.reload()
    const link = page.getByRole('link', { name: last })
    await expect(link).toBeVisible()
    const box = await link.boundingBox()
    expect(box && box.y + box.height).toBeLessThanOrEqual(PHONE.height)
    const grid = await page.getByRole('link', { name: 'Ouvrir l’exemple' }).boundingBox()
    // The room this phone gives: no need to shrink much (335 px is the whole column).
    expect(grid?.width).toBeGreaterThanOrEqual(280)
    await shot(page, served ? 'accueil-telephone-retour' : 'accueil-telephone')
  }
})

// Shorter screens: an iPhone with Safari's bars shown (375 × 553) and the smallest iPhone (320 × 568).
// The grid gives up room; the choices, the promises and the foot never overlap.
for (const screen of [
  { width: 375, height: 553 },
  { width: 320, height: 568 },
]) {
  test(`on a ${screen.width} × ${screen.height} screen, nothing overlaps and the choices are in the first screen`, async ({
    page,
  }) => {
    await page.setViewportSize(screen)
    await page.goto('/')
    await expect(page.getByRole('link', { name: 'Créer mon compte' }).first()).toBeVisible()
    const box = async (locator: import('@playwright/test').Locator) => {
      const found = await locator.boundingBox()
      if (!found) throw new Error('No box')
      return found
    }
    const grid = await box(page.getByRole('link', { name: 'Ouvrir l’exemple' }))
    const title = await box(page.getByRole('heading', { level: 1 }))
    const actions = await box(page.locator('[data-landing-actions]'))
    const promises = await box(page.getByRole('list').filter({ hasText: 'Tes chiffres restent à toi' }))
    const foot = await box(page.locator('footer p').getByText('Oseil', { exact: true }))
    expect(grid.y + grid.height).toBeLessThanOrEqual(title.y)
    expect(actions.y + actions.height).toBeLessThanOrEqual(promises.y)
    expect(promises.y + promises.height).toBeLessThanOrEqual(foot.y)
    // All three choices without scrolling, the grid still readable.
    for (const name of ['Créer mon compte', 'Voir un exemple', 'J’ai déjà un compte']) {
      const link = await box(page.locator('[data-landing-actions]').getByRole('link', { name }))
      expect(link.y + link.height).toBeLessThanOrEqual(screen.height)
    }
    expect(grid.width).toBeGreaterThanOrEqual(150)
    await shot(page, `accueil-${screen.width}x${screen.height}`)
  })
}

// What the server sends is already the final layout: the page is the same before its script runs.
test('nothing on the landing moves once its script has run', async ({ browser, page }) => {
  const still = await browser.newContext({ javaScriptEnabled: false, viewport: PHONE })
  const before = await still.newPage()
  await before.goto('/')
  const where = async (p: Page) => ({
    title: await p.getByRole('heading', { level: 1 }).boundingBox(),
    grid: await p.getByRole('link', { name: 'Ouvrir l’exemple' }).boundingBox(),
    rows: await p.getByText('Tes chiffres restent à toi').boundingBox(),
    actions: await p.locator('[data-landing-actions]').boundingBox(),
    foot: await p.locator('footer p').getByText('Oseil', { exact: true }).boundingBox(),
  })
  const unscripted = await where(before)
  await still.close()

  await page.setViewportSize(PHONE)
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Créer mon compte' }).first()).toBeVisible()
  expect(await where(page)).toEqual(unscripted)
  // The pills only exist once the marker is read: they land inside the room kept for them.
  const room = unscripted.actions
  if (!room) throw new Error('No room kept for the choices')
  for (const name of ['Créer mon compte', 'Voir un exemple', 'J’ai déjà un compte']) {
    const pill = await page.locator('[data-landing-actions]').getByRole('link', { name }).boundingBox()
    if (!pill) throw new Error(`No ${name}`)
    expect(pill.y).toBeGreaterThanOrEqual(room.y)
    expect(pill.y + pill.height).toBeLessThanOrEqual(room.y + room.height + 0.5)
  }
})

test('on a computer, the grid on the left and the other way in at the top right', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')
  const box = async (locator: import('@playwright/test').Locator) => {
    await expect(locator).toBeVisible()
    const found = await locator.boundingBox()
    if (!found) throw new Error('No box')
    return found
  }
  const top = await box(page.getByRole('link', { name: 'J’ai déjà un compte' }))
  const grid = await box(page.getByRole('link', { name: 'Ouvrir l’exemple' }))
  const title = await box(page.getByRole('heading', { level: 1 }))
  expect(top.y).toBeLessThan(grid.y)
  expect(top.x).toBeGreaterThan(grid.x + grid.width)
  expect(title.x).toBeGreaterThan(grid.x + grid.width)
  await expect(page.locator('[data-landing-actions]').getByRole('link', { name: 'Créer mon compte' })).toBeVisible()
  await shot(page, 'accueil-ordinateur')
})
