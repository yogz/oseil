import { afterEach, describe, expect, expectTypeOf, test, vi } from 'vitest'
import type { Model } from '@/lib/app/use-model'
import {
  modelMark,
  rememberModel,
  rememberVault,
  rememberedModel,
  rememberedVault,
  vaultMark,
} from '@/lib/app/session-memory'
import { FAKE_RP, fakeSupabase, type FakeSupabase, type RecordedRequest } from '@/lib/vault/__tests__/fake-supabase'
import { memoryKeyStore } from '@/lib/vault/device'
import { generateDataKey, unwrapDataKey, wrapDataKey } from '@/lib/vault/keys'
import { passkeyAad, prfSalt, wrappingKeyFromPrf } from '@/lib/vault/passkey'
import type { Sealed } from '@/lib/vault/seal'
import { todayIso } from '@/lib/dates'
import { confirmRecoveryKeySeen, loadDocuments, saveDocument } from '@/lib/vault/store'
import { signIn, signUp } from '../account'
import {
  activateFaceId,
  confirmWithFaceId,
  FaceIdCancelledError,
  FaceIdNoLongerOpensError,
  FaceIdOtherAccountError,
  FaceIdUnavailableError,
  hasExpired,
  listFaceIdKeys,
  prepareFaceId,
  prepareFaceIdSignIn,
  removeFaceIdKey,
  signInWithFaceId,
  type PreparedSignIn,
} from '../face-id'
import type { WebAuthn } from '../webauthn'
import { memoryStorage } from './memory-storage'

const EMAIL = 'a@b.fr'
const PASSWORD = 'correct horse battery'
const MARKER = 'stefin-face-id'

// What the passkey answers to stefin's salt. Readable bytes, so a leak would
// show even sent as raw text.
const SECRET = new TextEncoder().encode('stefin-test-prf-secret-32-bytes!')
// What it answers to any other salt.
const OTHER_SECRET = new TextEncoder().encode('a-secret-for-some-other-salt-32!')

// Node's own encoders, not the app's.
const base64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')
// Every form the secret could take in what is sent (`text`), with a value that
// would write it so once serialised (`sent`): encoded first, as a list, or the
// bytes as they are.
const SECRET_FORMS: Array<{ name: string; text: string; sent: unknown }> = [
  { name: 'raw text', text: new TextDecoder().decode(SECRET), sent: new TextDecoder().decode(SECRET) },
  { name: 'base64', text: Buffer.from(SECRET).toString('base64'), sent: Buffer.from(SECRET).toString('base64') },
  { name: 'base64url', text: base64Url(SECRET), sent: base64Url(SECRET) },
  { name: 'hex', text: Buffer.from(SECRET).toString('hex'), sent: Buffer.from(SECRET).toString('hex') },
  { name: 'a list of bytes', text: [...SECRET].join(','), sent: [...SECRET] },
  { name: 'the bytes as JSON writes them', text: JSON.stringify(SECRET), sent: SECRET },
]

function bytes(source: BufferSource): Uint8Array {
  return ArrayBuffer.isView(source)
    ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength)
    : new Uint8Array(source)
}

function sameBytes(source: BufferSource | undefined, expected: Uint8Array): boolean {
  return source !== undefined && Buffer.from(bytes(source)).equals(Buffer.from(expected))
}

// A passkey's PRF output is fixed by the salt it is given.
function prfOutput(extensions?: AuthenticationExtensionsClientInputs): Uint8Array | undefined {
  const salt = extensions?.prf?.eval?.first
  if (!salt) return undefined
  return sameBytes(salt, prfSalt()) ? SECRET : OTHER_SECRET
}

type Prf = { enabled?: boolean; first?: Uint8Array }

// Where a passkey could also put the secret, besides `prf`: the older
// extension that answers a salt the same way, or a name nobody knows.
type Elsewhere = 'hmacGetSecret' | 'foo'

// What a server could ask for in its passkey options, besides what stefin asks.
const SERVER_EXTENSIONS = {
  hmacGetSecret: { salt1: base64Url(prfSalt()) },
  largeBlob: { support: 'preferred' },
  someExtensionNobodyKnows: { answer: 'everything' },
  prf: { eval: { first: base64Url(new TextEncoder().encode('a salt the server chose')) } },
}

// A credential as a browser returns it, `toJSON` included. Like a browser's,
// that `toJSON` writes the PRF secret out in base64url: the trap to avoid.
function fakeCredential(input: {
  kind: 'create' | 'get'
  rawId: Uint8Array
  challenge: BufferSource
  prf?: Prf
  // The creation asked whether the passkey is discoverable.
  credProps?: boolean
  // The secret is also answered under this name.
  elsewhere?: Elsewhere
}): PublicKeyCredential {
  const id = base64Url(input.rawId)
  const clientDataJSON = new TextEncoder().encode(
    JSON.stringify({ type: `webauthn.${input.kind}`, challenge: base64Url(bytes(input.challenge)), origin: `https://${FAKE_RP.id}` }),
  )
  const response: Record<string, Uint8Array> =
    input.kind === 'create'
      ? { clientDataJSON, attestationObject: new Uint8Array([0xa3, 0x63, 0x66, 0x6d, 0x74]) }
      : { clientDataJSON, authenticatorData: new Uint8Array(37), signature: new Uint8Array([0x30, 0x45]) }
  const secret = input.prf?.first
  const elsewhere = <T,>(value: T) =>
    input.elsewhere === 'hmacGetSecret' ? { hmacGetSecret: { output1: value } } : { [input.elsewhere!]: value }
  const extensionResults = <T,>(encode: (value: Uint8Array) => T) => ({
    ...(input.credProps ? { credProps: { rk: true } } : {}),
    ...(input.prf === undefined
      ? {}
      : {
          prf: {
            ...(input.prf.enabled === undefined ? {} : { enabled: input.prf.enabled }),
            ...(secret ? { results: { first: encode(secret) } } : {}),
          },
        }),
    ...(input.elsewhere && secret ? elsewhere(encode(secret)) : {}),
  })
  return {
    id,
    rawId: input.rawId.slice().buffer,
    type: 'public-key',
    authenticatorAttachment: 'platform',
    response: Object.fromEntries(Object.entries(response).map(([name, value]) => [name, value.slice().buffer])),
    getClientExtensionResults: () => extensionResults((value) => value.slice().buffer),
    toJSON: () => ({
      id,
      rawId: id,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: Object.fromEntries(Object.entries(response).map(([name, value]) => [name, base64Url(value)])),
      clientExtensionResults: extensionResults(base64Url),
    }),
  } as unknown as PublicKeyCredential
}

type Behaviour = {
  // What the new passkey says of the PRF extension: the secret, only that it
  // can give one, that it cannot, or nothing at all.
  atCreation: 'secret' | 'enabled' | 'disabled' | 'silent'
  // An opening gives the secret, unless told otherwise.
  secretOnGet?: boolean
  // Another passkey than the one asked for answers the opening.
  anotherAnswers?: boolean
  // The person cancels, or the browser refuses: the creation...
  refuse?: DOMException
  // ...or an opening.
  refuseOpening?: DOMException
  // The passkey also answers the secret under another name.
  elsewhere?: Elsewhere
}

