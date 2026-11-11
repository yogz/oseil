// Automatic prices and currencies, end to end, in a phone-sized browser, against the real
// Supabase project: confirmed test users are created with the secret key before the tests,
// and deleted after them, whatever happens.
//
// The market is played, never reached: every call the browser makes to the site's own
// /api/quotes*, /api/rates routes is answered here with `page.route`, so the server (and
// through it Yahoo and the ECB) is never called. Nothing on the server side can switch the
// market off or on, so nothing of the kind can be left on in production. A route that was not
// answered here would reach the server: `unanswered` stays empty to prove none did.
//
// With E2E_SHOTS=<directory>, the main screens are also saved there as full-page
// screenshots. Without it, no screenshot is taken.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { todayIso } from '../lib/dates'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, shot, type TestUser } from './support'

test.use({ viewport: { width: 375, height: 812 }, actionTimeout: 20_000 })

const stamp = Date.now()
const users: TestUser[] = [
  { email: `e2e-cours-${stamp}@example.com`, password: randomBytes(12).toString('base64url'), id: null },
  { email: `e2e-taux-${stamp}@example.com`, password: randomBytes(12).toString('base64url'), id: null },
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

// The ECB's rates of 6 November 2026 (the fixture of lib/market/__tests__/ecb-2026-11-06.xml).
const RATES = { on: '2026-11-06', perEuro: { USD: 1.1165, GBP: 0.83415, CHF: 0.9143 } }

type Market = {
  // Price of each symbol, in euros.
  prices: Record<string, number>
  // The day every price is dated (the browser's today, unless its clock was moved).
  day: string
  quotesDown: boolean
  ratesDown: boolean
}

const MATCHES: Record<string, { symbol: string; name: string; exchange: string; kind: string }> = {
  LU1681043599: { symbol: 'CW8.PA', name: 'Amundi MSCI World', exchange: 'Paris', kind: 'ETF' },
  FR0000120073: { symbol: 'AI.PA', name: 'Air Liquide', exchange: 'Paris', kind: 'action' },
}

// What the browser sent, as the site's routes and Supabase saw it.
type Traffic = {
  quotes: string[]
  searches: string[]
  rates: Array<{ method: string; url: string; body: string | null }>
  supabase: string[]
  // Calls to the site's market routes that no simulated answer covered.
  unanswered: string[]
}

async function playMarket(page: Page, market: Market): Promise<Traffic> {
  const traffic: Traffic = { quotes: [], searches: [], rates: [], supabase: [], unanswered: [] }
  const supabase = need('NEXT_PUBLIC_SUPABASE_URL')

  page.on('request', (request) => {
    const url = new URL(request.url())
    const body = request.postData()
    if (request.url().startsWith(supabase)) {
      if (body) traffic.supabase.push(body)
    } else if (url.pathname === '/api/quotes') {
      traffic.quotes.push(body ?? '')
    } else if (url.pathname === '/api/quotes/search') {
      traffic.searches.push(body ?? '')
    } else if (url.pathname === '/api/rates') {
      traffic.rates.push({ method: request.method(), url: request.url(), body })
    }
  })

  const answered = new Set<string>()
  await page.route(/\/api\/(quotes|rates)(\/search)?$/, async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    answered.add(request.url())
    if (path === '/api/quotes/search') {
      const query = (request.postDataJSON() as { query: string }).query.trim().toUpperCase()
      const match = MATCHES[query]
      await route.fulfill({ json: { results: match ? [match] : [] } })
    } else if (path === '/api/quotes') {
      if (market.quotesDown) return route.fulfill({ status: 500, json: { ok: false } })
      const { symbols } = request.postDataJSON() as { symbols: string[] }
      const quotes = Object.fromEntries(
        symbols.map((symbol) => [
          symbol,
          symbol in market.prices ? { price: market.prices[symbol], currency: 'EUR', asOf: market.day } : null,
        ]),
      )
      await route.fulfill({ json: { quotes } })
    } else {
      if (market.ratesDown) return route.fulfill({ status: 502, json: { ok: false } })
      await route.fulfill({ json: { rates: RATES } })
    }
  })
  // Anything that reached the network without passing the route above.
  page.on('requestfinished', (request) => {
    const path = new URL(request.url()).pathname
    if (/^\/api\/(quotes|rates)/.test(path) && !answered.has(request.url())) traffic.unanswered.push(request.url())
  })
  return traffic
}

