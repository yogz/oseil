import { describe, expect, test } from 'vitest'
import { InvalidRecoveryKeyError } from '@/lib/vault/keys'
import { WrongPasswordError } from '@/lib/vault/store'
import { EmailNotConfirmedError, PasswordTooShortError, WrongCredentialsError } from '../account'
import { FaceIdCancelledError, FaceIdNoLongerOpensError, FaceIdUnavailableError } from '../face-id'
import {
  FACE_ID_NO_PRF,
  faceIdActivationFailed,
  faceIdAlready,
  faceIdLabel,
  faceIdNoLongerOpens,
  faceIdSignInErrorMessage,
  faceIdUnavailable,
  recoveryErrorMessage,
  signInErrorMessage,
  signUpFieldErrors,
  signUpErrorMessage,
} from '../messages'

const WRONG = 'Adresse e-mail ou mot de passe incorrect. Vérifie-les et réessaie.'

// Whether the server refused the secret or the vault refused the key, the
// person typed one wrong thing, and is told the same thing.
test.each([
  ['the server refuses the address or the secret', new WrongCredentialsError()],
  ['the vault refuses the key', new WrongPasswordError()],
])('says « %s » the same way', (_, error) => {
  expect(signInErrorMessage(error)).toBe(WRONG)
})

test('asks for the confirmation link when the address is not confirmed', () => {
  expect(signInErrorMessage(new EmailNotConfirmedError())).toBe(
    "Confirme d’abord ton adresse\u00A0: le lien t’attend dans ta boîte mail.",
  )
})

// A network failure is not a wrong password, and must not be told as one.
test('does not blame the password for anything else', () => {
  expect(signInErrorMessage(new Error('fetch failed'))).not.toBe(WRONG)
  expect(signInErrorMessage(new Error('fetch failed'))).toBeTruthy()
})

test('refuses a password under 10 characters, counted as a person sees them, and says how many are missing', () => {
  expect(signUpFieldErrors({ password: '123456789', confirmation: '123456789' })).toEqual({
    password: 'Trop court\u00A0: encore 1\u00A0caractère.',
  })
  expect(signUpFieldErrors({ password: 'court', confirmation: 'court' })).toEqual({
    password: 'Trop court\u00A0: encore 5\u00A0caractères.',
  })
  // Ten characters, eleven UTF-16 units: accepted.
  expect(signUpFieldErrors({ password: 'é'.normalize('NFD') + '123456789', confirmation: 'é'.normalize('NFD') + '123456789' })).toEqual({})
})

test('refuses a confirmation that differs', () => {
  expect(signUpFieldErrors({ password: '1234567890', confirmation: '1234567899' })).toEqual({
    confirmation: 'Les deux mots de passe sont différents.',
  })
  expect(signUpFieldErrors({ password: '1234567890', confirmation: '1234567890' })).toEqual({})
})

// Planche 2 of the account screens (Nicolas, 10 November 2026): both mistakes at once, not one per try.
test('says both mistakes at once', () => {
  expect(signUpFieldErrors({ password: 'court', confirmation: 'autre' })).toEqual({
    password: 'Trop court\u00A0: encore 5\u00A0caractères.',
    confirmation: 'Les deux mots de passe sont différents.',
  })
})

test('says the same about a short password whoever caught it', () => {
  expect(signUpErrorMessage(new PasswordTooShortError())).toBe('Au moins 10 caractères.')
  expect(signUpErrorMessage(new Error('rate limited'))).toBeTruthy()
})

test('tells a wrong recovery key apart from a failure that is nobody’s doing', () => {
  expect(recoveryErrorMessage(new InvalidRecoveryKeyError())).toBe(
    'Cette clé de secours ne correspond pas à ton compte. Vérifie chaque groupe\u00A0: majuscules, espaces et tirets ne comptent pas.',
  )
  expect(recoveryErrorMessage(new PasswordTooShortError())).toBe('Au moins 10 caractères.')
  expect(recoveryErrorMessage(new Error('fetch failed'))).toBe("La récupération n’a pas abouti. Réessaie dans un instant.")
})

// Word for word, typographic apostrophes included.
test('says what Face ID needs said in the words chosen for it', () => {
  expect(FACE_ID_NO_PRF).toBe(
    'Ton gestionnaire de mots de passe ne sait pas ouvrir le coffre. Sur iPhone, choisis l’app Mots de passe d’Apple quand il te le demande. Tu peux supprimer la clé d’accès qu’il vient de créer. Ta clé de secours, elle, ne change pas.',
  )
})

