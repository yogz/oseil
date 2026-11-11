// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { AnchorHTMLAttributes, ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import { memoryStorage } from '@/lib/auth/__tests__/memory-storage'
import { MAX_VISITS, SQUARE_HINT_KEY, squareHint } from '@/lib/app/square-hint'
import { exampleGridArrival } from '@/lib/example/arrival'
import { WORLD_FUND_NOTE } from '@/lib/screens/chapters'
import { plain } from '@/lib/__tests__/plain'
import ExampleLayout from '../layout'
import ExamplePage from '../page'
import ExampleCategoryPage, { generateStaticParams } from '../categorie/[id]/page'
import ExampleEvolutionPage from '../evolution/page'

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error('NEXT_NOT_FOUND')
  }),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocks.push, replace: mocks.replace }),
  usePathname: () => '/exemple',
  notFound: mocks.notFound,
}))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => <a href={href} {...props} />,
}))

beforeEach(() => {
  mocks.push.mockReset()
  mocks.replace.mockReset()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const inFrame = (page: ReactElement) => render(<ExampleLayout>{page}</ExampleLayout>)
const category = async (id: string) => ExampleCategoryPage({ params: Promise.resolve({ id }) })

// Every address a page can lead to: the example's own, or the two ways out of the banner.
function expectOnlyExampleLinks(container: HTMLElement) {
  const hrefs = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href') ?? '')
  expect(hrefs.length).toBeGreaterThan(0)
  for (const href of hrefs) {
    expect(href === '/inscription' || href === '/' || href === '/exemple' || href.startsWith('/exemple/'), href).toBe(true)
  }
}

describe('the frame of the example', () => {
  test('a banner on every page: what it is, « Créer mon compte » and « Quitter »', async () => {
    for (const page of [<ExamplePage key="a" />, await category('markets'), <ExampleEvolutionPage key="e" />]) {
      inFrame(page)
      expect(screen.getByText('Exemple, chiffres inventés')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Créer mon compte' })).toHaveAttribute('href', '/inscription')
      expect(screen.getByRole('link', { name: 'Quitter' })).toHaveAttribute('href', '/')
      cleanup()
    }
  })
})

describe('Mon argent of the example', () => {
  test('says whose it is, its 100 000 € and its five categories', () => {
    inFrame(<ExamplePage />)
    const label = screen.getByText('Ce qui est à la personne de l’exemple')
    expect(screen.queryByText('Ce qui est vraiment à toi')).not.toBeInTheDocument()
    // The amount right under its label.
    expect(plain(label.nextElementSibling?.textContent ?? '')).toBe('100 000 €')
    for (const name of ['Argent disponible', 'Épargne sécurisée', 'Placements en bourse', 'Or et crypto', 'Immobilier']) {
      expect(screen.getByRole('link', { name })).toHaveAttribute('href', expect.stringMatching(/^\/exemple\/categorie\//))
    }
  })

  // Piste B (Nicolas, 10 November 2026): in the example only, the evolution is a card right under the
  // grid, with a small curve of its snapshots, so a visitor cannot miss that Oseil follows it.
  test('a card under the grid opens the evolution: its curve, its gain and its snapshots', () => {
    inFrame(<ExamplePage />)
    const cards = screen.getAllByRole('link', { name: /^Son évolution sur un an/ })
    expect(cards).toHaveLength(1)
    const card = cards[0]
    expect(card).toHaveAttribute('href', '/exemple/evolution')
    expect(plain(card.textContent ?? '')).toBe('Son évolution sur un an+25 000 € · 4 relevés›')
    const curve = card.querySelector('svg[aria-hidden="true"]')
    expect(curve?.querySelectorAll('circle')).toHaveLength(4)
    // Under the grid, before the goals and the categories.
    const goals = screen.getByText(/en route vers ses objectifs|proche de ses objectifs/)
    expect(card.compareDocumentPosition(goals) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    const grid = screen.getByRole('img', { name: /grille/i })
    expect(grid.compareDocumentPosition(card) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  test('« Mettre à jour » opens the sheet: the example keeps nothing', async () => {
    const user = userEvent.setup()
    inFrame(<ExamplePage />)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Mettre à jour' }))
    const sheet = screen.getByRole('dialog', { name: 'L’exemple ne garde rien' })
    expect(sheet).toHaveTextContent('Crée ton compte pour noter tes propres chiffres. Ils seront chiffrés sur ton appareil.')
    expect(within(sheet).getByRole('link', { name: 'Créer mon compte' })).toHaveAttribute('href', '/inscription')
    expect(within(sheet).getByRole('link', { name: 'Créer mon compte' })).toHaveFocus()
    await user.click(within(sheet).getByRole('button', { name: 'Continuer l’exemple' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Mettre à jour' })).toHaveFocus()
  })

  test('the gear opens the same sheet; Escape closes it; Tab stays in it', async () => {
    const user = userEvent.setup()
    inFrame(<ExamplePage />)
    await user.click(screen.getByRole('button', { name: 'Réglages' }))
    const sheet = screen.getByRole('dialog', { name: 'L’exemple ne garde rien' })
    await user.tab()
    expect(within(sheet).getByRole('button', { name: 'Continuer l’exemple' })).toHaveFocus()
    await user.tab()
    expect(within(sheet).getByRole('link', { name: 'Créer mon compte' })).toHaveFocus()
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  test('a figure flips every figure to percent, and nothing asks to save it', async () => {
    const user = userEvent.setup()
    inFrame(<ExamplePage />)
    const row = screen.getByRole('link', { name: 'Argent disponible' }).closest('li')!
    await user.click(within(row).getByRole('button'))
    expect(plain(within(row).getByRole('button').textContent ?? '')).toBe('12 %')
    expect(screen.getByRole('status')).toHaveTextContent('Chiffres en % partout')
  })

  test('a square opens its category, in the example', () => {
    vi.useFakeTimers()
    inFrame(<ExamplePage />)
    const grid = screen.getByRole('img', { name: /^Sa grille/ })
    const first = grid.children[0] as HTMLElement
    expect(first).toHaveAttribute('data-category', 'available')
    fireEvent.click(first)
    act(() => vi.advanceTimersByTime(400))
    expect(mocks.push).toHaveBeenCalledWith('/exemple/categorie/available')
  })

  test('links only inside the example, or out by the banner', () => {
    const { container } = inFrame(<ExamplePage />)
    expectOnlyExampleLinks(container)
  })
})

// The hint of the site (lib/app/square-hint.ts), in the example too (Nicolas, 11 November 2026): each
// time the example opens, the largest category lights after the grid's arrival and the sentence says
// what a touch does. It never counts in the site's three openings, nor marks a touch there.
describe('the hint that a square can be touched, in the example', () => {
  const said = () => screen.queryByText(/^Touche un carré\s: sa catégorie s’ouvre$/)
  let storage: Storage

  beforeEach(() => {
    vi.useFakeTimers()
    exampleGridArrival.reset()
    storage = memoryStorage()
    vi.stubGlobal('localStorage', storage)
  })
  afterEach(() => {
    vi.unstubAllGlobals()
    exampleGridArrival.reset()
  })

  test('after the arrival, the sentence says it, then all comes back; the site keeps no count', () => {
    inFrame(<ExamplePage />)
    act(() => vi.advanceTimersByTime(1300))
    expect(said()).toBeNull()
    act(() => vi.advanceTimersByTime(100))
    expect(said()).toBeInTheDocument()
    expect(screen.getByRole('img', { name: /^Sa grille/ }).querySelectorAll('[data-square][data-dim]').length).toBeGreaterThan(0)
    act(() => vi.advanceTimersByTime(2_200))
    expect(said()).toBeNull()
    expect(storage.getItem(SQUARE_HINT_KEY)).toBeNull()
  })

  test('on every opening of the example, even once the site has had its three', () => {
    for (let i = 0; i < MAX_VISITS; i++) squareHint.played()
    inFrame(<ExamplePage />)
    act(() => vi.advanceTimersByTime(1400))
    expect(said()).toBeInTheDocument()
  })

  test('not when coming back to Mon argent within the same opening', () => {
    exampleGridArrival.shown()
    inFrame(<ExamplePage />)
    act(() => vi.advanceTimersByTime(3000))
    expect(said()).toBeNull()
  })

  test('a square touched in the example is not a touch of the site', () => {
    inFrame(<ExamplePage />)
    fireEvent.click(screen.getByRole('img', { name: /^Sa grille/ }).children[0])
    act(() => vi.advanceTimersByTime(3000))
    expect(said()).toBeNull()
    expect(storage.getItem(SQUARE_HINT_KEY)).toBeNull()
  })
})

describe('a category of the example', () => {
  test('one page per category, any other address is not found', async () => {
    expect(generateStaticParams().map((p) => p.id)).toEqual(['available', 'secured', 'markets', 'gold', 'property'])
    await expect(category('reglages')).rejects.toThrow('NEXT_NOT_FOUND')
  })

  test('its detail, read only: the line has no fiche to open', async () => {
    const { container } = inFrame(await category('markets'))
    expect(screen.getByRole('heading', { name: 'Placements en bourse' })).toBeInTheDocument()
    // Three zones: a gain, a loss, an unknown (no purchase price), so the gains of the zones show.
    expect(plain(container.textContent ?? '')).toMatch(/hors 1 ligne/)
    expect(plain(container.textContent ?? '')).toMatch(/1 ligne sans prix/)
    expect(container.textContent).toMatch(/−/)
    await userEvent.click(screen.getByRole('button', { name: /^Fonds monde/ }))
    expect(screen.getByText('Fonds monde (exemple)')).toBeInTheDocument()
    expect(screen.getByText('Fonds monde (exemple)').closest('a')).toBeNull()
    expect(screen.getByText('Ce qui est à la personne de l’exemple')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '‹ Mon argent' })).toHaveAttribute('href', '/exemple')
    expectOnlyExampleLinks(container)
  })

  test('« Fonds monde » carries the MSCI World note once its chapter is open', async () => {
    const user = userEvent.setup()
    const { container } = inFrame(await category('markets'))
    for (const chapter of screen.queryAllByRole('button', { expanded: false })) await user.click(chapter)
    expect(plain(container.textContent ?? '')).toContain(plain(WORLD_FUND_NOTE))
  })

  test('the home, net of its loan', async () => {
    const { container } = inFrame(await category('property'))
    expect(screen.getByText('Appartement d’exemple')).toBeInTheDocument()
    expect(plain(container.textContent ?? '')).toContain('une fois déduits 150 000 € encore dus chez Banque Exemple')
    expectOnlyExampleLinks(container)
  })

  test('a square of another category opens that one, in the example', async () => {
    vi.useFakeTimers()
    inFrame(await category('markets'))
    const grid = screen.getByRole('img', { name: /^Sa grille/ })
    fireEvent.click(grid.children[0] as HTMLElement)
    act(() => vi.advanceTimersByTime(400))
    expect(mocks.replace).toHaveBeenCalledWith('/exemple/categorie/available')
  })

  test('a square of this category lights its line; a touch outside the squares puts it out', async () => {
    inFrame(await category('markets'))
    const grid = screen.getByRole('img', { name: /^Sa grille/ })
    const mine = Array.from(grid.children).filter((s) => s.getAttribute('data-category') === 'markets') as HTMLElement[]
    fireEvent.click(mine[0])
    expect(document.querySelector('[data-focused]')).not.toBeNull()
    fireEvent.pointerDown(screen.getByRole('heading', { name: 'Placements en bourse' }))
    expect(document.querySelector('[data-focused]')).toBeNull()
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  test('the same page, given another category, shows that category’s detail', async () => {
    const { rerender } = inFrame(await category('markets'))
    expect(screen.getByRole('heading', { name: 'Placements en bourse' })).toBeInTheDocument()
    rerender(<ExampleLayout>{await category('property')}</ExampleLayout>)
    expect(screen.getByRole('heading', { name: 'Immobilier' })).toBeInTheDocument()
    expect(screen.getByText('Appartement d’exemple')).toBeInTheDocument()
    expect(screen.queryByText('Fonds monde (exemple)')).not.toBeInTheDocument()
  })

  test('every category has only example links', async () => {
    for (const { id } of generateStaticParams()) {
      const { container } = inFrame(await category(id))
      expectOnlyExampleLinks(container)
      cleanup()
    }
  })
})

// The example speaks of « la personne de l’exemple », never to the visitor as if the figures were
// theirs (Nicolas, 10 November 2026). Only the banner and the sheet address the visitor.
const SECOND_PERSON = /(^|[^\p{L}’'])(tu|ta|tes|ton|toi|te|t’|vous|votre|vos)(?=$|[^\p{L}])/iu
function secondPersonIn(container: HTMLElement): string[] {
  const found: string[] = []
  const outside = (el: Element) => !el.closest('[data-example-banner], [role="dialog"]')
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = plain(node.textContent ?? '')
    if (node.parentElement && outside(node.parentElement) && SECOND_PERSON.test(text)) found.push(text)
  }
  for (const el of Array.from(container.querySelectorAll('[aria-label], [title], [alt]'))) {
    if (!outside(el)) continue
    for (const name of ['aria-label', 'title', 'alt']) {
      const value = plain(el.getAttribute(name) ?? '')
      if (SECOND_PERSON.test(value)) found.push(`${name}: ${value}`)
    }
  }
  return found
}

describe('the example speaks of its person, in the third person', () => {
  test('Mon argent, with the simulation of the goals and the € / % switch', async () => {
    const user = userEvent.setup()
    const { container } = inFrame(<ExamplePage />)
    expect(secondPersonIn(container)).toEqual([])
    // The bubble of the amount: what is owned, and what is lent for the home.
    await user.click(screen.getByText('Ce qui est à la personne de l’exemple').nextElementSibling!.querySelector('button')!)
    expect(plain(container.querySelector('[data-bubble]')?.textContent ?? '')).toBe(
      'Cette personne possède 250 000 €, dont 150 000 € prêtés pour son logement.',
    )
    expect(secondPersonIn(container)).toEqual([])
    await user.click(screen.getByRole('button', { name: 'Voir ses objectifs' }))
    expect(screen.getByText('Si elle était pile à ses objectifs')).toBeInTheDocument()
    expect(
      screen.getByRole('img', { name: (name) => plain(name).startsWith('Simulation : sa grille si elle était') }),
    ).toBeInTheDocument()
    expect(secondPersonIn(container)).toEqual([])
  })

  test('the grid and the goals are named in its words', () => {
    const { container } = inFrame(<ExamplePage />)
    expect(
      screen.getByRole('img', { name: (name) => plain(name).startsWith('Sa grille : Argent disponible 12 carrés') }),
    ).toBeInTheDocument()
    expect(container).toHaveTextContent('Hors chez elle, proche de ses objectifs')
  })

  test('every category, details shown', async () => {
    const user = userEvent.setup()
    for (const { id } of generateStaticParams()) {
      const { container } = inFrame(await category(id))
      for (const chapter of screen.queryAllByRole('button', { expanded: false })) await user.click(chapter)
      expect(secondPersonIn(container), id).toEqual([])
      cleanup()
    }
  })

  test('the evolution', () => {
    const { container } = inFrame(<ExampleEvolutionPage />)
    expect(secondPersonIn(container)).toEqual([])
  })

  test('the check finds the second person when it is there', () => {
    const div = document.createElement('div')
    div.innerHTML = '<p>Hors ta maison</p><span aria-label="Ta grille : 3 carrés"></span><p data-example-banner="">Crée ton compte</p>'
    expect(secondPersonIn(div)).toEqual(['Hors ta maison', 'aria-label: Ta grille : 3 carrés'])
  })
})

describe('the evolution of the example', () => {
  test('the progress over a year, the curve and the four snapshots', () => {
    const { container } = inFrame(<ExampleEvolutionPage />)
    expect(screen.getByRole('heading', { name: 'Évolution' })).toBeInTheDocument()
    expect(plain(screen.getByTestId('since-first').textContent ?? '')).toContain('+25 000 €')
    expect(screen.getByRole('region', { name: 'La courbe' })).toBeInTheDocument()
    const statements = within(screen.getByRole('region', { name: 'Ses relevés' })).getAllByRole('listitem')
    expect(statements).toHaveLength(4)
    expectOnlyExampleLinks(container)
  })
})
