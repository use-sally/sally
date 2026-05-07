import type { BoardCard, BoardColumn } from '@sally/types/src'

export type BoardFilters = {
  search: string
  assignee: string
  priority: '' | 'P1' | 'P2' | 'P3'
  labels: ReadonlySet<string>
}

export const emptyBoardFilters: BoardFilters = {
  search: '',
  assignee: '',
  priority: '',
  labels: new Set<string>(),
}

export function boardFiltersActive(filters: BoardFilters): boolean {
  if (filters.search.trim().length > 0) return true
  if (filters.assignee) return true
  if (filters.priority) return true
  if (filters.labels.size > 0) return true
  return false
}

export function boardFilterPredicate(card: BoardCard, filters: BoardFilters): boolean {
  const needle = filters.search.trim().toLowerCase()
  if (needle && !card.title.toLowerCase().includes(needle)) return false
  if (filters.priority && card.priority !== filters.priority) return false
  if (filters.assignee) {
    const cardPeople = collectCardPeople(card)
    if (!cardPeople.has(filters.assignee)) return false
  }
  if (filters.labels.size > 0) {
    const cardLabels = new Set(card.labels || [])
    for (const required of filters.labels) {
      if (!cardLabels.has(required)) return false
    }
  }
  return true
}

export function applyBoardFilters(board: readonly BoardColumn[], filters: BoardFilters): BoardColumn[] {
  if (!boardFiltersActive(filters)) {
    return board.map((column) => ({ ...column }))
  }
  return board.map((column) => ({
    ...column,
    cards: column.cards.filter((card) => boardFilterPredicate(card, filters)),
  }))
}

export function collectBoardAssignees(board: readonly BoardColumn[]): string[] {
  const set = new Set<string>()
  for (const column of board) {
    for (const card of column.cards) {
      for (const value of collectCardPeople(card)) set.add(value)
    }
  }
  return Array.from(set).sort((left, right) => left.localeCompare(right))
}

export function collectBoardLabels(board: readonly BoardColumn[]): string[] {
  const set = new Set<string>()
  for (const column of board) {
    for (const card of column.cards) {
      for (const label of card.labels || []) set.add(label)
    }
  }
  return Array.from(set).sort((left, right) => left.localeCompare(right))
}

export function countBoardCards(board: readonly BoardColumn[]): number {
  let total = 0
  for (const column of board) total += column.cards.length
  return total
}

function collectCardPeople(card: BoardCard): Set<string> {
  const out = new Set<string>()
  if (card.owner && card.owner !== 'Unassigned') out.add(card.owner)
  if (card.assignee && card.assignee !== 'Unassigned') out.add(card.assignee)
  for (const participant of card.participants || []) {
    if (participant?.name) out.add(participant.name)
  }
  return out
}