// The word of the device, as the buttons say it: « Face ID », « Touch ID » or
// « ton empreinte », which is feminine and takes a capital at the start. Word
// for word, typographic apostrophes included. The site's name is not decided
// yet: no sentence names it.
describe.each([
  {
    label: 'Face ID' as const,
    already: 'Face ID est déjà prêt sur cet appareil.',
    noLongerOpens: 'Face ID n’ouvre plus ton coffre sur cet appareil. Connecte-toi avec ton mot de passe.',
    unavailable:
      'Cette clé Face ID est rangée dans un gestionnaire qui ne sait pas ouvrir le coffre. Choisis celle de l’app Mots de passe d’Apple, ou connecte-toi avec ton mot de passe.',
  },
  {
    label: 'Touch ID' as const,
    already: 'Touch ID est déjà prêt sur cet appareil.',
    noLongerOpens: 'Touch ID n’ouvre plus ton coffre sur cet appareil. Connecte-toi avec ton mot de passe.',
    unavailable:
      'Cette clé Touch ID est rangée dans un gestionnaire qui ne sait pas ouvrir le coffre. Choisis celle de l’app Mots de passe d’Apple, ou connecte-toi avec ton mot de passe.',
  },
  {
    label: 'Windows Hello' as const,
    already: 'Windows Hello est déjà prêt sur cet appareil.',
    noLongerOpens: 'Windows Hello n’ouvre plus ton coffre sur cet appareil. Connecte-toi avec ton mot de passe.',
    unavailable:
      'Cette clé Windows Hello est rangée dans un gestionnaire qui ne sait pas ouvrir le coffre. Choisis celle de l’app Mots de passe d’Apple, ou connecte-toi avec ton mot de passe.',
  },
  {
    label: 'ton empreinte' as const,
    already: 'Ton empreinte est déjà prête sur cet appareil.',
    noLongerOpens: 'Ton empreinte n’ouvre plus ton coffre sur cet appareil. Connecte-toi avec ton mot de passe.',
    unavailable:
      'Cette clé est rangée dans un gestionnaire qui ne sait pas ouvrir le coffre. Choisis celle de l’app Mots de passe d’Apple, ou connecte-toi avec ton mot de passe.',
  },
])('with « $label »', ({ label, already, noLongerOpens, unavailable }) => {
  test('Face ID is ready already', () => {
    expect(faceIdAlready(label)).toBe(already)
  })

  test('Face ID no longer opens the vault', () => {
    expect(faceIdNoLongerOpens(label)).toBe(noLongerOpens)
  })

  test('the passkey sits in a manager that gives no secret', () => {
    expect(faceIdUnavailable(label)).toBe(unavailable)
  })

  // A passkey that cannot open the vault sends the person to their password;
  // one kept in a manager that gives no secret says where the right one is; a
  // cancelled prompt is the person's own choice and is not answered; anything
  // else is not theirs to fix.
  test('a Face ID sign-in that fails says why, and a cancelled one says nothing', () => {
    expect(faceIdSignInErrorMessage(new FaceIdNoLongerOpensError(), label)).toBe(noLongerOpens)
    expect(faceIdSignInErrorMessage(new FaceIdUnavailableError(), label)).toBe(unavailable)
    expect(faceIdSignInErrorMessage(new FaceIdCancelledError(), label)).toBeNull()
    expect(faceIdSignInErrorMessage(new Error('fetch failed'), label)).toBe(signInErrorMessage(new Error('fetch failed')))
    expect(faceIdSignInErrorMessage(new Error('fetch failed'), label)).toBe(
      "La connexion n’a pas abouti. Réessaie dans un instant.",
    )
  })
})

// An activation that failed for any other reason is not the person's doing:
// the words are the ones the recovery key screen already uses, with the
// typographic apostrophe of the new sentences.
// Its only button is « Continuer »: it cannot say « réessaie » (planche 5 of the account screens).
test('an activation that fails says when it will be offered again, in the device’s own word', () => {
  expect(faceIdActivationFailed('Face ID')).toBe('Face ID n’a pas pu être activé. On te le reproposera à ta prochaine connexion.')
  expect(faceIdActivationFailed('ton empreinte')).toBe(
    'Ton empreinte n’a pas pu être activée. On te la reproposera à ta prochaine connexion.',
  )
})

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
const IPAD_MINI =
  'Mozilla/5.0 (iPad; CPU OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1'
// What Safari on an iPad sends by default: the same as a Mac's.
const MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15'
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36'
const WINDOWS = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'

// « Face ID » on iPhone and iPad, « Touch ID » on a Mac, « Windows Hello » on
// Windows, « ton empreinte » anywhere else, as the buttons say it: « Se
// connecter avec … ».
test.each([
  ['an iPhone', IPHONE, 0, 'Face ID'],
  ['an iPad that says so', IPAD_MINI, 5, 'Face ID'],
  ['an iPad that says it is a Mac, with a touch screen', MAC, 5, 'Face ID'],
  ['a Mac', MAC, 0, 'Touch ID'],
  ['an Android phone', ANDROID, 5, 'ton empreinte'],
  ['a Windows computer', WINDOWS, 0, 'Windows Hello'],
  ['a Windows tablet', WINDOWS, 10, 'Windows Hello'],
])('names what checks the person on %s', (_, userAgent, maxTouchPoints, label) => {
  expect(faceIdLabel({ userAgent, maxTouchPoints })).toBe(label)
})
