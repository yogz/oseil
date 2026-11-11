import { expect, test } from 'vitest'
import { exampleProfile, exampleSnapshot } from '@/lib/model/__tests__/fixtures'
import { confirmLine, markStep, setValue, startDraft } from '../draft'
import { startView } from '../start'

const fresh = () => startDraft('s1')

test('one row per establishment, in the order of the first launch', () => {
  const view = startView(exampleProfile, fresh())
  expect(view.rows.map((r) => [r.name, r.detail])).toEqual([
    ['Chez toi', '3 lignes'],
    ['BoursoBank', '3 lignes'],
    ['Linxea', '2 lignes'],
  ])
  expect(view.rows.map((r) => r.status)).toEqual(['todo', 'todo', 'todo'])
  expect(view.done).toBe(0)
  expect(view.next).toEqual({ id: 'home', name: 'Chez toi' })
})

test('done and skipped steps: done counts only what is done, next is the first still to do', () => {
  let draft = markStep(fresh(), 'home', 'done')
  draft = markStep(draft, 'boursobank', 'skipped')
  const view = startView(exampleProfile, draft)
  expect(view.rows.map((r) => r.status)).toEqual(['done', 'skipped', 'todo'])
  expect(view.done).toBe(1)
  expect(view.next).toEqual({ id: 'linxea', name: 'Linxea' })
})

test('next is null once every step is set', () => {
  let draft = markStep(fresh(), 'home', 'done')
  draft = markStep(draft, 'boursobank', 'done')
  draft = markStep(draft, 'linxea', 'skipped')
  expect(startView(exampleProfile, draft).next).toBeNull()
})

test('a line closed in the draft is not counted; an establishment with no open line says so', () => {
  const draft = { ...fresh(), closed: ['euro-fund', 'life-uc'] }
  const row = startView(exampleProfile, draft).rows.find((r) => r.id === 'linxea')
  expect(row?.detail).toBe('aucun compte')
  const one = startView(exampleProfile, { ...fresh(), closed: ['euro-fund'] }).rows.find((r) => r.id === 'linxea')
  expect(one?.detail).toBe('1 ligne')
})

test('a bank where a value was typed is « en cours », not « à faire »: the start screen knows where the update stands', () => {
  const today = '2026-11-07'
  let draft = setValue(fresh(), exampleSnapshot, 'livret-a-line', { kind: 'amount', amount: 1_300_000 }, today, {})
  draft = setValue(draft, exampleSnapshot, 'current-line', { kind: 'amount', amount: 900_000 }, today, {})
  const view = startView(exampleProfile, draft)
  expect(view.rows.map((r) => r.status)).toEqual(['todo', 'current', 'todo'])
  // Not done: it is still the next one to do, so the update resumes there.
  expect(view.done).toBe(0)
  expect(view.next).toEqual({ id: 'home', name: 'Chez toi' })
  // Finished or skipped, it says so instead.
  expect(startView(exampleProfile, markStep(draft, 'boursobank', 'done')).rows[1].status).toBe('done')
})

test('a line confirmed « Inchangé » also begins a bank', () => {
  const draft = confirmLine(fresh(), 'euro-fund')
  expect(startView(exampleProfile, draft).rows.map((r) => r.status)).toEqual(['todo', 'todo', 'current'])
})
