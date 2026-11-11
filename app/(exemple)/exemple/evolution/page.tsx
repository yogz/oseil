import type { Metadata } from 'next'
import { ExampleEvolution } from '@/components/example/ExampleEvolution'

export const metadata: Metadata = {
  title: 'L’exemple : son évolution',
  description: 'Le patrimoine d’une personne inventée, mois après mois, sur un an.',
  alternates: { canonical: '/exemple/evolution' },
}

// The evolution of the example over a year.
export default function ExampleEvolutionPage() {
  return <ExampleEvolution />
}
