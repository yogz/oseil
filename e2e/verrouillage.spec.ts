// The vault closes by itself after 15 minutes untouched (lib/app/idle-lock.ts), end to end, against the
// real Supabase project: a confirmed test user is created with the secret key before the test, and
// deleted after it, whatever happens. The 15 minutes are not waited for: the time of the last activity,
// a word of the browser's storage, is set back an hour, as for a phone put down and picked up again.
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { deriveSecrets } from '../lib/vault/kdf'
import { firstSignIn, need, signInThroughPage, type TestUser } from './support'

const user: TestUser = {
  email: `e2e-verrouillage-${Date.now()}@example.com`,
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
  const { data, error } = await admin.auth.admin.createUser({ email: user.email, password: authSecret, email_confirm: true })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  user.id = data.user.id
})

test.afterAll(async () => {
  // Deleting a user cascades to its vault and documents.
  if (!user.id) return
  const { error } = await admin.auth.admin.deleteUser(user.id)
  if (error) throw new Error(`Cleanup of the test user failed: ${error.message}`)
})

test('an hour untouched, the vault is closed: the sign-in says why, and opens it again', async ({ page }) => {
  test.setTimeout(180_000)
  await firstSignIn(page, user)
  // Signed in: the clock is running.
  expect(await page.evaluate(() => localStorage.getItem('oseil-derniere-activite'))).not.toBeNull()

  // The phone put down an hour ago, then the application opened again.
  await page.evaluate(() => localStorage.setItem('oseil-derniere-activite', String(Date.now() - 60 * 60 * 1000)))
  await page.reload()

  await expect(page).toHaveURL(/\/connexion$/, { timeout: 30_000 })
  await expect(page.getByText(/Ton coffre s’est refermé après 15\s+minutes sans activité\./)).toBeVisible()
  // Closed by the clock, not by the person: the address stays in the field (lib/auth/remembered-email.ts).
  await expect(page.getByLabel('Ton adresse e-mail')).toHaveValue(user.email)
  // The key has left the device: nothing of the vault stays behind.
  const keys = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('stefin-vault')
        // A store that does not exist is not created by looking: the look is undone.
        open.onupgradeneeded = () => {
          open.transaction?.abort()
          resolve(0)
        }
        open.onsuccess = () => {
          const db = open.result
          if (!db.objectStoreNames.length) return resolve(0)
          const count = db.transaction(db.objectStoreNames[0]).objectStore(db.objectStoreNames[0]).count()
          count.onsuccess = () => {
            resolve(count.result)
            db.close()
          }
        }
        open.onerror = () => resolve(0)
      }),
  )
  expect(keys).toBe(0)

  // Opened again with the password: the sentence is said no more, the clock starts again.
  await signInThroughPage(page, user.email, user.password)
  await expect(page).not.toHaveURL(/\/connexion$/, { timeout: 30_000 })
  const last = await page.evaluate(() => Number(localStorage.getItem('oseil-derniere-activite')))
  expect(Date.now() - last).toBeLessThan(60_000)
})
