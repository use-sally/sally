import test from 'node:test'
import assert from 'node:assert/strict'
import type { BoardCard, BoardColumn } from '@sally/types/src'
import {
  applyBoardFilters,
  boardFilterPredicate,
  boardFiltersActive,
  collectBoardAssignees,
  collectBoardLabels,
  countBoardCards,
  emptyBoardFilters,
  type BoardFilters,
} from './board-filters'

function makeCard(overrides: Partial<BoardCard> = {}): BoardCard {
  return {
    id: 'card-1',
    number: 1,
    position: 0,
    title: 'Sample task',
    meta: '',
    description: '',
    owner: 'admin@example.com',
    ownerAvatarUrl: null,
    participants: [],
    assignee: 'admin@example.com',
    assigneeAvatarUrl: null,
    collaborators: [],
    priority: 'P2',
    status: 'In Progress',
    statusId: 'status-1',
    statusColor: null,
    dueDate: null,
    createdAt: '2026-05-07T00:00:00.000Z',
    updatedAt: '2026-05-07T00:00:00.000Z',
    labels: [],
    ...overrides,
  }
}

function makeColumn(id: string, title: string, cards: BoardCard[]): BoardColumn {
  return { id, title, type: 'IN_PROGRESS', color: null, cards }
}

function withFilters(overrides: Partial<BoardFilters> = {}): BoardFilters {
  return {
    search: overrides.search ?? '',
    assignee: overrides.assignee ?? '',
    priority: overrides.priority ?? '',
    labels: overrides.labels ?? new Set<string>(),
  }
}

test('boardFiltersActive returns false for empty filters', () => {
  assert.equal(boardFiltersActive(emptyBoardFilters), false)
})

test('boardFiltersActive returns true if any field has a meaningful value', () => {
  assert.equal(boardFiltersActive(withFilters({ search: 'foo' })), true)
  assert.equal(boardFiltersActive(withFilters({ assignee: 'a@b.c' })), true)
  assert.equal(boardFiltersActive(withFilters({ priority: 'P1' })), true)
  assert.equal(boardFiltersActive(withFilters({ labels: new Set(['x']) })), true)
})

test('boardFiltersActive treats whitespace-only search as inactive', () => {
  assert.equal(boardFiltersActive(withFilters({ search: '   ' })), false)
})

test('boardFilterPredicate matches title case-insensitively as substring', () => {
  const card = makeCard({ title: 'Refactor MCP server transport' })
  assert.equal(boardFilterPredicate(card, withFilters({ search: 'mcp' })), true)
  assert.equal(boardFilterPredicate(card, withFilters({ search: 'MCP server' })), true)
  assert.equal(boardFilterPredicate(card, withFilters({ search: 'REST' })), false)
})

test('boardFilterPredicate filters by exact priority', () => {
  const p1 = makeCard({ id: 'a', priority: 'P1' })
  const p2 = makeCard({ id: 'b', priority: 'P2' })
  assert.equal(boardFilterPredicate(p1, withFilters({ priority: 'P1' })), true)
  assert.equal(boardFilterPredicate(p2, withFilters({ priority: 'P1' })), false)
})

test('boardFilterPredicate matches assignee against owner, assignee, and participants', () => {
  const ownerOnly = makeCard({ owner: 'alice@x.com', assignee: 'alice@x.com', participants: [] })
  const participantOnly = makeCard({ owner: 'alice@x.com', assignee: 'alice@x.com', participants: [{ name: 'bob@x.com', avatarUrl: null }] as any })
  const otherUser = makeCard({ owner: 'alice@x.com', assignee: 'alice@x.com', participants: [] })
  assert.equal(boardFilterPredicate(ownerOnly, withFilters({ assignee: 'alice@x.com' })), true)
  assert.equal(boardFilterPredicate(participantOnly, withFilters({ assignee: 'bob@x.com' })), true)
  assert.equal(boardFilterPredicate(otherUser, withFilters({ assignee: 'charlie@x.com' })), false)
})

test('boardFilterPredicate ignores Unassigned sentinel for assignee match', () => {
  const card = makeCard({ owner: 'Unassigned', assignee: 'Unassigned' })
  assert.equal(boardFilterPredicate(card, withFilters({ assignee: 'Unassigned' })), false)
})

test('boardFilterPredicate label filter requires every selected label (AND semantics)', () => {
  const allThree = makeCard({ labels: ['UX', 'Boards', 'Admin'] })
  const onlyUx = makeCard({ labels: ['UX'] })
  const filterUxBoards = withFilters({ labels: new Set(['UX', 'Boards']) })
  assert.equal(boardFilterPredicate(allThree, filterUxBoards), true)
  assert.equal(boardFilterPredicate(onlyUx, filterUxBoards), false)
})

