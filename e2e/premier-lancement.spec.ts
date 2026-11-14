// The first launch and « Mon argent », end to end, in a phone-sized browser,
// against the real Supabase project: confirmed test users are created with the
// secret key before the tests, and deleted after them, whatever happens.
//
// With E2E_SHOTS=<directory>, each screen is also saved there as a full-page
// screenshot, for a visual check by hand. Without it, no screenshot is taken.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, shot, type TestUser } from './support'

test.use({ viewport: { width: 375, height: 812 } })

const stamp = Date.now()
const users: TestUser[] = [
  { email: `e2e-lancement-${stamp}@example.com`, password: randomBytes(12).toString('base64url'), id: null },
  { email: `e2e-reprise-${stamp}@example.com`, password: randomBytes(12).toString('base64url'), id: null },
  { email: `e2e-bienvenue-${stamp}@example.com`, password: randomBytes(12).toString('base64url'), id: null },
]
let admin: SupabaseClient

test.beforeAll(async () => {
  admin = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  for (const user of users) {
    // What the application sends as a password is the secret derived from it.
    const { authSecret } = await deriveSecrets(user.password, user.email)
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: authSecret,
      email_confirm: true,
    })
    if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
    user.id = data.user.id
  }
})

test.afterAll(async () => {
  // Deleting a user cascades to its vault and documents. Every user is tried,
  // and a failure is reported once all have been.
  const failures: string[] = []
  for (const user of users) {
    if (!user.id) continue
    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) failures.push(error.message)
  }
  if (failures.length > 0) throw new Error(`Cleanup of the test users failed: ${failures.join('; ')}`)
})

const add = (page: Page) => page.getByRole('button', { name: /^(\+ Ajouter un compte|Ajouter)$/ })

// What the journey types in that describes the person's money: none of it may
// leave the browser in clear (amounts are in cents, so « 300000 » also catches
// 300 000 € written as 30000000).
const NEVER_IN_CLEAR = ['boursobank', 'fonds monde', '300000', '180000', '250000']

