import type { CategoryId } from '@/lib/model/types'

// Every address of the example stays under /exemple (lib/auth/routing.ts opens exactly these):
// nothing in it leads to a private screen. Out of it, only « Créer mon compte » and « Quitter ».
export const EXAMPLE_HOME = '/exemple'
export const EXAMPLE_EVOLUTION = '/exemple/evolution'
export const exampleCategory = (category: CategoryId) => `/exemple/categorie/${category}`
export const SIGN_UP = '/inscription'
export const LEAVE = '/'
