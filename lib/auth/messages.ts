// What the sign-in and sign-up screens say when something refuses. Kept apart
// from the screens so the mapping from an error to a sentence is tested, not
// read off a component.

import { InvalidRecoveryKeyError } from '@/lib/vault/keys'
import { MIN_PASSWORD_LENGTH, WrongPasswordError, PasswordTooShortError, assertPasswordLength } from '@/lib/vault/store'
import { EmailNotConfirmedError, WrongCredentialsError } from './account'
import { FaceIdCancelledError, FaceIdNoLongerOpensError, FaceIdUnavailableError } from './face-id'

// The words of the account screens were reviewed on planches with Nicolas on 10 November 2026: each
// error says what happened and what to do, and « clé » alone is kept for the recovery key.
export const WRONG_CREDENTIALS = 'Adresse e-mail ou mot de passe incorrect. Vérifie-les et réessaie.'
export const EMAIL_NOT_CONFIRMED = "Confirme d’abord ton adresse\u00A0: le lien t’attend dans ta boîte mail."
export const PASSWORD_TOO_SHORT = 'Au moins 10 caractères.'
export const PASSWORDS_DIFFER = 'Les deux mots de passe sont différents.'
export const WRONG_RECOVERY_KEY =
  'Cette clé de secours ne correspond pas à ton compte. Vérifie chaque groupe : majuscules, espaces et tirets ne comptent pas.'

// What a password typed in the form still lacks, counted as `assertPasswordLength` counts.
export function passwordTooShort(password: string): string {
  const missing = MIN_PASSWORD_LENGTH - [...password.normalize('NFC')].length
  return `Trop court : encore ${missing} caractère${missing > 1 ? 's' : ''}.`
}
// Anything else — the network, an overloaded server, a rate limit — is not the
// person's doing, and is not told as a wrong password.
const SIGN_IN_FAILED = "La connexion n’a pas abouti. Réessaie dans un instant."
const SIGN_UP_FAILED = "L’inscription n’a pas abouti. Réessaie dans un instant."
export const RECOVERY_FAILED = "La récupération n’a pas abouti. Réessaie dans un instant."
export const FACE_ID_NO_PRF =
  'Ton gestionnaire de mots de passe ne sait pas ouvrir le coffre. Sur iPhone, choisis l’app Mots de passe d’Apple quand il te le demande. Tu peux supprimer la clé d’accès qu’il vient de créer. Ta clé de secours, elle, ne change pas.'

/** What checks the person on this device, as the screens say it (see `faceIdLabel`). */
export type FaceIdLabel = 'Face ID' | 'Touch ID' | 'Windows Hello' | 'ton empreinte'

// The sentences below say the device's own word. « ton empreinte » is
// feminine, and takes a capital at the start of a sentence.
const EMPREINTE = 'ton empreinte'

// The site's name is not decided yet: the sentence does not name it.
export function faceIdAlready(label: FaceIdLabel): string {
  return label === EMPREINTE ? 'Ton empreinte est déjà prête sur cet appareil.' : `${label} est déjà prêt sur cet appareil.`
}

export function faceIdNoLongerOpens(label: FaceIdLabel): string {
  const subject = label === EMPREINTE ? 'Ton empreinte' : label
  return `${subject} n’ouvre plus ton coffre sur cet appareil. Connecte-toi avec ton mot de passe.`
}

// Most likely a passkey left in a manager that gives no secret (Proton Pass on
// iPhone): the person is told which one to choose. « Cette clé ton empreinte »
// would not be French: that one is just « Cette clé ».
export function faceIdUnavailable(label: FaceIdLabel): string {
  const key = label === EMPREINTE ? 'Cette clé' : `Cette clé ${label}`
  return `${key} est rangée dans un gestionnaire qui ne sait pas ouvrir le coffre. Choisis celle de l’app Mots de passe d’Apple, ou connecte-toi avec ton mot de passe.`
}

// An activation that failed for a reason that is not the person's. Its only button is
// « Continuer », so it does not say « réessaie »: it says when the offer comes back, at the next
// password sign-in.
export function faceIdActivationFailed(label: FaceIdLabel): string {
  return label === EMPREINTE
    ? 'Ton empreinte n’a pas pu être activée. On te la reproposera à ta prochaine connexion.'
    : `${label} n’a pas pu être activé. On te le reproposera à ta prochaine connexion.`
}

// What checks the person on this device, as the buttons say it: « Se connecter
// avec … ». « Face ID » on iPhone and iPad, « Touch ID » on a Mac, « Windows
// Hello » on Windows (face, fingerprint or code), « ton empreinte » anywhere
// else. Safari on an iPad presents itself as a Mac by default; only the touch
// screen tells them apart.
export function faceIdLabel(device: { userAgent: string; maxTouchPoints: number }): FaceIdLabel {
  if (/iPhone|iPad/.test(device.userAgent)) return 'Face ID'
  if (/Macintosh/.test(device.userAgent)) return device.maxTouchPoints > 1 ? 'Face ID' : 'Touch ID'
  if (/Windows NT/.test(device.userAgent)) return 'Windows Hello'
  return EMPREINTE
}

// The server refusing the derived secret and the vault refusing the derived
// key are the same mistake seen from two places: one wrong thing typed.
export function signInErrorMessage(error: unknown): string {
  if (error instanceof WrongCredentialsError || error instanceof WrongPasswordError) return WRONG_CREDENTIALS
  if (error instanceof EmailNotConfirmedError) return EMAIL_NOT_CONFIRMED
  return SIGN_IN_FAILED
}

// A passkey whose packet would not open sends the person to their password; one
// that gave no secret says which passkey to choose instead. A cancelled prompt
// is the person's own doing: nothing is said, the screen stays as it is.
export function faceIdSignInErrorMessage(error: unknown, label: FaceIdLabel): string | null {
  if (error instanceof FaceIdCancelledError) return null
  if (error instanceof FaceIdNoLongerOpensError) return faceIdNoLongerOpens(label)
  if (error instanceof FaceIdUnavailableError) return faceIdUnavailable(label)
  return SIGN_IN_FAILED
}

export function signUpErrorMessage(error: unknown): string {
  if (error instanceof PasswordTooShortError) return PASSWORD_TOO_SHORT
  return SIGN_UP_FAILED
}

// A wrong key is refused before anything is written: the person can correct
// it and try again. Anything else is not theirs to fix.
export function recoveryErrorMessage(error: unknown): string {
  if (error instanceof InvalidRecoveryKeyError) return WRONG_RECOVERY_KEY
  if (error instanceof PasswordTooShortError) return PASSWORD_TOO_SHORT
  return RECOVERY_FAILED
}

// Checked before the derivation starts: both mistakes are visible in the form
// itself, and the vault's own length rule is the one applied. The same rules
// hold for a new password chosen after a forgotten one.
export function signUpFieldErrors(input: {
  password: string
  confirmation: string
}): { password?: string; confirmation?: string } {
  // Both mistakes at once, never one per try.
  const problems: { password?: string; confirmation?: string } = {}
  try {
    assertPasswordLength(input.password)
  } catch (error) {
    if (!(error instanceof PasswordTooShortError)) throw error
    problems.password = passwordTooShort(input.password)
  }
  if (input.password !== input.confirmation) problems.confirmation = PASSWORDS_DIFFER
  return problems
}