// A device with one keychain. Like a real one, it refuses to create a second
// passkey of an account it already holds one for, and offers the passkey it
// holds when an opening names none. Its behaviour can change along the way.
function fakeDevice(timeline: string[], behaviour: Behaviour) {
  const keychain = new Set<string>()
  const created: PublicKeyCredentialCreationOptions[] = []
  const asked: PublicKeyCredentialRequestOptions[] = []
  const credentials: PublicKeyCredential[] = []
  const opened: PublicKeyCredential[] = []

  function held(): Uint8Array {
    const id = [...keychain].at(-1)
    if (!id) throw new DOMException('No passkey for this site on this device', 'NotAllowedError')
    return new Uint8Array(Buffer.from(id, 'base64url'))
  }

  const webauthn: WebAuthn = {
    supported: async () => true,
    async create(options) {
      timeline.push('create')
      created.push(options)
      if (behaviour.refuse) throw behaviour.refuse
      if (options.excludeCredentials?.some((excluded) => keychain.has(base64Url(bytes(excluded.id))))) {
        throw new DOMException('The authenticator already holds a credential of this account', 'InvalidStateError')
      }
      const rawId = crypto.getRandomValues(new Uint8Array(16))
      keychain.add(base64Url(rawId))
      const prf = {
        secret: { enabled: true, first: prfOutput(options.extensions) },
        enabled: { enabled: true },
        disabled: { enabled: false },
        silent: undefined,
      }[behaviour.atCreation]
      const credential = fakeCredential({
        kind: 'create',
        rawId,
        challenge: options.challenge,
        prf,
        credProps: options.extensions?.credProps === true,
        elsewhere: behaviour.elsewhere,
      })
      credentials.push(credential)
      return credential
    },
    async get(options) {
      timeline.push('get')
      asked.push(options)
      if (behaviour.refuseOpening) throw behaviour.refuseOpening
      const rawId = behaviour.anotherAnswers
        ? crypto.getRandomValues(new Uint8Array(16))
        : options.allowCredentials?.length
          ? bytes(options.allowCredentials[0].id)
          : held()
      const prf = behaviour.secretOnGet === false ? {} : { first: prfOutput(options.extensions) }
      const credential = fakeCredential({
        kind: 'get',
        rawId,
        challenge: options.challenge,
        prf,
        elsewhere: behaviour.elsewhere,
      })
      opened.push(credential)
      return credential
    },
  }
  return { webauthn, behaviour, created, asked, credentials, opened, credentialId: () => credentials.at(-1)!.id }
}

// Signed in by password on a vault whose recovery key is confirmed: the case
// where Face ID is offered.
async function signedIn(server: FakeSupabase) {
  const client = server.client()
  const keys = memoryKeyStore()
  await signUp(client, { email: EMAIL, password: PASSWORD, redirectTo: 'http://x/confirmation' })
  const first = await signIn(client, keys, { email: EMAIL, password: PASSWORD })
  if (first.status !== 'new-vault') throw new Error('expected a new vault')
  await confirmRecoveryKeySeen(client, first.recoveryDisplay)
  const result = await signIn(client, keys, { email: EMAIL, password: PASSWORD })
  if (result.status !== 'unlocked') throw new Error('expected an unlocked vault')
  return { client, keys, faceId: result.faceId }
}

// Ready to tap « Activer »: signed in, the registration started, and every
// request and the marker's write noted in one timeline from here on. The
// server can ask for extensions of its own in its passkey options.
async function offered(behaviour: Behaviour, serverExtensions?: Record<string, unknown>) {
  const server = fakeSupabase()
  const { client, keys, faceId } = await signedIn(server)
  if (serverExtensions) server.offerExtensions(serverExtensions)
  const timeline: string[] = []
  const storage = memoryStorage((key) => timeline.push(`marker ${key}`))
  vi.stubGlobal('localStorage', storage)
  const device = fakeDevice(timeline, behaviour)
  const prepared = await prepareFaceId(client)
  const note = (request: { method: string; path: string }) => timeline.push(`${request.method} ${request.path.split('?')[0]}`)
  server.beforeEachRequest(note)
  // The screen's second button, tapped at once unless a test says otherwise.
  const confirm = vi.fn(async () => {})
  return {
    server,
    client,
    keys,
    faceId,
    timeline,
    storage,
    device,
    prepared,
    note,
    confirm,
    mark: server.recorded.length,
    activate: (extra: { confirm?: () => Promise<void> } = {}) =>
      activateFaceId(client, device.webauthn, {
        prepared,
        keyEncryptionKey: faceId.keyEncryptionKey,
        userId: faceId.userId,
        confirm: extra.confirm ?? confirm,
      }),
  }
}

const ACTIVATION = [
  'GET /rest/v1/vaults',
  'POST /auth/v1/passkeys/registration/verify',
  'POST /rest/v1/vault_passkeys',
  `marker ${MARKER}`,
]

// Face ID activated on this device, then Safari wiped the site's data after a
// week away: a new client with no session, an empty key store, no marker. Only
// the passkey is left, in the keychain. The sign-in is prepared, as the page
// does when it opens, and every request and the marker's write go on being
// noted in the timeline from here on.
async function returning(serverExtensions?: Record<string, unknown>) {
  const setup = await offered({ atCreation: 'secret' }, serverExtensions)
  const { server, faceId } = setup
  const documentId = await saveDocument(setup.client, (await setup.keys.get(faceId.userId))!, {
    kind: 'profile',
    value: { name: 'Alix' },
  })
  if ((await setup.activate()).status !== 'active') throw new Error('expected Face ID to be active')
  setup.storage.clear()
  const client = server.client()
  const keys = memoryKeyStore()
  const prepared = await prepareFaceIdSignIn(client)
  setup.timeline.length = 0
  return {
    server,
    client,
    // The client of the password sign-in, whose session still opens: it can
    // remove the passkey from Supabase, as another device or a start-over would.
    passwordClient: setup.client,
    keys,
    prepared,
    documentId,
    userId: faceId.userId,
    keyEncryptionKey: faceId.keyEncryptionKey,
    device: setup.device,
    timeline: setup.timeline,
    storage: setup.storage,
    mark: server.recorded.length,
    signIn: (change: Partial<PreparedSignIn> = {}) =>
      signInWithFaceId(client, keys, setup.device.webauthn, { ...prepared, ...change }),
  }
}

// The tap, then the session, then the packet.
const OPENED = ['get', 'POST /auth/v1/passkeys/authentication/verify', 'GET /rest/v1/vault_passkeys']

// No session on this client, no key of this person on the device, no marker.
async function expectNothingKept(ready: Awaited<ReturnType<typeof returning>>) {
  expect((await ready.client.auth.getSession()).data.session).toBeNull()
  expect(await ready.keys.get(ready.userId)).toBeNull()
  expect(ready.storage.getItem(MARKER)).toBeNull()
}

// This device carries « Face ID activé ici », as after an activation; the
// timeline starts afresh from here.
function markedHere(ready: Awaited<ReturnType<typeof returning>>) {
  ready.storage.setItem(MARKER, '1')
  ready.timeline.length = 0
}

// The packet written opens with the passkey's secret, for this person and this
// passkey only, and gives back the very data key the password opens.
async function expectPacketOpens(setup: Awaited<ReturnType<typeof offered>>, documentId: string) {
  const [row] = setup.server.tables.vault_passkeys
  const dataKey = await unwrapDataKey(row.wrapped as Sealed, await wrappingKeyFromPrf(SECRET.slice().buffer), {
    aad: passkeyAad(setup.faceId.userId, setup.device.credentialId()),
  })
  expect(dataKey.extractable).toBe(false)
  expect((await loadDocuments(setup.client, dataKey, 'profile')).documents.map((d) => d.id)).toEqual([documentId])
}