// The traffic of the journey holds only what the rulings allow, and none of the person's money.
function expectOnlyAllowed(traffic: Traffic, never: string[]) {
  expect(traffic.unanswered).toEqual([])
  // Prices: the symbols, sorted, and nothing else in the body.
  for (const body of traffic.quotes) {
    const parsed = JSON.parse(body) as { symbols: string[] }
    expect(Object.keys(parsed)).toEqual(['symbols'])
    expect(parsed.symbols).toEqual([...parsed.symbols].sort())
  }
  // Search: the text typed, and nothing else.
  for (const body of traffic.searches) expect(Object.keys(JSON.parse(body) as object)).toEqual(['query'])
  // Rates: a plain GET, no body, no query string.
  for (const call of traffic.rates) {
    expect(call.method).toBe('GET')
    expect(call.body).toBeNull()
    expect(new URL(call.url).search).toBe('')
  }
  // Supabase: ciphertext only. Amounts are in cents; a dot cannot appear in base64.
  expect(traffic.supabase.some((body) => body.includes('ciphertext'))).toBe(true)
  for (const word of never) {
    expect(traffic.supabase.filter((body) => body.toLowerCase().includes(word.toLowerCase()))).toEqual([])
  }
}

test('prices of the day: attaching, Mon argent, the update, a line in dollars', async ({ page }) => {
  test.setTimeout(480_000)
  // The first launch happens three days ago, on the browser's clock (the session stays valid:
  // the clock only runs behind). Prices are dated the same day until the clock comes back.
  const past = new Date()
  past.setDate(past.getDate() - 3)
  past.setHours(12, 0, 0, 0)
  await page.clock.setFixedTime(past)
  const market: Market = { prices: { 'CW8.PA': 692.3, 'AI.PA': 171.08 }, day: todayIso(past), quotesDown: false, ratesDown: false }
  const traffic = await playMarket(page, market)

  await firstSignIn(page, users[0])
  await page.getByRole('link', { name: 'C’est parti' }).click()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: 'Revolut', exact: true }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()

  // 1. BoursoBank: a PEA with a fund found by its ISIN code, its price in the box.
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: /^PEA plan d’épargne en actions$/ }).click()
  await add(page).click()
  await page.getByRole('button', { name: '+ Une action ou un fonds' }).click()
  await page.getByRole('button', { name: 'Suivre son prix automatiquement' }).click()
  await fill(page, 'Son nom ou son code ISIN', 'LU1681043599')
  await page.getByRole('button', { name: 'Chercher' }).click()
  await expect(page.getByRole('list', { name: 'Résultats de la recherche' })).toBeVisible()
  await shot(page, 'cours-1-recherche')
  await page.getByRole('button', { name: /Amundi MSCI World/ }).click()
  await expect(page.getByLabel('Combien vaut une part aujourd’hui ?')).toHaveValue('692,30')
  await expect(page.getByLabel('Son nom', { exact: true })).toHaveValue('Amundi MSCI World')
  await fill(page, 'Combien de parts as-tu ?', '10')
  await fill(page, /À quel prix les as-tu achetées/, '600')
  await add(page).click()
  await expect(page.getByRole('button', { name: /^Amundi MSCI World · 6\s923\s€$/ })).toBeVisible()
  await page.getByRole('button', { name: 'Terminé', exact: true }).click()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()

  // 2. Revolut: a current account in dollars.
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*Revolut/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: /^Compte courant/ }).click()
  await page.getByRole('button', { name: 'Changer de devise' }).click()
  await shot(page, 'cours-2-devise')
  await page.getByRole('button', { name: 'dollars américains', exact: true }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '1000')
  await add(page).click()
  await page.getByRole('button', { name: 'J’ai fini avec Revolut' }).click()

  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByRole('heading', { name: 'Tes objectifs' })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByRole('heading', { name: /Combien dépenses-tu par mois/ })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()

  // 3. Mon argent: 6 923 € of fund and 1 000 $ at 1,1165 (896 €).
  await expect(page).toHaveURL(/\/$/)
  await expect(page.getByRole('heading', { name: 'Mon argent' })).toBeVisible()
  await expect(page.getByText(/7\s819\s€/).first()).toBeVisible({ timeout: 15_000 })

  // Today's price moves Mon argent; the snapshot is of the same day, so there is one date only.
  market.prices['CW8.PA'] = 700
  await page.reload()
  await expect(page.getByText(/7\s896\s€/).first()).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText(/^Chiffres du /)).toBeVisible()
  await expect(page.getByText(/Cours du jour pour tes actions/)).toHaveCount(0)

  // The days go by: the browser's clock comes back to today, three days after the snapshot.
  // The snapshot is now older than the price, and Mon argent says both dates.
  await page.clock.setFixedTime(new Date())
  market.day = todayIso()
  await page.reload()
  await expect(page.getByText(/7\s896\s€/).first()).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/^Cours du jour pour tes actions · le reste au \d{1,2} \p{L}+/u)).toBeVisible()
  await shot(page, 'cours-3-mon-argent-prix-du-jour')

  // Yahoo down: the snapshot's figures, and the price said missing.
  market.quotesDown = true
  await page.reload()
  await expect(page.getByText(/7\s819\s€/).first()).toBeVisible({ timeout: 30_000 })
  await expect(
    page.getByText(/Le prix du jour de « Amundi MSCI World » n’a pas pu être récupéré\s:\sil reste au prix du \d{1,2} \p{L}+\./u),
  ).toBeVisible()
  await shot(page, 'cours-4-mon-argent-sans-prix')
  market.quotesDown = false

  // 4. The update: the box opens at today's price, with the last one recalled.
  await page.reload()
  await expect(page.getByText(/7\s896\s€/).first()).toBeVisible({ timeout: 30_000 })
  await page.getByRole('link', { name: 'Mettre à jour' }).click()
  await page.getByRole('button', { name: 'Commencer par BoursoBank' }).click()
  const line = (name: string) => page.getByRole('region', { name, exact: true })
  await expect(line('Amundi MSCI World').getByLabel('Combien vaut une part aujourd’hui')).toHaveValue('700,00')
  await expect(line('Amundi MSCI World').getByText(/avant\s:\s692,30\s€/)).toBeVisible()
  await shot(page, 'cours-5-maj-prix-du-jour')

  // 6. The end of the update: Air Liquide is added to the PEA by hand, at 170 €.
  await page.getByRole('button', { name: '+ Une action ou un fonds' }).click()
  await page.getByRole('button', { name: 'Je l’avais déjà' }).click()
  await fill(page, 'Son nom', 'Air Liquide')
  await fill(page, 'Combien de parts as-tu ?', '5')
  await fill(page, /À quel prix les as-tu achetées/, '170')
  await fill(page, 'Combien vaut une part aujourd’hui ?', '170')
  await add(page).click()
  await page.getByRole('button', { name: 'Suivant : Revolut' }).click()
  await expect(page.getByText(/en dollars américains/).first()).toBeVisible()
  // The last bank: its one main exit says « Rien n’a changé ici » until something is touched there.
  await page.getByRole('button', { name: /^(Voir le résultat|Rien n’a changé ici)$/ }).click()

  // The result: today's price, the dollars converted at the ECB's rate.
  await expect(page).toHaveURL(/\/mise-a-jour\/resultat$/)
  await expect(page.getByText(/^8\s746\s€$/)).toBeVisible()
  await expect(page.getByText('Converti en euros au taux de la Banque centrale européenne du 6 novembre.')).toBeVisible()
  await shot(page, 'cours-6-maj-resultat')
  await page.getByRole('button', { name: 'Enregistrer' }).click()
  await expect(page).toHaveURL(/\/$/, { timeout: 30_000 })
  await expect(page.getByText(/8\s746\s€/).first()).toBeVisible({ timeout: 15_000 })

  // 7. « Tes titres »: Air Liquide, typed by hand, is attached to its price.
  await page.getByRole('link', { name: 'Placements en bourse' }).first().click()
  await page.getByRole('link', { name: 'Le prix de tes titres' }).click()
  await expect(page.getByRole('heading', { name: 'Tes titres' })).toBeVisible()
  await page.getByRole('button', { name: 'Le retrouver : Air Liquide' }).click()
  await fill(page, 'Son nom ou son code ISIN', 'FR0000120073')
  await page.getByRole('button', { name: 'Chercher' }).click()
  await page.getByRole('button', { name: /Air Liquide/ }).click()
  await expect(page.getByText(/Son prix aujourd’hui\s:\s171,08\s€\. À ton dernier relevé\s:\s170,00\s€\./)).toBeVisible()
  await shot(page, 'cours-7-tes-titres')
  await page.getByRole('button', { name: 'C’est bien lui' }).click()
  await expect(page.getByText(/prix automatique · AI\.PA/)).toBeVisible({ timeout: 15_000 })
  await shot(page, 'cours-8-tes-titres-rattache')

  // Back on Mon argent, Air Liquide counts at 171,08 € (855,40 € for 850 €).
  // « Tes titres » goes back to where it was opened from, and says its name.
  await expect(page.getByRole('link', { name: '‹ Placements en bourse' })).toBeVisible()
  await page.getByRole('navigation', { name: 'Onglets' }).getByRole('link', { name: 'Mon argent' }).click()
  await expect(page.getByText(/8\s751\s€/).first()).toBeVisible({ timeout: 30_000 })

  // 8. What left in clear: the symbols, the text searched, and nothing of the person's money.
  expectOnlyAllowed(traffic, ['CW8.PA', 'AI.PA', 'LU1681043599', 'FR0000120073', 'amundi msci world', 'air liquide', 'boursobank', 'revolut'])
  for (const body of traffic.quotes) {
    expect((JSON.parse(body) as { symbols: string[] }).symbols.every((s) => s === 'CW8.PA' || s === 'AI.PA')).toBe(true)
  }
  expect(traffic.searches.map((b) => JSON.parse(b))).toEqual([{ query: 'LU1681043599' }, { query: 'FR0000120073' }])
  expect(traffic.quotes.length).toBeGreaterThan(0)
  expect(traffic.rates.length).toBeGreaterThan(0)
})