test('the whole first launch, then Mon argent in euros and in percent', async ({ page }) => {
  test.setTimeout(240_000)

  // Every body sent to Supabase during the journey.
  const supabase = need('NEXT_PUBLIC_SUPABASE_URL')
  const bodies: string[] = []
  page.on('request', (request) => {
    if (!request.url().startsWith(supabase)) return
    const body = request.postData()
    if (body) bodies.push(body)
  })

  await firstSignIn(page, users[0])

  // Welcome.
  await expect(page.getByRole('heading', { name: 'Ton argent, en 100 carrés' })).toBeVisible()
  await shot(page, '1-bienvenue')
  await page.getByRole('link', { name: 'C’est parti' }).click()

  // Where the money is.
  await expect(page.getByRole('heading', { name: 'Où est ton argent ?' })).toBeVisible()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await shot(page, '2-ou')
  await page.getByRole('button', { name: 'Suivant' }).click()

  // Chez toi comes first: a house worth 300 000 €. No loan is offered here.
  await expect(page.getByRole('heading', { name: 'Qu’as-tu hors des banques ?' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Crédit/ })).toHaveCount(0)
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await fill(page, 'Combien vaut-il, à peu près ?', '300000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Logement · 300\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai tout ajouté' }).click()

  // BoursoBank: a Livret A with 10 000 €.
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: 'Livret A', exact: true }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '10000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Livret A · 10\s000\s€$/ })).toBeVisible()

  // A PEA with one fund: 100 parts, bought at 200 € on average, 250 € today.
  await add(page).click()
  await page.getByRole('button', { name: /^PEA plan d’épargne en actions$/ }).click()
  await add(page).click()
  await page.getByRole('button', { name: '+ Une action ou un fonds' }).click()
  await fill(page, 'Son nom', 'Fonds monde')
  await fill(page, 'Combien de parts as-tu ?', '100')
  await fill(page, /À quel prix les as-tu achetées/, '200')
  await fill(page, 'Combien vaut une part aujourd’hui ?', '250')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Fonds monde · 25\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Terminé', exact: true }).click()
  await expect(page.getByRole('button', { name: /^PEA · 1 action et fonds · 25\s000\s€$/ })).toBeVisible()

  // The loan is entered in the bank, and points at the house of « Chez toi ».
  await add(page).click()
  await page.getByRole('button', { name: /^Crédit ce qu’il te reste à rembourser$/ }).click()
  await fill(page, 'Combien reste-t-il à rembourser ?', '180000')
  // The only home is already what the loan finances.
  await expect(page.getByRole('button', { name: 'Logement', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Crédit · 180\s000\s€$/ })).toBeVisible()
  await shot(page, '3-etape')

  // Back from BoursoBank: « Chez toi » opens again with its house, then is finished again.
  await page.getByRole('button', { name: '‹ Retour' }).click()
  await expect(page.getByRole('heading', { name: 'Qu’as-tu hors des banques ?' })).toBeVisible()
  await expect(page.getByRole('button', { name: /^Logement · 300\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai tout ajouté' }).click()
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()

  // The reveal: what is really theirs. « Revenir corriger » reopens BoursoBank, the Livret A goes to 12 000 €.
  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await expect(page.getByText(/Ce qui est vraiment à toi\s:\s155\s000\s€\./)).toBeVisible()
  await page.getByRole('button', { name: 'Revenir corriger' }).click()
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await page.getByRole('button', { name: /^Livret A · 10\s000\s€$/ }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '12000')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page.getByRole('button', { name: /^Livret A · 12\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()

  // The reveal again, with the corrected Livret A.
  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await expect(page.getByText(/Ce qui est vraiment à toi\s:\s157\s000\s€\./)).toBeVisible()
  await expect(page.getByRole('button', { name: 'Revenir corriger' })).toBeVisible()
  await shot(page, '4-revelation')
  await page.getByRole('button', { name: 'Continuer' }).click()

  // Monthly spending first (docs/superpowers/specs/2026-11-11-coussin-objectif-design.md).
  await expect(page.getByRole('heading', { name: /Combien dépenses-tu par mois/ })).toBeVisible()
  await fill(page, 'Tes dépenses par mois', '2500')
  await shot(page, '5-depenses')
  await page.getByRole('button', { name: 'Continuer' }).click()

  // Goals: with a budget, the available money in months, the rest in percent: « Équilibré », saved.
  await expect(page.getByRole('heading', { name: 'Tes objectifs' })).toBeVisible()
  await expect(page.getByText(/hors chez toi \(37\s000\s€ aujourd’hui\)/)).toBeVisible()
  await page.getByRole('button', { name: 'Équilibré', exact: true }).click()
  await expect(page.getByTestId('cushion')).toHaveText(/^Argent disponible\s:\sgarder 4\smois de dépenses, soit 10\s000\s€$/)
  await expect(page.getByText(/^100\s%\srépartis\s: baisse une part pour en monter une autre\.$/)).toBeVisible()
  await shot(page, '6-objectifs')
  await page.getByRole('button', { name: 'Enregistrer' }).click()

  // Mon argent: the net worth and the grid.
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByText(/157\s000\s€/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByRole('img', { name: /^Ta grille/ })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Onglets' })).toBeVisible()
  // The goals compare what is outside the home.
  await expect(page.getByText('Hors chez toi, proche de tes objectifs')).toBeVisible()
  await expect(page.getByText(/pas d’objectif pour chez toi/)).toBeVisible()
  // Nothing in secured savings, which has a goal: listed at 0 €, below it, and not a link.
  const secured = page.getByRole('listitem').filter({ hasText: 'Épargne sécurisée' })
  await expect(secured.getByRole('button', { name: /^0\s€$/ })).toBeVisible()
  await expect(secured.getByText('rien pour l’instant')).toBeVisible()
  await expect(secured.getByRole('link')).toHaveCount(0)
  await shot(page, '7-mon-argent-euros')

  // The detail of the stock-market category, with its gain since purchase.
  await page.getByRole('link', { name: 'Placements en bourse' }).first().click()
  await expect(page.getByRole('heading', { name: 'Placements en bourse' })).toBeVisible()
  const gain = page.getByRole('button', { name: /^a gagné 5\s000\s€ depuis l’achat$/ })
  await expect(gain).toBeVisible()
  await page.getByRole('button', { name: 'Voir les chiffres détaillés' }).click()
  await expect(page.getByRole('button', { name: 'Masquer les chiffres détaillés' })).toBeVisible()
  await shot(page, '9-categorie-details')

  // Touching a figure flips every figure to percent, and the choice is kept.
  const saved = page.waitForResponse(
    (response) => response.url().includes('/rest/') && response.request().method() !== 'GET',
  )
  await gain.click()
  await expect(page.getByText('Chiffres en % partout')).toBeVisible()
  await saved
  await expect(page.getByRole('button', { name: /^a gagné 25,0\s% depuis l’achat$/ })).toBeVisible()

  await page.reload()
  await expect(page.getByRole('button', { name: /^a gagné 25,0\s% depuis l’achat$/ })).toBeVisible({ timeout: 15_000 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByText(/%/).first()).toBeVisible({ timeout: 15_000 })
  await shot(page, '8-mon-argent-pourcent')

  // Nothing typed in about the person's money left the browser in clear.
  expect(bodies.some((body) => body.includes('ciphertext'))).toBe(true)
  for (const word of NEVER_IN_CLEAR) {
    expect(bodies.filter((body) => body.toLowerCase().includes(word))).toEqual([])
  }
})

test('leaving in the middle of a bank, then coming back', async ({ page }) => {
  test.setTimeout(180_000)
  await firstSignIn(page, users[1])

  await page.getByRole('link', { name: 'C’est parti' }).click()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await page.getByRole('button', { name: 'Mon épargne salariale', exact: true }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()

  // Chez toi first: finished, so it reads « fait » later.
  await expect(page.getByRole('heading', { name: 'Qu’as-tu hors des banques ?' })).toBeVisible()
  await page.getByRole('button', { name: /^Mon logement/ }).click()
  await fill(page, 'Combien vaut-il, à peu près ?', '300000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Logement · 300\s000\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'J’ai tout ajouté' }).click()

  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: 'Livret A', exact: true }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '10000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Livret A · 10\s000\s€$/ })).toBeVisible()

  // Leaving from the step itself: « Plus tard ».
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByText('Il te reste 2 étapes avant ta grille')).toBeVisible({ timeout: 30_000 })
  // What was entered, with no grid while banks are missing.
  const stepOf = (name: string) => page.locator('section').filter({ has: page.getByRole('heading', { name, exact: true }) })
  await expect(stepOf('Chez toi').getByText('fait', { exact: true })).toBeVisible()
  await expect(stepOf('BoursoBank').getByText('en cours', { exact: true })).toBeVisible()
  await expect(stepOf('Épargne salariale').getByText('à faire', { exact: true })).toBeVisible()
  await expect(stepOf('BoursoBank').getByText(/^10\s000\s€$/)).toBeVisible()
  await expect(page.locator('[data-square]')).toHaveCount(0)
  await shot(page, '10-reprise')
  await page.getByRole('link', { name: 'Continuer' }).click()

  // The line typed in is still there.
  await expect(page.getByRole('button', { name: /^Livret A · 10\s000\s€$/ })).toBeVisible({ timeout: 15_000 })
})

// The whole welcome in the first screen, down to the import link: an iPhone with Safari's bars shown
// (375 × 553) and the smallest iPhone (320 × 568). The grid gives up room, nothing overlaps; on a
// taller phone (375 × 667) the grid keeps its full width.
test('on short phone screens, the whole welcome fits without scrolling', async ({ page }) => {
  test.setTimeout(180_000)
  await firstSignIn(page, users[2])

  const box = async (locator: import('@playwright/test').Locator) => {
    const found = await locator.boundingBox()
    if (!found) throw new Error('No box')
    return found
  }
  for (const screen of [
    { width: 375, height: 553 },
    { width: 320, height: 568 },
    { width: 375, height: 667 },
  ]) {
    await page.setViewportSize(screen)
    await page.reload()
    const link = page.getByRole('link', { name: 'Importer un fichier ou passer par ton IA' })
    await expect(link).toBeVisible({ timeout: 30_000 })
    const pieces = [
      await box(page.getByRole('img', { name: 'Une grille de cent carrés, en exemple' })),
      await box(page.getByRole('heading', { name: 'Ton argent, en 100 carrés' })),
      await box(page.getByText(/^Chaque carré, c’est 1/)),
      await box(page.getByText(/^Pour commencer, on fait le tour/)),
      await box(page.getByRole('link', { name: 'C’est parti' })),
      await box(page.getByText('Tu peux t’arrêter quand tu veux, rien n’est perdu.')),
      await box(page.locator('[data-import-line]')),
    ]
    for (let i = 1; i < pieces.length; i++) {
      expect(pieces[i - 1].y + pieces[i - 1].height).toBeLessThanOrEqual(pieces[i].y + 0.5)
    }
    const found = await box(link)
    expect(found.y + found.height).toBeLessThanOrEqual(screen.height)
    const grid = pieces[0]
    if (screen.height === 667) expect(grid.width).toBeGreaterThanOrEqual(247.5)
    else expect(grid.width).toBeGreaterThanOrEqual(150)
    const directory = process.env.E2E_SHOTS
    if (directory) {
      // Let the grid's entrance animation settle; only the first screen, the one this test is about.
      await page.waitForTimeout(1500)
      await page.screenshot({ path: `${directory}/bienvenue-${screen.width}x${screen.height}.png` })
    }
  }
})