// A query string leaves percent-encoded: it is read decoded too.
function decoded(path: string): string {
  try {
    return decodeURIComponent(path)
  } catch {
    return path
  }
}

// The forms of the secret found in what was sent, one line per request and
// form. Each path, header value and body is read as the raw text that left the
// device: serialised again, the quotes of a body would be escaped, and the
// bytes as JSON writes them could never be seen.
function secretsIn(requests: RecordedRequest[]): string[] {
  return requests.flatMap((request) => {
    const sent = [request.path, decoded(request.path), ...Object.values(request.headers), request.body ?? '']
    return SECRET_FORMS.filter(({ text }) => sent.some((part) => part.includes(text))).map(
      ({ name }) => `${request.method} ${request.path.split('?')[0]}: ${name}`,
    )
  })
}

function expectNoSecretSent(server: FakeSupabase) {
  expect(secretsIn(server.recorded)).toEqual([])
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// A scan that cannot see a form proves nothing about it: each one is found
// wherever a request can carry it.
describe('the secret scan', () => {
  const request = (part: Partial<RecordedRequest>): RecordedRequest => ({
    method: 'POST',
    path: '/auth/v1/somewhere',
    headers: { 'content-type': 'application/json' },
    body: null,
    status: 200,
    ...part,
  })

  test.each(SECRET_FORMS.map((form) => [form.name, form] as const))('finds the secret sent as %s', (_, form) => {
    const asText = typeof form.sent === 'string' ? form.sent : JSON.stringify(form.sent)
    // The fake records a URL's path and query as they leave: percent-encoded.
    const url = new URL('http://x/auth/v1/somewhere')
    url.searchParams.set('leak', asText)
    const carriers = {
      body: request({ body: JSON.stringify({ credential: { leak: form.sent } }) }),
      header: request({ headers: { 'x-leak': asText } }),
      query: request({ path: url.pathname + url.search }),
    }
    for (const [where, carrier] of Object.entries(carriers)) {
      // Not alone, for base64: this secret's base64url is its base64 without the padding.
      expect(secretsIn([carrier]), `in the ${where}`).toContain(`POST /auth/v1/somewhere: ${form.name}`)
    }
  })

  test('finds nothing in a request that does not carry it', () => {
    expect(secretsIn([request({ body: JSON.stringify({ credential: { clientExtensionResults: {} } }) })])).toEqual([])
  })
})

describe('prepareFaceId', () => {
  test('starts a registration with Supabase, and asks the passkey for stefin’s secret', async () => {
    const server = fakeSupabase()
    const { client, faceId } = await signedIn(server)
    const mark = server.recorded.length

    const before = { monotonic: performance.now(), wall: Date.now() }
    const prepared = await prepareFaceId(client)

    expect(server.recorded.slice(mark).map((r) => `${r.method} ${r.path}`)).toEqual([
      'POST /auth/v1/passkeys/registration/options',
    ])
    expect(prepared.challengeId).toEqual(expect.any(String))
    // When it was asked for, on both of the device's clocks.
    expect(prepared.preparedAt.monotonic).toBeGreaterThanOrEqual(before.monotonic)
    expect(prepared.preparedAt.monotonic).toBeLessThanOrEqual(performance.now())
    expect(prepared.preparedAt.wall).toBeGreaterThanOrEqual(before.wall)
    expect(prepared.preparedAt.wall).toBeLessThanOrEqual(Date.now())
    const { options } = prepared
    expect(bytes(options.challenge)).toHaveLength(32)
    expect(options.rp).toEqual(FAKE_RP)
    expect(Buffer.from(bytes(options.user.id)).toString()).toBe(faceId.userId)
    expect(options.user).toMatchObject({ name: EMAIL, displayName: EMAIL })
    expect(options.pubKeyCredParams).toEqual([
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ])
    // The server asked for less: a discoverable passkey that checks the person is required here,
    // also in the older form some browsers still read.
    expect(options.authenticatorSelection).toEqual({
      residentKey: 'required',
      requireResidentKey: true,
      userVerification: 'required',
    })
    expect(sameBytes(options.extensions?.prf?.eval?.first, prfSalt())).toBe(true)
    // Whether the passkey is discoverable, and the secret: nothing else.
    expect(options.extensions).toEqual({ credProps: true, prf: { eval: { first: prfSalt() } } })
  })

  test('takes none of the extensions the server asks for', async () => {
    const server = fakeSupabase()
    const { client } = await signedIn(server)
    server.offerExtensions(SERVER_EXTENSIONS)

    const { options } = await prepareFaceId(client)

    expect(options.extensions).toEqual({ credProps: true, prf: { eval: { first: prfSalt() } } })
  })

  test('without a session there is nothing to register', async () => {
    const server = fakeSupabase()
    await expect(prepareFaceId(server.client())).rejects.toThrow()
    expect(server.recorded).toEqual([])
  })
})

describe('activateFaceId', () => {
  test('the screen always says how the second tap resolves', () => {
    // Checked by tsc. Left out, a passkey that gives the secret only when
    // opened would be opened with no tap to start it, which Safari can refuse.
    expectTypeOf<Parameters<typeof activateFaceId>[2]['confirm']>().toEqualTypeOf<() => Promise<void>>()
  })

  test('a passkey that gives the secret at creation becomes the vault’s third lock', async () => {
    const setup = await offered({ atCreation: 'secret' })
    const { server, faceId, device, prepared } = setup
    const keyBefore = await setup.keys.get(faceId.userId)
    const documentId = await saveDocument(setup.client, keyBefore!, { kind: 'profile', value: { name: 'Alix' } })
    setup.timeline.length = 0

    expect(await setup.activate()).toEqual({ status: 'active' })

    expect(device.created).toEqual([prepared.options])
    expect(setup.timeline).toEqual(['create', ...ACTIVATION])
    // The secret came with the creation: no second tap was asked for.
    expect(setup.confirm).not.toHaveBeenCalled()

    const verify = server.recorded.find((r) => r.path === '/auth/v1/passkeys/registration/verify')!
    const sent = JSON.parse(verify.body!)
    expect(sent.challenge_id).toBe(prepared.challengeId)
    expect(sent.credential).toMatchObject({ id: device.credentialId(), rawId: device.credentialId(), type: 'public-key' })
    // Whether the passkey is discoverable, and nothing else.
    expect(sent.credential.clientExtensionResults).toEqual({ credProps: { rk: true } })

    const [passkey] = server.authPasskeys
    const insert = server.recorded.find((r) => r.method === 'POST' && r.path.startsWith('/rest/v1/vault_passkeys'))!
    expect(JSON.parse(insert.body!)).toEqual({
      user_id: faceId.userId,
      credential_id: device.credentialId(),
      passkey_id: passkey.id,
      wrapped: { iv: expect.any(String), ciphertext: expect.any(String) },
    })
    await expectPacketOpens(setup, documentId)

    // « Face ID activé ici », naming the passkey this device now uses.
    expect(setup.storage.getItem(MARKER)).toBe(`1:${device.credentialId()}`)
    // The key kept on the device is the one the sign-in put there, untouched.
    expect(await setup.keys.get(faceId.userId)).toBe(keyBefore)

    // The trap is real: what the browser serialises carries the secret...
    expect(JSON.stringify(device.credentials[0].toJSON())).toContain(base64Url(SECRET))
    // ...and none of it left the device.
    expectNoSecretSent(server)
  })

  // The server's options could ask for an extension whose answer is the
  // secret under another name (hmacGetSecret answers a salt as PRF does):
  // stefin asks for its own extensions, and none of the server's.
  test('the passkey is asked for stefin’s extensions only, whatever the server asks for', async () => {
    const setup = await offered({ atCreation: 'secret' }, SERVER_EXTENSIONS)

    expect(await setup.activate()).toEqual({ status: 'active' })

    expect(setup.device.created).toHaveLength(1)
    expect(setup.device.created[0].extensions).toEqual({ credProps: true, prf: { eval: { first: prfSalt() } } })
    expectNoSecretSent(setup.server)
  })

  test('the local opening asks for stefin’s secret only, whatever the server asked for', async () => {
    const setup = await offered({ atCreation: 'enabled' }, SERVER_EXTENSIONS)

    expect(await setup.activate()).toEqual({ status: 'active' })

    expect(setup.device.asked).toHaveLength(1)
    expect(setup.device.asked[0].extensions).toEqual({ prf: { eval: { first: prfSalt() } } })
  })

  // Only what is known to carry no secret goes back: a result under any other
  // name stays on the device, whatever the name.
  test.each<[string, Elsewhere]>([
    ['hmacGetSecret.output1', 'hmacGetSecret'],
    ['a name nobody knows', 'foo'],
  ])('a passkey that also answers the secret under %s: nothing of it is sent', async (_, elsewhere) => {
    const setup = await offered({ atCreation: 'secret', elsewhere })

    expect(await setup.activate()).toEqual({ status: 'active' })

    // The trap is set: what the browser serialises carries the secret under that name...
    const results = (setup.device.credentials[0].toJSON() as { clientExtensionResults: Record<string, unknown> })
      .clientExtensionResults
    expect(JSON.stringify(results[elsewhere])).toContain(base64Url(SECRET))
    // ...and none of it left the device.
    const verify = setup.server.recorded.find((r) => r.path === '/auth/v1/passkeys/registration/verify')!
    expect(JSON.parse(verify.body!).credential.clientExtensionResults).toEqual({ credProps: { rk: true } })
    expectNoSecretSent(setup.server)
  })

  test('a passkey that gives the secret only when opened: once confirmed, the same lock', async () => {
    const setup = await offered({ atCreation: 'enabled' })
    const { server, device } = setup
    const documentId = await saveDocument(setup.client, (await setup.keys.get(setup.faceId.userId))!, {
      kind: 'profile',
      value: { name: 'Alix' },
    })
    setup.timeline.length = 0
    // The screen's second button: it resolves a moment later, on the person's tap.
    const confirm = () =>
      new Promise<void>((resolve) =>
        setTimeout(() => {
          setup.timeline.push('confirmed')
          resolve()
        }, 10),
      )

    expect(await setup.activate({ confirm })).toEqual({ status: 'active' })

    expect(setup.timeline).toEqual(['create', 'confirmed', 'get', ...ACTIVATION])
    const [opening] = device.asked
    // A local opening, limited to this passkey, on a challenge drawn here.
    expect(bytes(opening.challenge)).toHaveLength(32)
    expect(sameBytes(opening.challenge, bytes(setup.prepared.options.challenge))).toBe(false)
    expect(opening.allowCredentials).toHaveLength(1)
    expect(opening.allowCredentials![0].type).toBe('public-key')
    expect(base64Url(bytes(opening.allowCredentials![0].id))).toBe(device.credentialId())
    expect(opening.rpId).toBe(FAKE_RP.id)
    expect(opening.userVerification).toBe('required')
    expect(sameBytes(opening.extensions?.prf?.eval?.first, prfSalt())).toBe(true)

    await expectPacketOpens(setup, documentId)
    expect(setup.storage.getItem(MARKER)).toBe(`1:${device.credentialId()}`)
    expectNoSecretSent(server)
  })

  test.each([
    ['says it cannot give the secret', 'disabled' as const],
    ['says nothing of it', 'silent' as const],
  ])('a passkey that %s: nothing is sent, nothing is kept', async (_, atCreation) => {
    const setup = await offered({ atCreation })
    const confirm = vi.fn()
    setup.timeline.length = 0

    expect(await setup.activate({ confirm })).toEqual({ status: 'no-prf' })

    expect(setup.timeline).toEqual(['create'])
    expect(confirm).not.toHaveBeenCalled()
    expect(setup.server.recorded.slice(setup.mark)).toEqual([])
    expect(setup.server.tables.vault_passkeys).toEqual([])
    expect(setup.server.authPasskeys).toEqual([])
    expect(setup.storage.getItem(MARKER)).toBeNull()
  })

  test('a passkey that promised the secret but gives none when opened: same as no secret', async () => {
    const setup = await offered({ atCreation: 'enabled', secretOnGet: false })
    setup.timeline.length = 0

    expect(await setup.activate({ confirm: async () => {} })).toEqual({ status: 'no-prf' })

    expect(setup.timeline).toEqual(['create', 'get'])
    expect(setup.server.recorded.slice(setup.mark)).toEqual([])
    expect(setup.storage.getItem(MARKER)).toBeNull()
  })

  test('another passkey answering the opening is refused before anything is sent', async () => {
    const setup = await offered({ atCreation: 'enabled', anotherAnswers: true })

    await expect(setup.activate({ confirm: async () => {} })).rejects.toThrow()

    expect(setup.server.recorded.slice(setup.mark)).toEqual([])
    expect(setup.storage.getItem(MARKER)).toBeNull()
  })

  test('a keychain that already holds this account’s passkey: Face ID is ready, nothing is sent', async () => {
    const setup = await offered({ atCreation: 'secret' })
    expect(await setup.activate()).toEqual({ status: 'active' })
    const firstCredential = setup.device.credentialId()
    // Safari wiped the site's data after a week away: the marker went, the passkey stayed.
    setup.storage.clear()
    const again = await prepareFaceId(setup.client)
    const mark = setup.server.recorded.length
    setup.timeline.length = 0

    const result = await activateFaceId(setup.client, setup.device.webauthn, {
      prepared: again,
      keyEncryptionKey: setup.faceId.keyEncryptionKey,
      userId: setup.faceId.userId,
      confirm: setup.confirm,
    })

    expect(result).toEqual({ status: 'already' })
    expect(setup.device.created[1].excludeCredentials!.map((c) => base64Url(bytes(c.id)))).toEqual([firstCredential])
    expect(setup.timeline).toEqual(['create', `marker ${MARKER}`])
    expect(setup.server.recorded.slice(mark)).toEqual([])
    expect(setup.server.tables.vault_passkeys).toHaveLength(1)
    expect(setup.storage.getItem(MARKER)).toBe('1')
  })

  test('a keychain that already holds it, on a device that knows which: the name is kept', async () => {
    const setup = await offered({ atCreation: 'secret' })
    expect(await setup.activate()).toEqual({ status: 'active' })
    const named = `1:${setup.device.credentialId()}`
    const again = await prepareFaceId(setup.client)

    const result = await activateFaceId(setup.client, setup.device.webauthn, {
      prepared: again,
      keyEncryptionKey: setup.faceId.keyEncryptionKey,
      userId: setup.faceId.userId,
      confirm: setup.confirm,
    })

    expect(result).toEqual({ status: 'already' })
    expect(setup.storage.getItem(MARKER)).toBe(named)
  })

  test('a cancelled prompt is passed on, and nothing is sent or kept', async () => {
    const cancelled = new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')
    const setup = await offered({ atCreation: 'secret', refuse: cancelled })

    await expect(setup.activate()).rejects.toBe(cancelled)

    expect(setup.server.recorded.slice(setup.mark)).toEqual([])
    expect(setup.storage.getItem(MARKER)).toBeNull()
  })

  test('a registration Supabase refuses writes no packet and sets no marker', async () => {
    const setup = await offered({ atCreation: 'secret' })

    await expect(
      activateFaceId(setup.client, setup.device.webauthn, {
        prepared: { ...setup.prepared, challengeId: 'a-challenge-that-expired' },
        keyEncryptionKey: setup.faceId.keyEncryptionKey,
        userId: setup.faceId.userId,
        confirm: setup.confirm,
      }),
    ).rejects.toThrow()

    expect(setup.server.tables.vault_passkeys).toEqual([])
    expect(setup.server.recorded.some((r) => r.path.startsWith('/rest/v1/vault_passkeys'))).toBe(false)
    expect(setup.storage.getItem(MARKER)).toBeNull()
  })

  test('a packet that cannot be written takes the new passkey back off Supabase', async () => {
    const setup = await offered({ atCreation: 'secret' })
    let registered: string | null = null
    setup.server.beforeEachRequest((request) => {
      setup.note(request)
      if (request.method === 'POST' && request.path.startsWith('/rest/v1/vault_passkeys')) {
        registered = setup.server.authPasskeys[0].id
        throw new Error('offline')
      }
    })
    setup.timeline.length = 0

    await expect(setup.activate()).rejects.toThrow(/offline/)

    expect(registered).toEqual(expect.any(String))
    expect(setup.timeline).toEqual([
      'create',
      'GET /rest/v1/vaults',
      'POST /auth/v1/passkeys/registration/verify',
      'POST /rest/v1/vault_passkeys',
      `DELETE /auth/v1/passkeys/${registered}`,
    ])
    expect(setup.server.authPasskeys).toEqual([])
    expect(setup.server.tables.vault_passkeys).toEqual([])
    expect(setup.storage.getItem(MARKER)).toBeNull()
  })

  test('when taking it back fails too, the packet’s failure is the one reported', async () => {
    const setup = await offered({ atCreation: 'secret' })
    const logged = vi.spyOn(console, 'error').mockImplementation(() => {})
    setup.server.beforeEachRequest((request) => {
      if (request.method === 'POST' && request.path.startsWith('/rest/v1/vault_passkeys')) throw new Error('offline')
      if (request.method === 'DELETE' && request.path.startsWith('/auth/v1/passkeys/')) throw new Error('still offline')
    })

    const failure = await setup.activate().then(
      () => null,
      (error: unknown) => error,
    )

    expect((failure as Error).message).toMatch(/offline/)
    expect((failure as Error).message).not.toMatch(/still offline/)
    expect(setup.server.recorded.some((r) => r.method === 'DELETE')).toBe(true)
    expect(logged).toHaveBeenCalled()
    expect(setup.storage.getItem(MARKER)).toBeNull()
  })
})

describe('prepareFaceIdSignIn', () => {
  test('starts a sign-in with Supabase, without a session, and asks the passkey for stefin’s secret', async () => {
    const server = fakeSupabase()

    const before = { monotonic: performance.now(), wall: Date.now() }
    const prepared = await prepareFaceIdSignIn(server.client())

    expect(server.recorded.map((r) => `${r.method} ${r.path}`)).toEqual(['POST /auth/v1/passkeys/authentication/options'])
    expect(prepared.challengeId).toEqual(expect.any(String))
    // When it was asked for, on both of the device's clocks.
    expect(prepared.preparedAt.monotonic).toBeGreaterThanOrEqual(before.monotonic)
    expect(prepared.preparedAt.monotonic).toBeLessThanOrEqual(performance.now())
    expect(prepared.preparedAt.wall).toBeGreaterThanOrEqual(before.wall)
    expect(prepared.preparedAt.wall).toBeLessThanOrEqual(Date.now())
    const { options } = prepared
    expect(bytes(options.challenge)).toHaveLength(32)
    expect(options.rpId).toBe(FAKE_RP.id)
    expect(options.timeout).toBe(300000)
    // No account is named: the device offers the passkey it holds for the site.
    expect(options.allowCredentials).toBeUndefined()
    // The server asked for less: checking the person is required here.
    expect(options.userVerification).toBe('required')
    expect(sameBytes(options.extensions?.prf?.eval?.first, prfSalt())).toBe(true)
    expect(options.extensions).toEqual({ prf: { eval: { first: prfSalt() } } })
  })

  test('takes none of the extensions the server asks for', async () => {
    const server = fakeSupabase()
    server.offerExtensions(SERVER_EXTENSIONS)

    const { options } = await prepareFaceIdSignIn(server.client())

    expect(options.extensions).toEqual({ prf: { eval: { first: prfSalt() } } })
  })

  test('a refusal of Supabase is passed on', async () => {
    const server = fakeSupabase()
    server.beforeEachRequest(() => {
      throw new Error('offline')
    })

    await expect(prepareFaceIdSignIn(server.client())).rejects.toThrow()
  })
})

describe('signInWithFaceId', () => {
  test('one tap opens the session and the vault, and the secret stays on the device', async () => {
    const ready = await returning()
    // Whatever another account left on this device goes first.
    await ready.keys.set('someone-else', await generateDataKey())

    const tapped = ready.signIn()
    // The opening is the first thing the tap does: nothing is awaited before it.
    expect(ready.device.asked).toEqual([ready.prepared.options])
    await tapped

    expect(ready.timeline).toEqual([...OPENED, `marker ${MARKER}`])

    const verify = ready.server.recorded.find((r) => r.path === '/auth/v1/passkeys/authentication/verify')!
    const sent = JSON.parse(verify.body!)
    expect(sent.challenge_id).toBe(ready.prepared.challengeId)
    expect(sent.credential).toMatchObject({
      id: ready.device.credentialId(),
      rawId: ready.device.credentialId(),
      type: 'public-key',
    })
    expect(sent.credential.clientExtensionResults).toEqual({})

    // The packet read is this person's, for the passkey just used.
    const read = ready.server.recorded.find((r) => r.method === 'GET' && r.path.startsWith('/rest/v1/vault_passkeys'))!
    const query = new URL(read.path, 'http://x').searchParams
    expect(query.get('user_id')).toBe(`eq.${ready.userId}`)
    expect(query.get('credential_id')).toBe(`eq.${ready.device.credentialId()}`)

    expect((await ready.client.auth.getSession()).data.session?.user.id).toBe(ready.userId)
    // The data key the password opens, kept as after a password, and never readable.
    const key = await ready.keys.get(ready.userId)
    expect(key!.extractable).toBe(false)
    expect((await loadDocuments(ready.client, key!, 'profile')).documents.map((d) => d.id)).toEqual([ready.documentId])
    expect(await ready.keys.get('someone-else')).toBeNull()
    // The passkey that just signed in is the one this device uses.
    expect(ready.storage.getItem(MARKER)).toBe(`1:${ready.device.credentialId()}`)

    // The trap is real at sign-in too: what the browser serialises carries the secret...
    expect(JSON.stringify(ready.device.opened.at(-1)!.toJSON())).toContain(base64Url(SECRET))
    // ...and none of it left the device.
    expectNoSecretSent(ready.server)
  })

  test('the passkey is asked for stefin’s secret only, whatever the server asks for', async () => {
    const ready = await returning(SERVER_EXTENSIONS)

    await ready.signIn()

    expect(ready.device.asked.at(-1)!.extensions).toEqual({ prf: { eval: { first: prfSalt() } } })
    expectNoSecretSent(ready.server)
  })

  test.each<[string, Elsewhere]>([
    ['hmacGetSecret.output1', 'hmacGetSecret'],
    ['a name nobody knows', 'foo'],
  ])('a passkey that also answers the secret under %s: nothing of it is sent', async (_, elsewhere) => {
    const ready = await returning()
    ready.device.behaviour.elsewhere = elsewhere

    await ready.signIn()

    const results = (ready.device.opened.at(-1)!.toJSON() as { clientExtensionResults: Record<string, unknown> })
      .clientExtensionResults
    expect(JSON.stringify(results[elsewhere])).toContain(base64Url(SECRET))
    const verify = ready.server.recorded.find((r) => r.path === '/auth/v1/passkeys/authentication/verify')!
    expect(JSON.parse(verify.body!).credential.clientExtensionResults).toEqual({})
    expectNoSecretSent(ready.server)
  })

  // Whoever signs in next, in this tab, never sees the screens of the one before.
  test('the tap forgets what the tab remembered between screens, first', async () => {
    const ready = await returning()
    const model: Model = {
      profile: null,
      snapshots: [],
      goals: [],
      settings: null,
      draft: null,
      unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
    }
    rememberVault({ userId: 'someone-else', dataKey: await generateDataKey() }, vaultMark())
    rememberModel({ userId: 'someone-else', model, client: ready.client }, modelMark())

    const tapped = ready.signIn()
    expect(rememberedVault()).toBeNull()
    expect(rememberedModel('someone-else')).toBeNull()
    await tapped
  })

  test('a passkey whose packet is gone: the session is closed, no key is kept, and the offer can come back', async () => {
    const ready = await returning()
    ready.server.tables.vault_passkeys.length = 0
    await ready.keys.set('someone-else', await generateDataKey())
    markedHere(ready)

    await expect(ready.signIn()).rejects.toBeInstanceOf(FaceIdNoLongerOpensError)

    expect(ready.timeline).toEqual([...OPENED, 'POST /auth/v1/logout'])
    // The marker went with it: the next password sign-in offers Face ID again.
    await expectNothingKept(ready)
    // Closing the session forgets every key on the device, as signing out does.
    expect(await ready.keys.get('someone-else')).toBeNull()
    expectNoSecretSent(ready.server)
  })

  test.each<[string, (userId: string, credentialId: string) => Uint8Array<ArrayBuffer>]>([
    ['another passkey', (userId) => passkeyAad(userId, base64Url(crypto.getRandomValues(new Uint8Array(16))))],
    ['another person', (_, credentialId) => passkeyAad(crypto.randomUUID(), credentialId)],
  ])('a packet sealed for %s does not open: the session is closed and no key is kept', async (_, boundTo) => {
    const ready = await returning()
    // The right data key and the right secret: only what the packet is bound to differs.
    const dataKey = await unwrapDataKey(ready.server.tables.vaults[0].wrapped_by_password as Sealed, ready.keyEncryptionKey, {
      extractable: true,
    })
    const [row] = ready.server.tables.vault_passkeys
    row.wrapped = await wrapDataKey(
      dataKey,
      await wrappingKeyFromPrf(SECRET.slice().buffer),
      boundTo(ready.userId, ready.device.credentialId()),
    )
    markedHere(ready)

    await expect(ready.signIn()).rejects.toBeInstanceOf(FaceIdNoLongerOpensError)

    expect(ready.timeline).toEqual([...OPENED, 'POST /auth/v1/logout'])
    await expectNothingKept(ready)
  })

  // Supabase no longer knows the passkey: removed from another device, by a
  // start-over, or never saved. Its refusal is final, and no session opened.
  test('a passkey Supabase no longer knows: Face ID no longer opens here, and the offer can come back', async () => {
    const ready = await returning()
    const { error } = await ready.passwordClient.auth.passkey.delete({ passkeyId: ready.server.authPasskeys[0].id })
    expect(error).toBeNull()
    markedHere(ready)

    const failure = await ready.signIn().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(FaceIdNoLongerOpensError)
    expect(ready.server.recorded.at(-1)!.status).toBe(400)
    // Nothing to close: the session never opened.
    expect(ready.timeline).toEqual(['get', 'POST /auth/v1/passkeys/authentication/verify'])
    await expectNothingKept(ready)
    expectNoSecretSent(ready.server)
  })

  test.each([
    ['400', 400, 'webauthn_verification_failed'],
    ['404', 404, 'passkey_not_found'],
  ])('a refusal of Supabase with a %s: Face ID no longer opens here, and the offer can come back', async (_, status, code) => {
    const ready = await returning()
    ready.server.refuseNextPasskeySignIn(status, code)
    markedHere(ready)

    const failure = await ready.signIn().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(FaceIdNoLongerOpensError)
    expect(((failure as Error).cause as { status?: number }).status).toBe(status)
    expect(ready.timeline).toEqual(['get', 'POST /auth/v1/passkeys/authentication/verify'])
    await expectNothingKept(ready)
  })

  // Too many tries, or a challenge that ran out: the passkey is fine, and
  // the next tap gets a fresh challenge. Nothing changes on the device.
  test.each([
    ['too many tries (429)', 429, 'over_request_rate_limit'],
    ['a challenge that ran out', 400, 'webauthn_challenge_expired'],
  ])('a refusal for %s is passed on as it is, and the marker stays', async (_, status, code) => {
    const ready = await returning()
    ready.server.refuseNextPasskeySignIn(status, code)
    markedHere(ready)

    const failure = await ready.signIn().catch((error: unknown) => error)

    expect(failure).not.toBeInstanceOf(FaceIdNoLongerOpensError)
    expect(failure).toMatchObject({ status, code })
    expect(ready.timeline).toEqual(['get', 'POST /auth/v1/passkeys/authentication/verify'])
    expect((await ready.client.auth.getSession()).data.session).toBeNull()
    expect(await ready.keys.get(ready.userId)).toBeNull()
    expect(ready.storage.getItem(MARKER)).toBe('1')
  })

  test('a cancelled prompt: nothing is sent, nothing changes', async () => {
    const ready = await returning()
    const cancelled = new DOMException('The operation either timed out or was not allowed.', 'NotAllowedError')
    ready.device.behaviour.refuseOpening = cancelled

    const failure = await ready.signIn().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(FaceIdCancelledError)
    expect((failure as Error).cause).toBe(cancelled)
    expect(ready.timeline).toEqual(['get'])
    expect(ready.server.recorded.slice(ready.mark)).toEqual([])
    await expectNothingKept(ready)
  })

  test('any other refusal of the browser is passed on as it is', async () => {
    const ready = await returning()
    const refused = new DOMException('The relying party is not allowed here', 'SecurityError')
    ready.device.behaviour.refuseOpening = refused

    await expect(ready.signIn()).rejects.toBe(refused)

    expect(ready.server.recorded.slice(ready.mark)).toEqual([])
  })

  test('a passkey that gives no secret is refused before Supabase is asked anything', async () => {
    const ready = await returning()
    ready.device.behaviour.secretOnGet = false

    await expect(ready.signIn()).rejects.toBeInstanceOf(FaceIdUnavailableError)

    expect(ready.timeline).toEqual(['get'])
    expect(ready.server.recorded.slice(ready.mark)).toEqual([])
    await expectNothingKept(ready)
  })

  // Not the passkey's doing: nothing says it no longer opens the vault.
  test('a sign-in Supabase fails to answer opens nothing, keeps nothing, and leaves the marker', async () => {
    const ready = await returning()
    ready.server.refuseNextPasskeySignIn(500, 'unexpected_failure')
    markedHere(ready)

    const failure = await ready.signIn().catch((error: unknown) => error)

    expect(failure).toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(FaceIdNoLongerOpensError)
    expect(ready.timeline).toEqual(['get', 'POST /auth/v1/passkeys/authentication/verify'])
    expect((await ready.client.auth.getSession()).data.session).toBeNull()
    expect(await ready.keys.get(ready.userId)).toBeNull()
    expect(ready.storage.getItem(MARKER)).toBe('1')
    expectNoSecretSent(ready.server)
  })

  test('a packet that cannot be read: the session is closed, and the failure is passed on', async () => {
    const ready = await returning()
    ready.server.failPasskeyRowRead()

    const failure = await ready.signIn().catch((error: unknown) => error)

    expect((failure as Error).message).toMatch(/read refused/)
    expect(failure).not.toBeInstanceOf(FaceIdNoLongerOpensError)
    expect(ready.timeline).toEqual([...OPENED, 'POST /auth/v1/logout'])
    await expectNothingKept(ready)
  })

  test('a key the device cannot keep: the session is closed, and the failure is passed on', async () => {
    const ready = await returning()
    vi.spyOn(ready.keys, 'set').mockRejectedValueOnce(new Error('The IndexedDB connection was lost'))

    await expect(ready.signIn()).rejects.toThrow(/IndexedDB/)

    expect(ready.timeline).toEqual([...OPENED, 'POST /auth/v1/logout'])
    await expectNothingKept(ready)
  })
})

// A prepared challenge is trusted for 4 minutes from the moment it was asked
// for: a screen checks it at the tap, and prepares a fresh one rather than send
// one likely refused. Both of the device's clocks count the 4 minutes, and the
// first to reach them wins: the monotonic one cannot be set, but may stop
// while an iPhone sleeps; the wall clock goes on while it sleeps, but can be
// set anywhere. Only their deltas are read, never against the server's clock.
describe('hasExpired', () => {
  const MINUTE = 60_000
  const AT = { monotonic: 1_000, wall: Date.UTC(2026, 10, 7, 12) }
  const after = (monotonic: number, wall: number) => ({ monotonic: AT.monotonic + monotonic, wall: AT.wall + wall })

  test('a challenge asked for less than 4 minutes ago, on both clocks, is good', () => {
    expect(hasExpired({ preparedAt: AT }, after(0, 0))).toBe(false)
    expect(hasExpired({ preparedAt: AT }, after(4 * MINUTE - 1, 4 * MINUTE - 1))).toBe(false)
  })

  test('one asked for 4 minutes ago or more on the monotonic clock is not', () => {
    expect(hasExpired({ preparedAt: AT }, after(4 * MINUTE, 0))).toBe(true)
    expect(hasExpired({ preparedAt: AT }, after(10 * MINUTE, 0))).toBe(true)
  })

  test('nor one asked for 4 minutes ago or more on the wall clock', () => {
    expect(hasExpired({ preparedAt: AT }, after(0, 4 * MINUTE))).toBe(true)
    expect(hasExpired({ preparedAt: AT }, after(0, 10 * MINUTE))).toBe(true)
  })

  test('a device clock set far ahead does not make a fresh challenge expired', async () => {
    const realNow = Date.now.bind(Date)
    vi.spyOn(Date, 'now').mockImplementation(() => realNow() + 365 * 24 * 60 * MINUTE)
    const prepared = await prepareFaceIdSignIn(fakeSupabase().client())

    expect(hasExpired(prepared)).toBe(false)
  })

  test('after 4 minutes of the monotonic clock, a challenge has expired', async () => {
    const prepared = await prepareFaceIdSignIn(fakeSupabase().client())
    vi.spyOn(performance, 'now').mockReturnValue(prepared.preparedAt.monotonic + 4 * MINUTE)

    expect(hasExpired(prepared)).toBe(true)
  })

  // An iPhone locked: the monotonic clock may not move while it sleeps.
  test('a device that slept 5 minutes: the monotonic clock has not moved, the challenge has expired', async () => {
    const prepared = await prepareFaceIdSignIn(fakeSupabase().client())
    vi.spyOn(performance, 'now').mockReturnValue(prepared.preparedAt.monotonic)
    vi.spyOn(Date, 'now').mockReturnValue(prepared.preparedAt.wall + 5 * MINUTE)

    expect(hasExpired(prepared)).toBe(true)
  })
})

// Face ID active on this device, and a second key of the same account added
// earlier from another device: its packet in `vault_passkeys` and its passkey in Supabase.
async function twoKeys() {
  const setup = await offered({ atCreation: 'secret' })
  if ((await setup.activate()).status !== 'active') throw new Error('expected Face ID to be active')
  const here = setup.server.tables.vault_passkeys[0]
  const other = { id: crypto.randomUUID(), created_at: '2026-11-01T09:00:00.000Z' }
  setup.server.authPasskeys.push(other)
  setup.server.tables.vault_passkeys.push({
    user_id: setup.faceId.userId,
    credential_id: 'another-device-credential',
    passkey_id: other.id,
    wrapped: { iv: 'AAAAAAAAAAAAAAAA', ciphertext: 'AAAA' },
    created_at: other.created_at,
  })
  // A row of someone else, which must never be listed nor touched.
  setup.server.tables.vault_passkeys.push({
    user_id: crypto.randomUUID(),
    credential_id: 'someone-else-credential',
    passkey_id: crypto.randomUUID(),
    wrapped: { iv: 'BBBBBBBBBBBBBBBB', ciphertext: 'BBBB' },
    created_at: '2026-11-08T09:00:00.000Z',
  })
  setup.timeline.length = 0
  return { ...setup, here: here as { passkey_id: string; credential_id: string }, other, mark: setup.server.recorded.length }
}

describe('listFaceIdKeys', () => {
  test('the account’s keys, newest first, dated, with the one this device uses', async () => {
    const setup = await twoKeys()

    expect(await listFaceIdKeys(setup.client)).toEqual([
      { passkeyId: setup.here.passkey_id, addedOn: todayIso(), onThisDevice: true },
      { passkeyId: setup.other.id, addedOn: '2026-11-01', onThisDevice: false },
    ])

    const read = setup.server.recorded.slice(setup.mark).find((r) => r.path.startsWith('/rest/v1/vault_passkeys'))!
    const query = new URL(read.path, 'http://x').searchParams
    expect(query.get('user_id')).toBe(`eq.${setup.faceId.userId}`)
    // Never the packets: a list has no use for them.
    expect(query.get('select')).not.toContain('wrapped')
  })

  test('a device that does not know which key it uses marks none', async () => {
    const setup = await twoKeys()
    setup.storage.setItem(MARKER, '1')
    expect((await listFaceIdKeys(setup.client)).map((key) => key.onThisDevice)).toEqual([false, false])
  })

  test('a failure to read is passed on, not an empty list', async () => {
    const setup = await twoKeys()
    setup.server.failPasskeyRowRead()
    await expect(listFaceIdKeys(setup.client)).rejects.toThrow()
  })
})

describe('removeFaceIdKey', () => {
  test('first Supabase’s passkey, then its packet; the marker of this device stays', async () => {
    const setup = await twoKeys()

    await removeFaceIdKey(setup.client, setup.other.id)

    expect(setup.timeline.filter((step) => !step.startsWith('GET '))).toEqual([
      `DELETE /auth/v1/passkeys/${setup.other.id}`,
      'DELETE /rest/v1/vault_passkeys',
    ])
    const deleted = setup.server.recorded.slice(setup.mark).find((r) => r.method === 'DELETE' && r.path.startsWith('/rest/v1/'))!
    const query = new URL(deleted.path, 'http://x').searchParams
    expect(query.get('user_id')).toBe(`eq.${setup.faceId.userId}`)
    expect(query.get('passkey_id')).toBe(`eq.${setup.other.id}`)
    expect(setup.server.authPasskeys.map((p) => p.id)).toEqual([setup.here.passkey_id])
    expect(setup.server.tables.vault_passkeys.map((row) => row.passkey_id)).toEqual(
      expect.arrayContaining([setup.here.passkey_id]),
    )
    expect(setup.server.tables.vault_passkeys).toHaveLength(2)
    expect(setup.storage.getItem(MARKER)).toBe(`1:${setup.here.credential_id}`)
    expectNoSecretSent(setup.server)
  })

  // Review Focus 4.
  test('removing the key this device uses clears its marker, so the offer can come back', async () => {
    const setup = await twoKeys()

    await removeFaceIdKey(setup.client, setup.here.passkey_id)

    expect(setup.server.authPasskeys.map((p) => p.id)).toEqual([setup.other.id])
    expect(setup.server.tables.vault_passkeys.map((row) => row.credential_id).sort()).toEqual([
      'another-device-credential',
      'someone-else-credential',
    ])
    expect(setup.storage.getItem(MARKER)).toBeNull()
    expect((await listFaceIdKeys(setup.client)).map((key) => key.passkeyId)).toEqual([setup.other.id])
  })

  test('a passkey Supabase refuses to delete: the packet stays, and so does the marker', async () => {
    const setup = await twoKeys()
    setup.server.failPasskeyDelete(setup.here.passkey_id)

    await expect(removeFaceIdKey(setup.client, setup.here.passkey_id)).rejects.toThrow()

    expect(setup.timeline.filter((step) => !step.startsWith('GET '))).toEqual([`DELETE /auth/v1/passkeys/${setup.here.passkey_id}`])
    expect(setup.server.tables.vault_passkeys).toHaveLength(3)
    expect(setup.storage.getItem(MARKER)).toBe(`1:${setup.here.credential_id}`)
  })

  // A first attempt whose packet deletion failed, retried: Supabase no longer
  // knows the passkey, and the packet still goes.
  test('a passkey Supabase no longer knows: its packet is still removed', async () => {
    const setup = await twoKeys()
    setup.server.authPasskeys.splice(setup.server.authPasskeys.findIndex((p) => p.id === setup.other.id), 1)

    await removeFaceIdKey(setup.client, setup.other.id)

    expect(setup.server.tables.vault_passkeys.map((row) => row.passkey_id)).not.toContain(setup.other.id)
  })

  test('a packet that cannot be deleted is reported', async () => {
    const setup = await twoKeys()
    setup.server.failPasskeyRowDelete()

    await expect(removeFaceIdKey(setup.client, setup.here.passkey_id)).rejects.toThrow(/Face ID/)
    expect(setup.storage.getItem(MARKER)).toBe(`1:${setup.here.credential_id}`)
  })
})

// Before deleting the account: a fresh Face ID tap, by the person signed in.
// The passkey must open their packet, as at sign-in; the key already on the
// device is not touched.
describe('confirmWithFaceId', () => {
  async function confirming() {
    const setup = await offered({ atCreation: 'secret' })
    if ((await setup.activate()).status !== 'active') throw new Error('expected Face ID to be active')
    const prepared = await prepareFaceIdSignIn(setup.client)
    return {
      ...setup,
      prepared,
      confirm: (expected: string = setup.faceId.userId) =>
        confirmWithFaceId(setup.client, setup.device.webauthn, prepared, expected),
    }
  }

  // Safari can refuse a WebAuthn request that does not follow the tap at once: the passkey opens first.
  test('nothing is asked of the network before the passkey opens', async () => {
    const ready = await confirming()
    ready.timeline.length = 0
    await ready.confirm()
    expect(ready.timeline[0]).toBe('get')
  })

  test('the passkey of the person signed in confirms, and the key store is untouched', async () => {
    const ready = await confirming()
    const setting = vi.spyOn(ready.keys, 'set')
    const clearing = vi.spyOn(ready.keys, 'clear')
    const mark = ready.server.recorded.length

    await ready.confirm()

    expect(setting).not.toHaveBeenCalled()
    expect(clearing).not.toHaveBeenCalled()
    expect(await ready.keys.get(ready.faceId.userId)).toBeInstanceOf(CryptoKey)
    expect((await ready.client.auth.getSession()).data.session?.user.id).toBe(ready.faceId.userId)
    // The packet was opened, for this person and this passkey.
    const read = ready.server.recorded
      .slice(mark)
      .find((r) => r.method === 'GET' && r.path.startsWith('/rest/v1/vault_passkeys'))!
    expect(new URL(read.path, 'http://x').searchParams.get('user_id')).toBe(`eq.${ready.faceId.userId}`)
    expectNoSecretSent(ready.server)
  })

  test('a passkey of another account is refused, and its session closed', async () => {
    const ready = await confirming()
    const signingOut = vi.spyOn(ready.client.auth, 'signOut')
    const mark = ready.server.recorded.length

    // Signed in as someone else than the person whose passkey answers.
    await expect(ready.confirm('someone-else')).rejects.toBeInstanceOf(FaceIdOtherAccountError)
    expect(signingOut).toHaveBeenCalledWith({ scope: 'local' })
    // Nothing of that account was opened: its packet was never read.
    expect(ready.server.recorded.slice(mark).filter((r) => r.path.startsWith('/rest/v1/vault_passkeys'))).toEqual([])
    expect((await ready.client.auth.getSession()).data.session).toBeNull()
  })

  test('a closed prompt is a cancel, as at sign-in', async () => {
    const ready = await confirming()
    ready.device.behaviour.refuseOpening = new DOMException('The operation was cancelled', 'NotAllowedError')
    await expect(ready.confirm()).rejects.toBeInstanceOf(FaceIdCancelledError)
  })
})
