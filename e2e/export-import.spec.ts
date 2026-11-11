// The import of a whole file into a new account, then the export from the Réglages, end to end, in a
// phone-sized browser (375 × 667, the smallest screen the welcome must fit), against the real Supabase
// project: a confirmed test user is created with the secret key before the test, and deleted after it,
// whatever happens.
//
// The imported file is e2e/fixtures/mes-chiffres.xlsx, written by scripts/e2e-fixture.ts from the unit
// tests' fixture (`exportSheets(fixtureInput())`). What the screens must show is computed from that file
// with the import's own functions, never typed in here.
//
// The prices of the day are refused (answered with an error, never sent to Yahoo), so Mon argent shows the
// file's last relevé as it was saved.
//
// With E2E_SHOTS=<directory>, the main screens are also saved there as full-page screenshots.
import { randomBytes } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Download } from '@playwright/test'
import { todayIso } from '../lib/dates'
import { formatEuros } from '../lib/format'
import { exportFileName, TEMPLATE_FILE_NAME } from '../lib/transfer/export'
import { SHEETS } from '../lib/transfer/format'
import { readImport } from '../lib/transfer/import'
import { readWorkbook } from '../lib/transfer/xlsx'
import { deriveSecrets } from '../lib/vault/kdf'
import { firstSignIn, need, shot, type TestUser } from './support'

const PHONE = { width: 375, height: 667 }
test.use({ viewport: PHONE })

const FIXTURE = 'e2e/fixtures/mes-chiffres.xlsx'

const user: TestUser = {
  email: `e2e-import-${Date.now()}@example.com`,
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

const book = async (path: string) => readWorkbook(new Blob([await readFile(path)]))

async function saved(download: Download) {
  const path = await download.path()
  if (!path) throw new Error(`The download ${download.suggestedFilename()} was not saved`)
  return book(path)
}

// Names in the fixture that describe the person's money: none may leave the browser in clear.
const NEVER_IN_CLEAR = ['fortuneo', 'banque du coin', 'fonds monde', 'compte joint', 'prêt immobilier']

test('a file imported into a new account, then downloaded again from the Réglages', async ({ page }) => {
  test.setTimeout(240_000)

  // What the file holds, read as the import reads it.
  const fixture = await book(FIXTURE)
  const read = readImport(fixture)
  if (!read.ok) throw new Error(`The fixture does not import: ${JSON.stringify(read.errors)}`)
  const relevés = read.summary.relevés
  const last = relevés[relevés.length - 1].total
  if (last === null) throw new Error('The fixture’s latest relevé has no placement')
  const lastTotal = formatEuros(last)

  const supabase = need('NEXT_PUBLIC_SUPABASE_URL')
  const bodies: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(supabase)) return
    const body = request.postData()
    if (body) bodies.push(body)
  })
  await page.route(/\/api\/(quotes|rates)(\/search)?$/, (route) => route.fulfill({ status: 503, json: { ok: false } }))

  await firstSignIn(page, user)

  // The welcome, with its import link, fits the first screen of a small phone.
  await expect(page.getByRole('heading', { name: 'Ton argent, en 100 carrés' })).toBeVisible()
  const importLink = page.getByRole('link', { name: 'Importer un fichier ou passer par ton IA' })
  await expect(importLink).toBeVisible({ timeout: 15_000 })
  const reassurance = page.getByText('Tu peux t’arrêter quand tu veux, rien n’est perdu.')
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  const bottoms = {
    reassurance: (await reassurance.boundingBox())!.y + (await reassurance.boundingBox())!.height,
    link: (await importLink.boundingBox())!.y + (await importLink.boundingBox())!.height,
  }
  test.info().annotations.push({ type: 'welcome bottoms (px, viewport 667)', description: JSON.stringify(bottoms) })
  expect(bottoms.reassurance).toBeLessThanOrEqual(PHONE.height)
  expect(bottoms.link).toBeLessThanOrEqual(PHONE.height)
  await shot(page, 'import-1-bienvenue')
  await importLink.click()

  // The import screen: the template downloads under its name, and opens as a workbook.
  await expect(page.getByRole('heading', { name: 'Tes chiffres depuis un fichier' })).toBeVisible()
  await shot(page, 'import-1b-trois-facons')
  const templateDownload = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Télécharger le modèle' }).click()
  const template = await templateDownload
  expect(template.suggestedFilename()).toBe(TEMPLATE_FILE_NAME)
  expect([...(await saved(template)).keys()]).toContain(SHEETS.snapshots)

  // The file, chosen through the pill.
  const chooser = page.waitForEvent('filechooser')
  await page.getByRole('button', { name: 'Choisir le fichier' }).click()
  await (await chooser).setFiles(FIXTURE)

  // The preview: the file's relevés, newest first, with their totals.
  await expect(page.getByRole('button', { name: 'Importer ces chiffres' })).toBeVisible({ timeout: 30_000 })
  const list = page.getByRole('list', { name: 'Les relevés' })
  await expect(list.getByRole('listitem')).toHaveCount(relevés.length)
  await expect(list.getByRole('listitem').first()).toContainText(lastTotal)
  await expect(page.getByText(/^3 relevés · 6 banques · 11 placements · 2 objectifs$/)).toBeVisible()
  await shot(page, 'import-2-apercu')
  await page.getByRole('button', { name: 'Importer ces chiffres' }).click()

  // Mon argent shows the file's last total.
  await expect(page).toHaveURL(/\/$/, { timeout: 60_000 })
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByText(lastTotal).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('img', { name: /^Ta grille/ })).toBeVisible()
  await shot(page, 'import-3-mon-argent')

  // The Réglages: « Télécharger mes chiffres » gives today's file, which holds the fixture's relevés.
  await page.getByRole('link', { name: 'Réglages' }).click()
  const section = page.getByRole('region', { name: 'Mes chiffres en fichier', exact: true })
  await expect(section).toBeVisible({ timeout: 15_000 })
  const before = todayIso()
  const exportDownload = page.waitForEvent('download')
  await section.getByRole('button', { name: 'Télécharger mes chiffres' }).click()
  const exported = await exportDownload
  expect([exportFileName(before), exportFileName(todayIso())]).toContain(exported.suggestedFilename())
  await expect(section.getByRole('status')).toBeVisible()
  const back = await saved(exported)
  expect(back.get(SHEETS.snapshots)).toEqual(fixture.get(SHEETS.snapshots))
  await shot(page, 'import-4-reglages')

  // Nothing of the file left the browser in clear.
  expect(bodies.some((body) => body.includes('ciphertext'))).toBe(true)
  for (const word of NEVER_IN_CLEAR) {
    expect(bodies.filter((body) => body.toLowerCase().includes(word))).toEqual([])
  }
})
