import type { Metadata } from 'next'
import { ExampleMonArgent } from '@/components/example/ExampleMonArgent'

export const metadata: Metadata = {
  title: 'L’exemple',
  description: 'Oseil avec les chiffres d’une personne inventée : son patrimoine en 100 carrés, ses catégories et son évolution sur un an.',
  alternates: { canonical: '/exemple' },
}

// Mon argent of the example: an invented person, the same for everyone, built once at build time.
export default function ExamplePage() {
  return <ExampleMonArgent />
}
