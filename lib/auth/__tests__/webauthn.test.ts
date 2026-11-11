import { afterEach, describe, expect, test, vi } from 'vitest'
import {
  browserWebAuthn,
  creationOptionsFromJSON,
  credentialId,
  credentialJSON,
  requestOptionsFromJSON,
  rpIdServesHost,
} from '../webauthn'

const bytesOf = (source: BufferSource | undefined) =>
  source === undefined
    ? undefined
    : [...(ArrayBuffer.isView(source) ? new Uint8Array(source.buffer, source.byteOffset, source.byteLength) : new Uint8Array(source))]

// Node's own encoder, not the one under test.
const toBase64Url = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64url')

const RAW_ID = new Uint8Array([0xfb, 0xff, 0xbf, 1, 2, 3])
const CHALLENGE = new Uint8Array([9, 8, 7, 6, 5, 4, 3, 2])

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('options from the server', () => {
  test('creation: the binary fields become bytes, the rest is kept as given, but not the extensions', () => {
    const options = creationOptionsFromJSON({
      rp: { id: 'stefin.test', name: 'PatriCube' },
      user: { id: toBase64Url(new TextEncoder().encode('user-1')), name: 'a@b.fr', displayName: 'a@b.fr' },
      challenge: toBase64Url(CHALLENGE),
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 300000,
      excludeCredentials: [{ type: 'public-key', id: toBase64Url(RAW_ID), transports: ['internal'] }],
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      attestation: 'none',
      extensions: { credProps: true },
    })

    expect(bytesOf(options.challenge)).toEqual([...CHALLENGE])
    expect(bytesOf(options.user.id)).toEqual([...new TextEncoder().encode('user-1')])
    expect(options.user).toMatchObject({ name: 'a@b.fr', displayName: 'a@b.fr' })
    expect(options.excludeCredentials).toHaveLength(1)
    expect(bytesOf(options.excludeCredentials![0].id)).toEqual([...RAW_ID])
    expect(options.excludeCredentials![0]).toMatchObject({ type: 'public-key', transports: ['internal'] })
    expect(options).toMatchObject({
      rp: { id: 'stefin.test', name: 'PatriCube' },
      pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
      timeout: 300000,
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      attestation: 'none',
    })
    // Whatever an extension answers goes back to the server: stefin chooses them, not the server.
    expect(options).not.toHaveProperty('extensions')
  })

  test('creation without credentials to exclude', () => {
    const options = creationOptionsFromJSON({
      rp: { name: 'PatriCube' },
      user: { id: 'AQ', name: 'a', displayName: 'a' },
      challenge: 'AQ',
      pubKeyCredParams: [],
    })
    expect(options.excludeCredentials).toBeUndefined()
  })

  test('request: the binary fields become bytes, the rest is kept as given, but not the extensions', () => {
    const options = requestOptionsFromJSON({
      challenge: toBase64Url(CHALLENGE),
      rpId: 'stefin.test',
      timeout: 60000,
      userVerification: 'preferred',
      allowCredentials: [{ type: 'public-key', id: toBase64Url(RAW_ID) }],
      extensions: { hmacGetSecret: { salt1: 'AQ' } } as AuthenticationExtensionsClientInputs,
    })

    expect(bytesOf(options.challenge)).toEqual([...CHALLENGE])
    expect(bytesOf(options.allowCredentials![0].id)).toEqual([...RAW_ID])
    expect(options).toMatchObject({ rpId: 'stefin.test', timeout: 60000, userVerification: 'preferred' })
    expect(options).not.toHaveProperty('extensions')
  })

  test('request without credentials to allow (a discoverable passkey)', () => {
    expect(requestOptionsFromJSON({ challenge: 'AQ' }).allowCredentials).toBeUndefined()
  })
})