test('boardFilterPredicate combines all active filters with AND', () => {
  const card = makeCard({ title: 'Add audit log', priority: 'P1', owner: 'alice@x.com', assignee: 'alice@x.com', labels: ['Security'] })
  const matchAll = withFilters({ search: 'audit', priority: 'P1', assignee: 'alice@x.com', labels: new Set(['Security']) })
  assert.equal(boardFilterPredicate(card, matchAll), true)
  // any single mismatch breaks the match
  assert.equal(boardFilterPredicate(card, { ...matchAll, priority: 'P2' }), false)
  assert.equal(boardFilterPredicate(card, { ...matchAll, assignee: 'bob@x.com' }), false)
  assert.equal(boardFilterPredicate(card, { ...matchAll, labels: new Set(['UX']) }), false)
  assert.equal(boardFilterPredicate(card, { ...matchAll, search: 'log audit' }), false)
})

test('applyBoardFilters returns a shallow copy of columns when no filters are active', () => {
  const board = [
    makeColumn('c1', 'In Progress', [makeCard({ id: 'a' }), makeCard({ id: 'b' })]),
    makeColumn('c2', 'Done', [makeCard({ id: 'c' })]),
  ]
  const out = applyBoardFilters(board, emptyBoardFilters)
  assert.equal(out.length, 2)
  assert.deepEqual(out.map((column) => column.cards.map((card) => card.id)), [['a', 'b'], ['c']])
  assert.notEqual(out, board)
  assert.notEqual(out[0], board[0])
})

test('applyBoardFilters keeps columns even when all their cards are filtered out', () => {
  const board = [
    makeColumn('c1', 'In Progress', [makeCard({ id: 'a', priority: 'P1' })]),
    makeColumn('c2', 'Backlog', [makeCard({ id: 'b', priority: 'P2' })]),
  ]
  const out = applyBoardFilters(board, withFilters({ priority: 'P3' }))
  assert.equal(out.length, 2)
  assert.deepEqual(out.map((column) => column.cards.length), [0, 0])
})

test('applyBoardFilters filters cards within each column', () => {
  const board = [
    makeColumn('c1', 'In Progress', [
      makeCard({ id: 'a', title: 'Fix login bug', priority: 'P1' }),
      makeCard({ id: 'b', title: 'Polish onboarding copy', priority: 'P3' }),
    ]),
    makeColumn('c2', 'Backlog', [
      makeCard({ id: 'c', title: 'Audit log feature', priority: 'P1' }),
    ]),
  ]
  const out = applyBoardFilters(board, withFilters({ priority: 'P1' }))
  assert.deepEqual(out.map((column) => column.cards.map((card) => card.id)), [['a'], ['c']])
})

test('collectBoardAssignees deduplicates and sorts owner/assignee/participants', () => {
  const board = [
    makeColumn('c1', 'In Progress', [
      makeCard({ id: 'a', owner: 'bob', assignee: 'bob', participants: [{ name: 'alice', avatarUrl: null }] as any }),
      makeCard({ id: 'b', owner: 'alice', assignee: 'alice', participants: [] }),
    ]),
    makeColumn('c2', 'Done', [
      makeCard({ id: 'c', owner: 'Unassigned', assignee: 'Unassigned', participants: [] }),
    ]),
  ]
  assert.deepEqual(collectBoardAssignees(board), ['alice', 'bob'])
})

test('collectBoardLabels deduplicates and sorts labels across all cards', () => {
  const board = [
    makeColumn('c1', 'In Progress', [
      makeCard({ id: 'a', labels: ['UX', 'Boards'] }),
      makeCard({ id: 'b', labels: ['UX'] }),
    ]),
    makeColumn('c2', 'Done', [
      makeCard({ id: 'c', labels: ['Admin', 'Security', 'UX'] }),
    ]),
  ]
  assert.deepEqual(collectBoardLabels(board), ['Admin', 'Boards', 'Security', 'UX'])
})

test('countBoardCards sums cards across all columns', () => {
  const board = [
    makeColumn('c1', 'In Progress', [makeCard({ id: 'a' }), makeCard({ id: 'b' })]),
    makeColumn('c2', 'Done', [makeCard({ id: 'c' })]),
    makeColumn('c3', 'Backlog', []),
  ]
  assert.equal(countBoardCards(board), 3)
})

test('countBoardCards returns 0 for an empty board', () => {
  assert.equal(countBoardCards([]), 0)
})
