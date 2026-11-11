import { gridLabel } from '@/components/money/BoardLeft'
import { thirdPerson } from '@/lib/example/third-person'
import type { Board } from '@/lib/screens/mon-argent'

// The words of the example that the bricks would otherwise say to the visitor (« Ta grille », « tes
// objectifs »): the same sentences, of the person of the example (lib/example/third-person.ts).

export const EXAMPLE_LABEL = 'Ce qui est à la personne de l’exemple'

// What VoiceOver calls the grid: « Sa grille : Argent disponible 20 carrés, … ».
export const exampleGridName = (board: Board): string | undefined =>
  board.grid.kind === 'grid' ? thirdPerson(gridLabel(board.grid)) : undefined
