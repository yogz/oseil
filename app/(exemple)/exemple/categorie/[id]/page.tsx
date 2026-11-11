import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { ExampleCategory } from '@/components/example/ExampleCategory'
import { CATEGORIES, CATEGORY_ORDER } from '@/lib/catalog'
import type { CategoryId } from '@/lib/model/types'

// The five categories of the example, built at build time; any other address is not found.
export const dynamicParams = false

export function generateStaticParams(): Array<{ id: CategoryId }> {
  return CATEGORY_ORDER.map((id) => ({ id }))
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params
  const category = CATEGORIES[id as CategoryId]
  if (!category) return {}
  return {
    title: `L’exemple : ${category.label}`,
    description: `${category.label} d’une personne inventée, ligne par ligne, dans l’exemple d’Oseil.`,
    alternates: { canonical: `/exemple/categorie/${id}` },
  }
}

export default async function ExampleCategoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!(CATEGORY_ORDER as readonly string[]).includes(id)) notFound()
  return <ExampleCategory category={id as CategoryId} />
}
