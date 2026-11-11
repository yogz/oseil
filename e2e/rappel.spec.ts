// The link « Ne plus recevoir ce rappel » of the reminder e-mail, end to end, against the real Supabase
// project: a confirmed test user is created with the secret key before the test, and deleted after it,
// whatever happens (its reminder row goes with it, by cascade).
//
// The page is opened without a session, as from the e-mail. Opening it must switch nothing off (mail
// filters open links ahead of the person); only the touch on the button does. An unknown token gets the
// same confirmation: the page never tells whether an account exists.
import { randomBytes, randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { expect, test } from '@playwright/test'
import { need } from './support'

test.use({ viewport: { width: 375, height: 812 } })

let admin: SupabaseClient
let userId: string | null = null
let token: string

// What the base holds for the test user, read with the secret key (the table has no other reader).
async function emailOff(): Promise<boolean> {
  const { data, error } = await admin.from('update_reminders').select('email_off').eq('user_id', userId).single()
  if (error) throw new Error(`Reading the reminder failed: ${error.message}`)
  return data.email_off as boolean
}

test.beforeAll(async () => {
  admin = createClient(need('NEXT_PUBLIC_SUPABASE_URL'), need('SUPABASE_SECRET_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const { data, error } = await admin.auth.admin.createUser({
    email: `e2e-rappel-${Date.now()}@example.com`,
    password: randomBytes(32).toString('hex'),
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`createUser failed: ${error?.message}`)
  userId = data.user.id
  // The row the sending function would create with the first e-mail; its token is the one of the link.
  const row = await admin
    .from('update_reminders')
    .insert({ user_id: userId })
    .select('unsubscribe_token, email_off')
    .single()
  if (row.error) throw new Error(`Creating the reminder failed: ${row.error.message}`)
  expect(row.data.email_off).toBe(false)
  token = row.data.unsubscribe_token as string
})

test.afterAll(async () => {
  if (!userId) return
  const { error } = await admin.auth.admin.deleteUser(userId)
  if (error) throw new Error(`Cleanup of the test user failed: ${error.message}`)
})

test('opening the link switches nothing off; the touch does', async ({ page }) => {
  await page.goto(`/rappel/arreter?jeton=${token}`)
  // A public page: no detour by the sign-in.
  await expect(page).toHaveURL(/\/rappel\/arreter\?jeton=/)
  const stop = page.getByRole('button', { name: 'Ne plus recevoir ce rappel' })
  await expect(stop).toBeVisible()
  // Give a prefetching filter all the time it would have: still on.
  await page.waitForTimeout(1000)
  expect(await emailOff()).toBe(false)

  await stop.click()
  await expect(page.getByText('C’est noté, plus de rappel par e-mail.')).toBeVisible()
  await expect(page.getByText('Tu peux le remettre quand tu veux, dans les Réglages.')).toBeVisible()
  await expect.poll(emailOff).toBe(true)
})

test('an unknown token gets the same confirmation', async ({ page }) => {
  await page.goto(`/rappel/arreter?jeton=${randomUUID()}`)
  await page.getByRole('button', { name: 'Ne plus recevoir ce rappel' }).click()
  await expect(page.getByText('C’est noté, plus de rappel par e-mail.')).toBeVisible()
})

test('a link without a token gets the same confirmation', async ({ page }) => {
  await page.goto('/rappel/arreter')
  await page.getByRole('button', { name: 'Ne plus recevoir ce rappel' }).click()
  await expect(page.getByText('C’est noté, plus de rappel par e-mail.')).toBeVisible()
})