test('a rate missing: no result to save until it comes back', async ({ page }) => {
  test.setTimeout(300_000)
  const market: Market = { prices: {}, day: todayIso(), quotesDown: false, ratesDown: false }
  const traffic = await playMarket(page, market)

  await firstSignIn(page, users[1])
  await page.getByRole('link', { name: 'C’est parti' }).click()
  await page.getByRole('button', { name: 'BoursoBank', exact: true }).click()
  await page.getByRole('button', { name: 'Suivant' }).click()
  await expect(page.getByRole('heading', { name: /Qu’as-tu .*BoursoBank/ })).toBeVisible()
  await add(page).click()
  await page.getByRole('button', { name: 'Livret A', exact: true }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '1000')
  await add(page).click()
  await page.getByRole('button', { name: 'J’ai fini avec BoursoBank' }).click()
  await expect(page).toHaveURL(/\/premier-lancement\/revelation$/)
  await page.getByRole('button', { name: 'Continuer' }).click()
  await expect(page.getByRole('heading', { name: 'Tes objectifs' })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByRole('heading', { name: /Combien dépenses-tu par mois/ })).toBeVisible()
  await page.getByRole('button', { name: 'Plus tard' }).click()
  await expect(page.getByText(/1\s000\s€/).first()).toBeVisible({ timeout: 15_000 })

  // A line in pounds is added during the update, then the ECB stops answering and the page
  // is read again: the draft keeps the line, and no rate converts it.
  await page.getByRole('link', { name: 'Mettre à jour' }).click()
  await page.getByRole('button', { name: 'Commencer par BoursoBank' }).click()
  await page.getByRole('button', { name: '+ Ajouter un compte' }).click()
  await page.getByRole('button', { name: /^LEP/ }).click()
  await page.getByRole('button', { name: 'Ouvert depuis la dernière fois' }).click()
  await page.getByRole('button', { name: 'Changer de devise' }).click()
  await page.getByRole('button', { name: 'livres sterling', exact: true }).click()
  await fill(page, 'Combien y a-t-il dessus ?', '2000')
  await add(page).click()
  await expect(page.getByRole('button', { name: /LEP/ })).toBeVisible()

  market.ratesDown = true
  await page.reload()
  await expect(page.getByRole('button', { name: /LEP/ })).toBeVisible({ timeout: 30_000 })
  // The last bank: its one main exit says « Rien n’a changé ici » until something is touched there.
  await page.getByRole('button', { name: /^(Voir le résultat|Rien n’a changé ici)$/ }).click()
  await expect(page).toHaveURL(/\/mise-a-jour\/resultat$/)
  await expect(page.getByText(/Le taux du jour des livres sterling n’a pas pu être récupéré/)).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0)
  await shot(page, 'cours-9-taux-manquant')

  // The rate comes back: « Réessayer » shows the result, and « Enregistrer ».
  market.ratesDown = false
  await page.getByRole('button', { name: 'Réessayer' }).click()
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText(/Converti en euros au taux de la Banque centrale européenne du 6 novembre\./)).toBeVisible()

  expectOnlyAllowed(traffic, ['livret a', 'boursobank', '100000', '200000'])
})
