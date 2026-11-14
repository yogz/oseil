// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { AnchorHTMLAttributes } from 'react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import { cameFromInside, forgetFromInside } from '@/lib/app/find-entry'
import { AppFrame } from '../AppFrame'
import { FindLink } from '../FindLink'
import { TopMenu } from '../TopMenu'

const mocks = vi.hoisted(() => ({ pathname: { current: '/' }, push: vi.fn() }))

vi.mock('@/lib/app/use-desktop', () => ({ useIsDesktop: () => false }))
vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname.current, useRouter: () => ({ push: mocks.push }) }))
vi.mock('@/components/update/UpdateProvider', () => ({
  UpdateProvider: ({ children }: { children: React.ReactNode }) => children,
}))
vi.mock('next/link', () => ({
  default: ({ href, onClick, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event)
        event.preventDefault()
      }}
      {...props}
    />
  ),
}))

const platform = vi.spyOn(window.navigator, 'platform', 'get')

beforeEach(() => {
  mocks.pathname.current = '/'
  mocks.push.mockReset()
  platform.mockReturnValue('MacIntel')
})
afterEach(() => {
  cleanup()
  forgetFromInside()
})

test('the magnifier is a link « Trouver » to /trouver, 44 px, in the soft colour of the text, its drawing hidden', () => {
  render(<FindLink />)
  const link = screen.getByRole('link', { name: 'Trouver' })
  expect(link).toHaveAttribute('href', '/trouver')
  expect(link.className).toMatch(/\bsize-11\b/)
  expect(link.className).toMatch(/\btext-ink-soft\b/)
  expect(link.querySelector('svg')).toHaveAttribute('aria-hidden', 'true')
})

test('a touch on the magnifier says « Trouver » was opened from inside Oseil', () => {
  render(<FindLink />)
  expect(cameFromInside()).toBe(false)
  fireEvent.click(screen.getByRole('link', { name: 'Trouver' }))
  expect(cameFromInside()).toBe(true)
})

test('on a computer, the menu at the top has « Trouver » just left of « Réglages »', () => {
  render(<TopMenu current="mon-argent" />)
  const header = screen.getByRole('banner')
  const links = within(header).getAllByRole('link').map((a) => a.getAttribute('aria-label') ?? a.textContent)
  expect(links.slice(-2)).toEqual(['Trouver', 'Réglages'])
})

test('⌘K on a Mac opens « Trouver » from a screen of the application, marked as from inside', () => {
  mocks.pathname.current = '/reperes'
  render(<AppFrame>écran</AppFrame>)
  fireEvent.keyDown(window, { key: 'k', metaKey: true })
  expect(mocks.push).toHaveBeenCalledWith('/trouver')
  expect(cameFromInside()).toBe(true)
})

test('Ctrl+K elsewhere, even from inside a case', () => {
  platform.mockReturnValue('Win32')
  render(
    <AppFrame>
      <input aria-label="case" />
    </AppFrame>,
  )
  const input = screen.getByRole('textbox', { name: 'case' })
  input.focus()
  fireEvent.keyDown(input, { key: 'k', ctrlKey: true })
  expect(mocks.push).toHaveBeenCalledWith('/trouver')
})

// Review focus 4.
test.each(['/mise-a-jour', '/mise-a-jour/banque', '/premier-lancement', '/premier-lancement/ou', '/trouver'])(
  '⌘K does nothing in %s',
  (path) => {
    mocks.pathname.current = path
    render(<AppFrame>écran</AppFrame>)
    fireEvent.keyDown(window, { key: 'k', metaKey: true })
    expect(mocks.push).not.toHaveBeenCalled()
    expect(cameFromInside()).toBe(false)
  },
)

test('⌘K does nothing while a word is being composed', () => {
  render(<AppFrame>écran</AppFrame>)
  fireEvent.keyDown(window, { key: 'k', metaKey: true, isComposing: true })
  expect(mocks.push).not.toHaveBeenCalled()
})