describe('a credential for the server', () => {
  const clientDataJSON = new TextEncoder().encode('{"type":"webauthn.create"}')

  function credential(
    response: Record<string, ArrayBuffer | null>,
    toJSON?: () => unknown,
    results: Record<string, unknown> = { credProps: { rk: true } },
  ): PublicKeyCredential {
    return {
      id: toBase64Url(RAW_ID),
      rawId: RAW_ID.slice().buffer,
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response,
      getClientExtensionResults: () => results,
      ...(toJSON ? { toJSON } : {}),
    } as unknown as PublicKeyCredential
  }

  test('its id is the raw id in base64url', () => {
    expect(credentialId(credential({}))).toBe('-_-_AQID')
  })

  test('the browser’s own toJSON is used when there is one', () => {
    const own = { id: 'from-the-browser' }
    expect(credentialJSON(credential({}, () => own))).toBe(own)
  })

  test('without toJSON, a registration is written out in base64url', () => {
    const attestationObject = new Uint8Array([0xa3, 0x63, 0x66])
    expect(
      credentialJSON(credential({ clientDataJSON: clientDataJSON.buffer, attestationObject: attestationObject.buffer })),
    ).toEqual({
      id: '-_-_AQID',
      rawId: '-_-_AQID',
      type: 'public-key',
      authenticatorAttachment: 'platform',
      response: { clientDataJSON: toBase64Url(clientDataJSON), attestationObject: toBase64Url(attestationObject) },
      clientExtensionResults: { credProps: { rk: true } },
    })
  })

  // The same allowlist as for a browser's own toJSON: only whether the passkey
  // is discoverable, never a result that could carry the secret.
  test('without toJSON, only credProps is written out of the extension results', () => {
    const secret = new TextEncoder().encode('stefin-test-prf-secret-32-bytes!')
    const written = credentialJSON(
      credential({ clientDataJSON: clientDataJSON.buffer, attestationObject: new Uint8Array([1]).buffer }, undefined, {
        credProps: { rk: true },
        prf: { enabled: true, results: { first: secret.slice().buffer } },
        hmacGetSecret: { output1: secret.slice().buffer },
        foo: toBase64Url(secret),
      }),
    )

    expect(written.clientExtensionResults).toEqual({ credProps: { rk: true } })
    expect(JSON.stringify(written)).not.toContain(toBase64Url(secret))
  })

  test('without toJSON, an authentication is written out in base64url', () => {
    const authenticatorData = new Uint8Array([1, 1, 1])
    const signature = new Uint8Array([2, 2, 2])
    const userHandle = new Uint8Array([3, 3, 3])
    const response = {
      clientDataJSON: clientDataJSON.buffer,
      authenticatorData: authenticatorData.buffer,
      signature: signature.buffer,
    }

    expect(credentialJSON(credential({ ...response, userHandle: userHandle.buffer })).response).toEqual({
      clientDataJSON: toBase64Url(clientDataJSON),
      authenticatorData: toBase64Url(authenticatorData),
      signature: toBase64Url(signature),
      userHandle: toBase64Url(userHandle),
    })
    expect(credentialJSON(credential({ ...response, userHandle: null })).response).not.toHaveProperty('userHandle')
  })
})

describe('the browser', () => {
  test('cannot create a passkey without the WebAuthn API', async () => {
    // Node, like a server render, has no window at all.
    expect(await browserWebAuthn.supported()).toBe(false)
    vi.stubGlobal('window', {})
    expect(await browserWebAuthn.supported()).toBe(false)
  })

  test('can when a platform authenticator that checks the person is there', async () => {
    const available = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('window', { PublicKeyCredential: { isUserVerifyingPlatformAuthenticatorAvailable: available } })
    expect(await browserWebAuthn.supported()).toBe(true)

    available.mockResolvedValue(false)
    expect(await browserWebAuthn.supported()).toBe(false)

    available.mockRejectedValue(new Error('not allowed here'))
    expect(await browserWebAuthn.supported()).toBe(false)
  })

  test('create and get hand the options to navigator.credentials', async () => {
    const created = { id: 'created' }
    const got = { id: 'got' }
    const credentials = { create: vi.fn().mockResolvedValue(created), get: vi.fn().mockResolvedValue(got) }
    vi.stubGlobal('navigator', { credentials })
    const creation = { challenge: CHALLENGE } as unknown as PublicKeyCredentialCreationOptions
    const request = { challenge: CHALLENGE } as PublicKeyCredentialRequestOptions

    expect(await browserWebAuthn.create(creation)).toBe(created)
    expect(credentials.create).toHaveBeenCalledWith({ publicKey: creation })
    expect(await browserWebAuthn.get(request)).toBe(got)
    expect(credentials.get).toHaveBeenCalledWith({ publicKey: request })
  })

  test('a browser that answers with no credential is an error, not a passkey', async () => {
    vi.stubGlobal('navigator', {
      credentials: { create: vi.fn().mockResolvedValue(null), get: vi.fn().mockResolvedValue(null) },
    })
    await expect(browserWebAuthn.create({} as PublicKeyCredentialCreationOptions)).rejects.toThrow()
    await expect(browserWebAuthn.get({} as PublicKeyCredentialRequestOptions)).rejects.toThrow()
  })
})

// A passkey belongs to an address: the browser refuses it anywhere but on that
// address or one of its subdomains. A Vercel preview and localhost use the same
// Supabase project as the site, whose passkeys belong to oseil.fr (stefin.vercel.app
// until 10 November 2026: the old address now only redirects).
describe('where a passkey can work', () => {
  test.each([
    ['the site itself', 'oseil.fr', true],
    ['a subdomain of it', 'www.oseil.fr', true],
    ['the same address in capitals', 'Oseil.FR', true],
    ['the old address', 'stefin.vercel.app', false],
    ['a Vercel preview', 'stefin-git-feat-face-id-yogz.vercel.app', false],
    ['localhost', 'localhost', false],
    ['an address that only ends the same way', 'notoseil.fr', false],
    ['the parent domain', 'fr', false],
  ])('on %s: %s', (_, hostname, works) => {
    expect(rpIdServesHost('oseil.fr', hostname)).toBe(works)
  })

  test('options that name no address are for the page’s own', () => {
    expect(rpIdServesHost(undefined, 'localhost')).toBe(true)
  })
})
