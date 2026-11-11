import { oncePerLoad } from '@/lib/app/arrival'

// The grid of the example arrives once per page load, as in the site, and on its own: the real Mon
// argent's arrival (lib/app/arrival.ts) is not the example's to spend. The hint that a square can be
// touched follows it: it plays each time the example opens, never on a return within the same opening.
export const exampleGridArrival = oncePerLoad()

// The example's hint counts nothing: it is due on every arrival, and plays without being counted in the
// site's own openings (lib/app/square-hint.ts), which stay those of the visitor's future account.
export const exampleSquareHint = {
  due: () => true,
  played: () => {},
}
