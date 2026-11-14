// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { AppFrame } from '../AppFrame'
import { TabBar } from '../TabBar'
import { TopMenu } from '../TopMenu'
import type { ModelState } from '@/lib/app/use-model'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import { useMenuFromModel } from '../use-menu-from-model'
import { useTopMenuInfo } from '../top-menu-info'

const mocks = vi.hoisted(() => ({ pathname: { current: '/' }, desktop: { current: true } }))

vi.mock('@/lib/app/use-desktop', () => ({ useIsDesktop: () => mocks.desktop.current }))

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname.current, useRouter: () => ({ push: () => {} }) }))
// The update's provider (above the fade in AppFrame) reads the vault: not what this file tests.
vi.mock('@/components/update/UpdateProvider', () => ({
  UpdateProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('next/link', () => ({
  default: ({ href, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props} />
  ),
}))

beforeEach(() => {
  mocks.pathname.current = '/'
  mocks.desktop.current = true
})
afterEach(cleanup)

test('the menu links the three screens and marks the current one', () => {
  render(<TopMenu current="evolution" />)
  expect(screen.getByRole('navigation', { name: 'Menu principal' })).toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Mon argent' })).toHaveAttribute('href', '/')
  expect(screen.getByRole('link', { name: 'Repères' })).toHaveAttribute('href', '/reperes')
  const current = screen.getByRole('link', { name: 'Évolution' })
  expect(current).toHaveAttribute('href', '/evolution')
  expect(current).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Repères' })).not.toHaveAttribute('aria-current')
})

// A2 (Nicolas, 11 November 2026): the date of the figures left the menu, which it pushed onto two lines.
test('on the right: « Mettre à jour » when it is available, « Réglages », and no date', () => {
  render(<TopMenu current="mon-argent" canUpdate />)
  expect(screen.queryByText(/Chiffres du/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Mettre à jour' })).toHaveAttribute('href', '/mise-a-jour')
  expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('href', '/reglages')
})

test('without a date and without an update, only « Réglages » is on the right', () => {
  render(<TopMenu current="reperes" />)
  expect(screen.queryByRole('link', { name: 'Mettre à jour' })).not.toBeInTheDocument()
  expect(screen.queryByText(/Chiffres du/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Réglages' })).toBeInTheDocument()
})

test('the menu shows from lg, the tab bar only below lg', () => {
  const { container } = render(
    <>
      <TopMenu current="reperes" />
      <TabBar current="reperes" />
    </>,
  )
  expect(container.querySelector('header')).toHaveClass('hidden', 'lg:block')
  expect(screen.getByRole('navigation', { name: 'Onglets' })).toHaveClass('lg:hidden')
})

test('the frame shows the menu with the tab of the path, on the width of every screen (B6)', () => {
  mocks.pathname.current = '/reperes'
  const { container } = render(<AppFrame>contenu</AppFrame>)
  expect(screen.getByRole('link', { name: 'Repères' })).toHaveAttribute('aria-current', 'page')
  expect(screen.getByRole('link', { name: 'Réglages' })).not.toHaveAttribute('aria-current')
  const main = container.querySelector('main')!
  expect(main).toHaveClass('max-w-md', 'lg:max-w-5xl')
})

test('A7: the Réglages open are marked in the menu, as a tab is', () => {
  mocks.pathname.current = '/reglages'
  render(<AppFrame>contenu</AppFrame>)
  expect(screen.getByRole('link', { name: 'Réglages' })).toHaveAttribute('aria-current', 'page')
  for (const tab of ['Mon argent', 'Repères', 'Évolution']) {
    expect(screen.getByRole('link', { name: tab })).not.toHaveAttribute('aria-current')
  }
})

test('every screen of the application shares the width of the two columns', () => {
  for (const path of ['/', '/categorie/markets', '/ligne/x', '/reperes', '/evolution', '/reglages', '/titres']) {
    mocks.pathname.current = path
    const { container } = render(<AppFrame>contenu</AppFrame>)
    expect(container.querySelector('main')).toHaveClass('lg:max-w-5xl')
    cleanup()
  }
})

test('a line sheet belongs to Mon argent', () => {
  mocks.pathname.current = '/ligne/abc'
  render(<AppFrame>contenu</AppFrame>)
  expect(screen.getByRole('link', { name: 'Mon argent' })).toHaveAttribute('aria-current', 'page')
})

test('the full-screen flows show no menu', () => {
  for (const path of ['/mise-a-jour', '/mise-a-jour/banque/x', '/premier-lancement', '/premier-lancement/etape']) {
    mocks.pathname.current = path
    const { container } = render(<AppFrame>contenu</AppFrame>)
    expect(screen.queryByRole('navigation', { name: 'Menu principal' })).not.toBeInTheDocument()
    expect(container.querySelector('main')).toHaveClass('lg:max-w-xl')
    cleanup()
  }
})

test('« Trouver » takes the whole screen too, on a computer as on a phone', () => {
  mocks.pathname.current = '/trouver'
  const { container } = render(<AppFrame>contenu</AppFrame>)
  expect(screen.queryByRole('navigation', { name: 'Menu principal' })).not.toBeInTheDocument()
  expect(container.querySelector('main')).toHaveClass('lg:max-w-xl')
})

function Page() {
  useTopMenuInfo({ canUpdate: true })
  return <p>page</p>
}

test('the info stays while a screen of the same family loads, and goes when the family changes', () => {
  mocks.pathname.current = '/'
  const { rerender } = render(
    <AppFrame>
      <Page />
    </AppFrame>,
  )
  expect(screen.getByRole('link', { name: 'Mettre à jour' })).toBeInTheDocument()
  // Mon argent to a category, whose screen has not told anything yet: no flash off.
  mocks.pathname.current = '/categorie/markets'
  rerender(<AppFrame>autre</AppFrame>)
  expect(screen.getByRole('link', { name: 'Mettre à jour' })).toBeInTheDocument()
  // Repères: another family, « Mettre à jour » waits for its own screen.
  mocks.pathname.current = '/reperes'
  rerender(<AppFrame>autre</AppFrame>)
  expect(screen.queryByRole('link', { name: 'Mettre à jour' })).not.toBeInTheDocument()
})

test('a screen outside the frame can call the hook without effect', () => {
  render(<Page />)
  expect(screen.getByText('page')).toBeInTheDocument()
})

test('on a phone a screen puts nothing in the menu: its own update stays its own', () => {
  mocks.desktop.current = false
  render(
    <AppFrame>
      <Page />
    </AppFrame>,
  )
  expect(screen.queryByRole('link', { name: 'Mettre à jour' })).not.toBeInTheDocument()
})

// The menu is the same on every screen (planche 20): a screen that is not Mon argent tells it the
// « Mettre à jour » from the model, so Réglages shows it too.
test('the settings, a screen that is not Mon argent, show the same menu: « Mettre à jour »', () => {
  const state: ModelState = {
    status: 'ready',
    model: {
      profile: { id: 'p', value: exampleProfile, updatedAt: '' },
      snapshots: [{ id: 's', value: exampleSnapshot, updatedAt: '' }],
      goals: [],
      settings: null,
      draft: null,
      unreadable: { profile: 0, snapshots: 0, goals: 0, settings: 0, draft: 0 },
    },
    client: {} as never,
    dataKey: {} as CryptoKey,
    reload: () => {},
  }
  function Settings() {
    useMenuFromModel(state)
    return <p>réglages</p>
  }
  mocks.pathname.current = '/reglages'
  render(
    <AppFrame>
      <Settings />
    </AppFrame>,
  )
  expect(screen.queryByText(/Chiffres du/)).not.toBeInTheDocument()
  expect(screen.getByRole('link', { name: 'Mettre à jour' })).toHaveAttribute('href', '/mise-a-jour')
})
