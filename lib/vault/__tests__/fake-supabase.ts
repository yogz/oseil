// An in-memory stand-in for a Supabase project with a single user, reached
// through a real supabase-js client whose `fetch` is replaced. It implements
// just enough of GoTrue (auth, including the passkey registration and sign-in ceremonies)
// and PostgREST (the `vaults`, `documents` and `vault_passkeys` tables, and the
// `delete_my_account` function) for
// the vault tests, and records every request it receives — method, path with
// query, headers, body, and the status it answered — so a test can inspect
// exactly what would have left the device.
//
// It applies the filters it is sent and nothing else: there is no row-level
// security here, on purpose. The tests check that the code filters on the
// signed-in person by itself.

import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export type RecordedRequest = {
  method: string
  path: string
  headers: Record<string, string>
  body: string | null
  status: number
}

type Row = Record<string, unknown>
type User = { id: string; email: string; password: string }
type Table = 'vaults' | 'documents' | 'vault_passkeys'

const BASE_URL = 'http://fake.supabase.test'
const DOCUMENT_KINDS = ['profile', 'snapshot', 'draft', 'goals', 'settings']
const ONE_PER_PERSON = ['profile', 'settings', 'draft']
const REQUIRED: Record<Table, string[]> = {
  vaults: ['kdf', 'wrapped_by_password', 'wrapped_by_recovery'],
  documents: ['kind', 'iv', 'ciphertext'],
  vault_passkeys: ['credential_id', 'passkey_id', 'wrapped'],
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function empty(status: number): Response {
  return new Response(null, { status })
}

function bearer(headers: Headers): string | null {
  return headers.get('authorization')?.replace(/^Bearer /, '') ?? null
}

// GoTrue's error body, readable by auth-js with or without the API version header.
function authError(status: number, code: string, msg: string): Response {
  return json(status, { code, error_code: code, msg })
}

// Node's own encoder, not the app's: the fake must not share the code it tests.
const base64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

// The relying party the fake GoTrue registers passkeys for.
export const FAKE_RP = { id: 'stefin.test', name: 'PatriCube' }

export function fakeSupabase() {
  const recorded: RecordedRequest[] = []
  const tables: Record<Table, Row[]> = { vaults: [], documents: [], vault_passkeys: [] }
  const tokens = new Map<string, string>() // access token -> user id
  let user: User | null = null
  let staleVaultReads = 0
  let nextSignInRefusal: { status: number; code: string } | null = null
  let nextPasskeySignInRefusal: { status: number; code: string } | null = null
  // The passkeys GoTrue holds for the person: [{ id }], plus an optional refusal of the listing.
  const authPasskeys: Array<{ id: string; created_at: string }> = []
  // GoTrue's passkey id -> its WebAuthn credential id, which it sends back as credentials to exclude.
  const passkeyCredentials = new Map<string, string>()
  // Registration ceremonies started and not yet verified: challenge id -> challenge and user.
  const registrations = new Map<string, { challenge: string; userId: string }>()
  // Passkey sign-ins started and not yet verified: challenge id -> challenge.
  const authentications = new Map<string, string>()
  let passkeyListRefusal = false
  const refusedPasskeyDeletes = new Set<string>()
  let passkeyRowDeleteRefusal = false
  let passkeyRowReadRefusal = false
  let accountDeletionRefusal = false
  // WebAuthn extensions the server asks for in its passkey options, as a hostile or careless one could.
  let offeredExtensions: Record<string, unknown> | null = null
  let beforeRequest: ((request: RecordedRequest) => void) | null = null
  let lostAnswer: ((request: RecordedRequest) => boolean) | null = null

  function signedInUser(headers: Headers): User | null {
    const token = bearer(headers)
    return token && user && tokens.get(token) === user.id ? user : null
  }

  function publicUser(u: User) {
    return {
      id: u.id,
      aud: 'authenticated',
      role: 'authenticated',
      email: u.email,
      app_metadata: {},
      user_metadata: {},
      created_at: '2026-11-06T00:00:00Z',
    }
  }

  function newSession(u: User) {
    const accessToken = `access-${crypto.randomUUID()}`
    tokens.set(accessToken, u.id)
    return {
      access_token: accessToken,
      token_type: 'bearer',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      refresh_token: `refresh-${crypto.randomUUID()}`,
      user: publicUser(u),
    }
  }

  // What the device signed must be of this kind, for this challenge, and say
  // which passkey signed it.
  function signedFor(credential: unknown, type: string, challenge: string, field: string): boolean {
    const c = credential as { id?: unknown; rawId?: unknown; response?: Record<string, unknown> } | null
    let clientData: { type?: string; challenge?: string } = {}
    try {
      clientData = JSON.parse(Buffer.from(String(c?.response?.clientDataJSON), 'base64url').toString('utf8'))
    } catch {
      // Unreadable: refused just below.
    }
    return (
      clientData.type === type &&
      clientData.challenge === challenge &&
      typeof c?.rawId === 'string' &&
      c.id === c.rawId &&
      typeof c.response?.[field] === 'string'
    )
  }

  function auth(method: string, url: URL, headers: Headers, body: string | null): Response {
    const route = url.pathname.slice('/auth/v1'.length)

    if (method === 'POST' && route === '/signup') {
      const { email, password } = JSON.parse(body ?? '{}')
      // Like Supabase with e-mail confirmation on: a second sign-up for the
      // same address answers normally and changes nothing.
      user ??= { id: crypto.randomUUID(), email, password }
      return json(200, publicUser(user))
    }

    if (method === 'POST' && route === '/token' && url.searchParams.get('grant_type') === 'password') {
      const { email, password } = JSON.parse(body ?? '{}')
      if (!user || user.email !== email || user.password !== password) {
        return authError(400, 'invalid_credentials', 'Invalid login credentials')
      }
      if (nextSignInRefusal) {
        const { status, code } = nextSignInRefusal
        nextSignInRefusal = null
        return authError(status, code, `Refused: ${code}`)
      }
      return json(200, newSession(user))
    }

    // Signing in with a passkey needs no session: the passkey is the
    // credential. The options name no account, so the device offers whichever
    // passkey it holds for the site.
    if (method === 'POST' && route === '/passkeys/authentication/options') {
      const challengeId = crypto.randomUUID()
      const challenge = base64Url(crypto.getRandomValues(new Uint8Array(32)))
      authentications.set(challengeId, challenge)
      return json(200, {
        challenge_id: challengeId,
        expires_at: Math.floor(Date.now() / 1000) + 300,
        options: {
          challenge,
          timeout: 300000,
          rpId: FAKE_RP.id,
          userVerification: 'preferred',
          ...(offeredExtensions ? { extensions: offeredExtensions } : {}),
        },
      })
    }
    if (method === 'POST' && route === '/passkeys/authentication/verify') {
      const { challenge_id: challengeId, credential } = JSON.parse(body ?? '{}')
      const challenge = authentications.get(challengeId)
      if (challenge === undefined) {
        return authError(400, 'webauthn_challenge_not_found', 'No such authentication challenge')
      }
      authentications.delete(challengeId)
      if (nextPasskeySignInRefusal) {
        const { status, code } = nextPasskeySignInRefusal
        nextPasskeySignInRefusal = null
        return authError(status, code, `Refused: ${code}`)
      }
      // An opening, for the challenge handed out, by a passkey registered here.
      // The error codes below are the fake's own: GoTrue's are not known here.
      if (!signedFor(credential, 'webauthn.get', challenge, 'signature')) {
        return authError(400, 'webauthn_verification_failed', 'The credential does not answer the challenge')
      }
      if (!user || ![...passkeyCredentials.values()].includes(credential.rawId)) {
        return authError(400, 'webauthn_verification_failed', 'No such passkey')
      }
      return json(200, newSession(user))
    }

    // No refresh is ever granted: a session that expires here is dead, as when
    // its refresh token has been revoked.
    if (method === 'POST' && route === '/token' && url.searchParams.get('grant_type') === 'refresh_token') {
      return authError(400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found')
    }

    const current = signedInUser(headers)
    // A token still valid whose user has been deleted, as GoTrue refuses it.
    if (!current && tokens.has(bearer(headers) ?? '') && !user) {
      return authError(403, 'user_not_found', 'User from sub claim in JWT does not exist')
    }
    if (!current) return json(401, { code: 'bad_jwt', msg: 'invalid JWT' })

    if (method === 'GET' && route === '/user') return json(200, publicUser(current))
    if (method === 'PUT' && route === '/user') {
      const { password } = JSON.parse(body ?? '{}')
      // Like GoTrue: a new password equal to the current one is refused.
      if (typeof password === 'string' && password === current.password) {
        return authError(422, 'same_password', 'New password should be different from the old password.')
      }
      if (typeof password === 'string') current.password = password
      return json(200, publicUser(current))
    }
    if (method === 'POST' && route === '/passkeys/registration/options') {
      const challengeId = crypto.randomUUID()
      const challenge = base64Url(crypto.getRandomValues(new Uint8Array(32)))
      registrations.set(challengeId, { challenge, userId: current.id })
      return json(200, {
        challenge_id: challengeId,
        expires_at: Math.floor(Date.now() / 1000) + 300,
        options: {
          rp: FAKE_RP,
          user: { id: base64Url(new TextEncoder().encode(current.id)), name: current.email, displayName: current.email },
          challenge,
          pubKeyCredParams: [
            { type: 'public-key', alg: -7 },
            { type: 'public-key', alg: -257 },
          ],
          timeout: 300000,
          authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
          // The account's passkeys: a keychain that holds one of them refuses to make another.
          excludeCredentials: [...passkeyCredentials.values()].map((id) => ({ type: 'public-key', id })),
          attestation: 'none',
          ...(offeredExtensions ? { extensions: offeredExtensions } : {}),
        },
      })
    }
    if (method === 'POST' && route === '/passkeys/registration/verify') {
      const { challenge_id: challengeId, credential } = JSON.parse(body ?? '{}')
      const started = registrations.get(challengeId)
      if (!started || started.userId !== current.id) {
        return authError(400, 'webauthn_challenge_not_found', 'No such registration challenge')
      }
      registrations.delete(challengeId)
      // What the device signed must be a creation, for the challenge handed out.
      if (!signedFor(credential, 'webauthn.create', started.challenge, 'attestationObject')) {
        return authError(400, 'webauthn_verification_failed', 'The credential does not answer the challenge')
      }
      const passkey = { id: crypto.randomUUID(), created_at: new Date().toISOString() }
      authPasskeys.push(passkey)
      passkeyCredentials.set(passkey.id, credential.rawId)
      return json(200, passkey)
    }
    if (method === 'GET' && route === '/passkeys') {
      if (passkeyListRefusal) return authError(500, 'unexpected_failure', 'passkey listing down')
      return json(200, authPasskeys)
    }
    const passkeyId = route.match(/^\/passkeys\/([^/]+)$/)?.[1]
    if (method === 'DELETE' && passkeyId) {
      if (refusedPasskeyDeletes.has(passkeyId)) return authError(500, 'unexpected_failure', 'passkey delete down')
      const at = authPasskeys.findIndex((p) => p.id === passkeyId)
      if (at === -1) return authError(404, 'passkey_not_found', 'No such passkey')
      authPasskeys.splice(at, 1)
      passkeyCredentials.delete(passkeyId)
      return empty(204)
    }
    if (method === 'POST' && route === '/logout') {
      tokens.delete(bearer(headers)!)
      return empty(204)
    }
    return json(404, { msg: `fake-supabase: no auth route for ${method} ${route}` })
  }

  function rest(method: string, table: Table, url: URL, headers: Headers, body: string | null) {
    const current = signedInUser(headers)
    if (!current) return json(401, { code: '42501', message: `permission denied for table ${table}` })

    // Each filter: a column and the values it accepts (one for `eq`, several for `in`).
    const filters: Array<[string, string[]]> = []
    let columns: string[] | null = null
    let order: { column: string; ascending: boolean } | null = null
    for (const [name, value] of url.searchParams) {
      if (name === 'select') columns = value === '*' ? null : value.split(',')
      else if (name === 'order') {
        const [column, direction = 'asc'] = value.split('.')
        order = { column, ascending: direction === 'asc' }
      } else if (value.startsWith('eq.')) filters.push([name, [value.slice(3)]])
      else if (value === 'is.null') filters.push([name, ['null']])
      else if (value.startsWith('in.(') && value.endsWith(')')) {
        filters.push([name, value.slice(4, -1).split(',').map((v) => v.replace(/^"(.*)"$/, '$1'))])
      } else return json(400, { message: `fake-supabase: unsupported parameter ${name}=${value}` })
    }

    // `column->>key` reads a text field of a JSON column, as PostgREST does.
    const read = (row: Row, column: string) => {
      const [name, key] = column.split('->>')
      const value = row[name]
      return key === undefined ? value : (value as Record<string, unknown> | null)?.[key]
    }
    const matches = (row: Row) => filters.every(([column, values]) => values.includes(String(read(row, column) ?? null)))
    const project = (row: Row) =>
      columns ? Object.fromEntries(columns.map((column) => [column, row[column]])) : { ...row }
    const representation = headers.get('prefer')?.includes('return=representation') ?? false
    const answer = (status: number, rows: Row[]) =>
      representation ? json(status, rows.map(project)) : empty(status === 201 ? 201 : 204)

    if (method === 'GET') {
      if (table === 'vaults' && staleVaultReads > 0) {
        staleVaultReads--
        return json(200, [])
      }
      if (table === 'vault_passkeys' && passkeyRowReadRefusal) {
        return json(500, { code: 'XX000', message: 'vault_passkeys read refused' })
      }
      const found = tables[table].filter(matches)
      if (order) {
        const { column, ascending } = order
        found.sort((a, b) => String(a[column]).localeCompare(String(b[column])) * (ascending ? 1 : -1))
      }
      return json(200, found.map(project))
    }

    if (method === 'POST') {
      const now = new Date().toISOString()
      const row: Row = {
        ...(table === 'documents' ? { id: crypto.randomUUID(), format: 1 } : {}),
        // Empty until the person has confirmed the recovery key.
        ...(table === 'vaults' ? { recovery_confirmed_at: null } : {}),
        user_id: current.id,
        created_at: now,
        updated_at: now,
        ...JSON.parse(body ?? '{}'),
      }
      const missing = REQUIRED[table].find((column) => row[column] == null)
      if (missing) {
        return json(400, { code: '23502', message: `null value in column "${missing}"` })
      }
      if (table === 'documents' && !DOCUMENT_KINDS.includes(String(row.kind))) {
        return json(400, { code: '23514', message: 'violates check constraint "documents_kind_check"' })
      }
      if (table === 'vaults' && tables.vaults.some((other) => other.user_id === row.user_id)) {
        return json(409, {
          code: '23505',
          message: 'duplicate key value violates unique constraint "vaults_pkey"',
          details: `Key (user_id)=(${String(row.user_id)}) already exists.`,
          hint: null,
        })
      }
      if (table === 'documents' && tables.documents.some((other) => other.id === row.id)) {
        return json(409, {
          code: '23505',
          message: 'duplicate key value violates unique constraint "documents_pkey"',
          details: `Key (id)=(${String(row.id)}) already exists.`,
          hint: null,
        })
      }
      // As the migration's documents_one_per_person index: one profile, settings and draft per person.
      if (
        table === 'documents' &&
        ONE_PER_PERSON.includes(String(row.kind)) &&
        tables.documents.some((other) => other.user_id === row.user_id && other.kind === row.kind)
      ) {
        return json(409, {
          code: '23505',
          message: 'duplicate key value violates unique constraint "documents_one_per_person"',
          details: `Key (user_id, kind)=(${String(row.user_id)}, ${String(row.kind)}) already exists.`,
          hint: null,
        })
      }
      tables[table].push(row)
      return answer(201, [row])
    }

    if (method === 'PATCH') {
      const changes = JSON.parse(body ?? '{}')
      const affected = tables[table].filter(matches)
      for (const row of affected) Object.assign(row, changes)
      return answer(200, affected)
    }

    if (method === 'DELETE') {
      if (table === 'vault_passkeys' && passkeyRowDeleteRefusal) {
        return json(500, { code: 'XX000', message: 'vault_passkeys delete refused' })
      }
      const affected = tables[table].filter(matches)
      tables[table] = tables[table].filter((row) => !matches(row))
      return answer(200, affected)
    }

    return json(405, { message: `fake-supabase: ${method} not supported` })
  }

  // `public.delete_my_account()`: the signed-in user goes, and with them, by
  // cascade, every row that bears their id. Their tokens stay valid as JWTs.
  function deleteMyAccount(method: string, headers: Headers): Response {
    if (method !== 'POST') return json(405, { message: `fake-supabase: ${method} not supported` })
    const current = signedInUser(headers)
    if (!current) return json(400, { code: 'P0001', message: 'Not signed in' })
    if (accountDeletionRefusal) return json(500, { code: 'XX000', message: 'delete_my_account refused' })
    for (const rows of Object.values(tables)) {
      const kept = rows.filter((row) => row.user_id !== current.id)
      rows.splice(0, rows.length, ...kept)
    }
    authPasskeys.length = 0
    passkeyCredentials.clear()
    user = null
    return empty(204)
  }

  const fakeFetch: typeof fetch = async (input, init) => {
    // Going through Request reads any kind of body as text, so nothing sent
    // can escape the record.
    const request = new Request(input, init)
    const url = new URL(request.url)
    const text = await request.text()
    const body = text === '' ? null : text
    const entry: RecordedRequest = {
      method: request.method,
      path: url.pathname + url.search,
      headers: Object.fromEntries(request.headers),
      body,
      status: 0,
    }
    recorded.push(entry)
    beforeRequest?.(entry)

    const table = url.pathname.match(/^\/rest\/v1\/(vaults|documents|vault_passkeys)$/)?.[1] as Table | undefined
    const response = url.pathname.startsWith('/auth/v1/')
      ? auth(request.method, url, request.headers, body)
      : url.pathname === '/rest/v1/rpc/delete_my_account'
        ? deleteMyAccount(request.method, request.headers)
        : table
          ? rest(request.method, table, url, request.headers, body)
          : json(404, { message: `fake-supabase: no route for ${url.pathname}` })
    entry.status = response.status
    // The write above landed; the answer never reaches the caller.
    if (lostAnswer?.(entry)) {
      lostAnswer = null
      entry.status = 502
      return json(502, { message: 'fake-supabase: the answer was lost' })
    }
    return response
  }

  return {
    /** A new supabase-js client — a new tab or device — talking to this server. */
    client(): SupabaseClient {
      return createClient(BASE_URL, 'sb_publishable_fake', {
        global: { fetch: fakeFetch },
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      })
    },
    recorded,
    tables,
    authPasskeys,
    /** Deleting this GoTrue passkey fails. */
    failPasskeyDelete(id: string) {
      refusedPasskeyDeletes.add(id)
    },
    /** Deleting `vault_passkeys` rows fails. */
    failPasskeyRowDelete() {
      passkeyRowDeleteRefusal = true
    },
    /**
     * Reading `vault_passkeys` rows fails, with a server error. Not a network
     * failure: supabase-js would retry that read three times, over seven seconds.
     */
    failPasskeyRowRead() {
      passkeyRowReadRefusal = true
    },
    /** Deleting the account fails, with a server error, and nothing is deleted. */
    failAccountDeletion() {
      accountDeletionRefusal = true
    },
    /** From now on, the passkey options (registration and sign-in) ask for these WebAuthn extensions. */
    offerExtensions(extensions: Record<string, unknown>) {
      offeredExtensions = extensions
    },
    /** The next listing of GoTrue passkeys fails, and stays failing. */
    failPasskeyListing() {
      passkeyListRefusal = true
    },
    get user(): User | null {
      return user
    },
    /** The next read of `vaults` finds nothing, as if it ran before another tab's insert landed. */
    simulateStaleVaultRead() {
      staleVaultReads++
    },
    /** The next sign-in with the right password is refused with this GoTrue error code. */
    refuseNextSignIn(code: string, status = 400) {
      nextSignInRefusal = { status, code }
    },
    /** The next passkey sign-in, however good, is refused with this status and GoTrue error code. */
    refuseNextPasskeySignIn(status: number, code: string) {
      nextPasskeySignInRefusal = { status, code }
    },
    /** The next request this matches is carried out, but answered with a server error. */
    loseNextAnswer(match: (request: RecordedRequest) => boolean) {
      lostAnswer = match
    },
    /** Runs on each request once recorded, before it is answered — to change the state mid-flow. */
    beforeEachRequest(hook: ((request: RecordedRequest) => void) | null) {
      beforeRequest = hook
    },
  }
}

export type FakeSupabase = ReturnType<typeof fakeSupabase>
