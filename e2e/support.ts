// What the end-to-end journeys share: the environment, the keys a browser
// holds, and the sign-in screen.
import { expect, type Page } from '@playwright/test'
import { GROUP_ORDINALS } from '../lib/auth/recovery-check'

export function need(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`Missing environment variable ${name}`)
  return value
}

// The keys this browser holds for the vault, read straight from IndexedDB.
export function keysOnDevice(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('stefin-vault', 1)
        request.onupgradeneeded = () => request.result.createObjectStore('keys')
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const database = request.result
          const count = database.transaction('keys', 'readonly').objectStore('keys').count()
          count.onerror = () => reject(count.error)
          count.onsuccess = () => {
            database.close()
            resolve(count.result)
          }
        }
      }),
  )
}

export async function signInThroughPage(page: Page, address: string, secret: string) {
  await page.getByLabel('Ton adresse e-mail').fill(address)
  await page.getByLabel('Ton mot de passe').fill(secret)
  await page.getByRole('button', { name: 'Me connecter' }).click()
}

// The signed-in application is on screen: « Mon argent », or the welcome of the
// first launch where a person with nothing yet is sent from it.
export async function expectApplication(page: Page) {
  await expect(
    page
      .getByRole('heading', { name: 'Mon argent' })
      .or(page.getByRole('heading', { name: 'Ton argent, en 100 carrés' })),
  ).toBeVisible({ timeout: 15_000 })
}

export type TestUser = { email: string; password: string; id: string | null }

// The recovery key as the screen shows it: 8 groups of 4 Crockford characters.
export const SHOWN_KEY = /^[0-9A-HJKMNP-TV-Z]{4}(-[0-9A-HJKMNP-TV-Z]{4}){7}$/

// The group the check asks for (drawn at random), read from its field's label.
export async function askedGroup(page: Page): Promise<number> {
  const label = (await page.locator('label', { hasText: /morceau$/ }).textContent())!.toLowerCase()
  return GROUP_ORDINALS.findIndex((ordinal) => label.startsWith(ordinal))
}

// Goes through the recovery key screen as a person who put the key away:
// « Je l’ai rangée », then the asked group typed back, then « C’est fait ».
export async function confirmRecoveryKey(page: Page) {
  const key = (await page.getByText(SHOWN_KEY).textContent())!
  await page.getByRole('button', { name: 'Je l’ai rangée' }).click()
  const index = await askedGroup(page)
  await page.getByRole('textbox', { name: /morceau$/ }).fill(key.split('-')[index])
  await page.getByRole('button', { name: 'C’est fait' }).click()
}

// The first sign-in of a new user creates the vault and shows its recovery
// key, confirmed as above.
export async function firstSignIn(page: Page, user: TestUser) {
  await page.goto('/connexion')
  await signInThroughPage(page, user.email, user.password)
  await expect(page.getByRole('heading', { name: 'Ta clé de secours' })).toBeVisible({ timeout: 60_000 })
  await confirmRecoveryKey(page)
  await expect(page).toHaveURL(/\/premier-lancement$/, { timeout: 30_000 })
}

// With E2E_SHOTS=<directory>, saves a full-page screenshot there; without it, does nothing.
export async function shot(page: Page, name: string) {
  const directory = process.env.E2E_SHOTS
  if (!directory) return
  // Let the grid's entrance animation and any toast settle.
  await page.waitForTimeout(1500)
  await page.screenshot({ path: `${directory}/${name}.png`, fullPage: true })
}

export async function fill(page: Page, label: string | RegExp, value: string) {
  await page.getByLabel(label).fill(value)
}
