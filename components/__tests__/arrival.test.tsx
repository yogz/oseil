// @vitest-environment jsdom
import '@testing-library/jest-dom/vitest'
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'
import { ArrivalList, Arriving } from '@/components/ui/Arrival'

afterEach(cleanup)

const ARRIVES = 'animate-square-arrive'

// A list as a step draws it: replaced by a form, then drawn again with what was added.
function List({ list, items }: { list: string; items: string[] }) {
  return (
    <ArrivalList list={list} ids={items}>
      <ul>
        {items.map((item) => (
          <Arriving key={item} id={item}>
            {item}
          </Arriving>
        ))}
      </ul>
    </ArrivalList>
  )
}

test('what a list holds the first time it is drawn does not move', () => {
  render(<List list="first" items={['Livret A', 'LDDS']} />)
  expect(screen.getByText('Livret A')).not.toHaveClass(ARRIVES)
  expect(screen.getByText('LDDS')).not.toHaveClass(ARRIVES)
})

test('what was just added arrives, once, even when a form had replaced the list', () => {
  const first = render(<List list="added" items={['Livret A']} />)
  first.unmount()
  const again = render(<List list="added" items={['Livret A', 'LDDS']} />)
  expect(screen.getByText('Livret A')).not.toHaveClass(ARRIVES)
  expect(screen.getByText('LDDS')).toHaveClass(ARRIVES)
  again.unmount()
  // Drawn once more, after a form left without a change: nothing moves.
  render(<List list="added" items={['Livret A', 'LDDS']} />)
  expect(screen.getByText('LDDS')).not.toHaveClass(ARRIVES)
})

test('the first item of a list that was empty arrives too', () => {
  const empty = render(<List list="empty" items={[]} />)
  empty.unmount()
  render(<List list="empty" items={['Compte courant']} />)
  expect(screen.getByText('Compte courant')).toHaveClass(ARRIVES)
})
