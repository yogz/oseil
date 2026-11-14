// « Trouver » end to end, in a phone-sized browser, against the real Supabase project: a confirmed test user
// is created before the test and deleted after it. A PEA with one units line; from Mon argent the magnifier
// opens « Trouver », typing a part of the name answers and lists the row without any request, the row opens
// the line's sheet, and a settings row leads to its anchor. A second test saves phone-width captures
// (not assertions) to .superpowers/shots for a visual check.
import { randomBytes } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, type TestUser } from './support'

test.use({ viewport: { width: 375, height: 812 } })

const user: TestUser = {
  email: `e2e-trouver-${Date.now()}@example.com`,
  password: randomBytes(12).toString('base64url'),
  id: null,
}
let admin: SupabaseClient

test.beforeAll(async () => {
  admin = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
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
  if (!user.id) return
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw new Error(`Cleanup of the test user failed: ${error.message}`)
})

const add = (page: Page) => page.getByRole('button', { name: /^(\+ Ajouter un compte|Ajouter)$/ })

async function firstLaunch(page: Page) {
  await firstSignIn(page, user)
  await page.getByRole('link', { name: 'C’est parti' }).click()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: /^PEA plan d’épargne en actions$/ }).click()
  await add(page).click()
  await page.getByRole('button', { name: '+ Une action ou un fonds' }).click()
  await fill(page, 'Son nom', 'Fonds monde')
  await fill(page, 'Combien de parts as-tu ?', '100')
  await fill(page, 'Combien vaut une part aujourd’hui ?', '250')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Fonds monde · 25\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Terminé', exact: true }).click()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()
  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByRole('heading', { name: 'Tes objectifs' })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
}

test('Trouver answers from the open vault, sends nothing, and leads to a line and a setting', async ({ page }) => {
  test.setTimeout(240_000)
  await firstLaunch(page)

  await page.getByRole('link', { name: 'Trouver', exact: true }).click()
  await expect(page).toHaveURL(/\/trouver$/)
  const box = page.getByRole('searchbox', { name: 'Trouver' })
  await expect(box).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('Une action, un compte, un mois, un réglage.')).toBeVisible({ timeout: 30_000 })

  // From the first keystroke on: no call to the site's API nor to Supabase. Other origins are blocked by the
  // CSP, and the site's own page prefetches (RSC) carry no data. The vault is read when the page opens, and
  // the prices asked once: let that settle, then listen.
  await page.waitForLoadState('networkidle')
  const supabaseHost = new URL(need('NEXT_PUBLIC_SUPABASE_URL')).host
  const sent: string[] = []
  page.on('request', (request) => {
    const url = new URL(request.url())
    if (url.pathname.startsWith('/api/') || url.host === supabaseHost) sent.push(`${request.method()} ${url.host}${url.pathname}`)
  })
  await box.pressSequentially('fonds mon', { delay: 60 })
  await expect(page.getByRole('region', { name: 'Fonds monde' })).toBeVisible()
  const row = page.getByRole('link', { name: /Fonds monde/ }).first()
  await expect(row).toBeVisible()
  await page.waitForTimeout(1000)
  expect(sent).toEqual([])
  expect(page.url()).not.toContain('fonds')

  // The row opens the line's sheet.
  await row.click()
  await expect(page).toHaveURL(/\/ligne\//, { timeout: 30_000 })
  await expect(page.getByRole('heading', { name: 'Fonds monde', exact: true })).toBeVisible({ timeout: 30_000 })

  // A settings row leads to its anchor, scrolled into view.
  await page.goto('/trouver')
  await page.getByRole('searchbox', { name: 'Trouver' }).pressSequentially('mot de passe', { delay: 40 })
  await page.getByRole('link', { name: /Ton mot de passe/ }).first().click()
  await expect(page).toHaveURL(/\/reglages#compte$/, { timeout: 30_000 })
  const section = page.locator('#compte')
  await expect(section).toBeVisible({ timeout: 30_000 })
  await expect(section).toBeInViewport({ timeout: 10_000 })
})

// Not assertions: full-page captures at three phone widths, for a visual check by eye. Only on demand:
// E2E_SHOTS=<directory> (the convention of support.ts).
test('captures at phone widths, for a visual check', async ({ page }) => {
  const directory = process.env.E2E_SHOTS
  test.skip(!directory, 'Captures only on demand: E2E_SHOTS=<directory>')
  test.setTimeout(400_000)
  mkdirSync(directory!, { recursive: true })
  await firstLaunch(page)
  const take = async (screen: string, width: number) => {
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${directory}/${screen}-${width}.png`, fullPage: true })
  }
  const sizes = [
    { width: 360, height: 780 },
    { width: 375, height: 812 },
    { width: 390, height: 844 },
  ]
  for (const size of sizes) {
    await page.setViewportSize(size)
    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible({ timeout: 30_000 })
    await take('mon-argent', size.width)

    await page.goto('/reperes')
    await expect(page.getByRole('heading', { name: 'Repères', level: 1 })).toBeVisible({ timeout: 30_000 })
    await take('reperes', size.width)

    await page.goto('/')
    await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible({ timeout: 30_000 })
    const category = page.getByText('Placements en bourse').first()
    await expect(category).toBeVisible({ timeout: 30_000 })
    await category.click()
    await expect(page).toHaveURL(/\/categorie\//, { timeout: 30_000 })
    await take('categorie', size.width)
    const line = page.locator('a[href^="/ligne/"]').first()
    await expect(line).toBeVisible({ timeout: 30_000 })
    await line.click()
    await expect(page).toHaveURL(/\/ligne\//, { timeout: 30_000 })
    await expect(page.getByRole('heading', { name: 'Fonds monde', exact: true })).toBeVisible({ timeout: 30_000 })
    await take('ligne', size.width)

    await page.goto('/trouver')
    await page.getByRole('searchbox', { name: 'Trouver' }).pressSequentially('fonds', { delay: 30 })
    await expect(page.getByRole('link', { name: /Fonds monde/ }).first()).toBeVisible({ timeout: 30_000 })
    await take('trouver', size.width)
  }
})
