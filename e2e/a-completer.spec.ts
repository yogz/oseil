// « À compléter », end to end, in a phone-sized browser, against the real Supabase project: a confirmed test
// user is created with the secret key before the test, and deleted after it, whatever happens.
// A PEA line entered without its purchase price shows up on Repères; answering « Je ne sais pas son prix
// d’achat » on its sheet removes that row (the line's other gaps, such as its missing price symbol, remain).
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test, type Page } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { fill, firstSignIn, need, type TestUser } from './support'

test.use({ viewport: { width: 375, height: 812 } })

const user: TestUser = {
  email: `e2e-a-completer-${Date.now()}@example.com`,
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

test('a line without purchase price is listed, then answered, then gone', async ({ page }) => {
  test.setTimeout(240_000)
  await firstSignIn(page, user)

  // First launch: a PEA with one fund, its purchase price left empty.
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

  // Repères lists the gap.
  await page.getByRole('link', { name: 'Repères' }).click()
  await expect(page.getByRole('heading', { name: 'À compléter' })).toBeVisible({ timeout: 30_000 })
  const row = page.getByRole('link', { name: /1 titre sans prix d’achat/ })
  await expect(row).toBeVisible()

  // Following it opens the line's sheet; the answer is « Je ne sais pas ».
  await row.click()
  await expect(page.getByRole('heading', { name: 'Fonds monde', exact: true })).toBeVisible({ timeout: 30_000 })
  await page.getByRole('button', { name: 'Je ne sais pas son prix d’achat' }).click()
  await expect(page.getByText('Tu ne le sais pas')).toBeVisible({ timeout: 30_000 })

  // Back on Repères, nothing is left to complete.
  await page.getByRole('link', { name: 'Repères' }).click()
  await expect(page.getByRole('heading', { name: 'Repères', level: 1 })).toBeVisible()
  // The test fund has no price symbol and no zone, so those two gaps of the same line legitimately remain:
  // the section stays, but the purchase gap is gone.
  await expect(page.getByRole('link', { name: /sans prix d’achat/ })).toHaveCount(0)
  await expect(page.getByRole('link', { name: /ne suit pas son cours/ })).toBeVisible()

  // Following the quote gap opens « Tes titres » on the title to find, with a way back to the Repères;
  // « Pas coté » answers it in place.
  await page.getByRole('link', { name: /ne suit pas son cours/ }).click()
  await expect(page.getByRole('heading', { name: 'Tes titres' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByText('1 titre ne suit pas son cours. Retrouve-le, ou dis-nous s’il n’est pas coté.')).toBeVisible({
    timeout: 30_000,
  })
  await page.getByRole('button', { name: 'Pas coté : Fonds monde' }).click()
  await expect(page.getByText('Tous tes titres sont en ordre.')).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('button', { name: /^1 placement pas coté/ })).toBeVisible()
  await page.getByRole('link', { name: '‹ Repères' }).click()
  await expect(page.getByRole('heading', { name: 'À compléter' })).toBeVisible({ timeout: 30_000 })
  await expect(page.getByRole('link', { name: /ne suit pas son cours/ })).toHaveCount(0)
})
