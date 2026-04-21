import test from 'node:test'
import assert from 'node:assert/strict'
import type { ProjectMember } from '@sally/types/src'
import { buildCollaboratorOptions, normalizeCollaboratorSelection, toggleCollaboratorSelection } from './collaborator-picker-helpers'

const members: ProjectMember[] = [
  { id: 'm1', accountId: 'a1', name: 'Alex', email: 'alex@example.com', role: 'OWNER', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'm2', accountId: 'a2', name: 'Sam', email: 'sam@example.com', role: 'MEMBER', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'm3', accountId: 'a3', name: null, email: 'pat@example.com', role: 'MEMBER', createdAt: '2026-01-01T00:00:00.000Z' },
]

test('normalizeCollaboratorSelection removes blanks, duplicates, and the assignee', () => {
  assert.deepEqual(
    normalizeCollaboratorSelection(['Sam', ' ', 'Alex', 'Sam', 'pat@example.com'], 'Alex'),
    ['Sam', 'pat@example.com'],
  )
})

test('toggleCollaboratorSelection adds and removes values predictably', () => {
  assert.deepEqual(toggleCollaboratorSelection(['Sam'], 'pat@example.com'), ['Sam', 'pat@example.com'])
  assert.deepEqual(toggleCollaboratorSelection(['Sam', 'pat@example.com'], 'Sam'), ['pat@example.com'])
})

test('buildCollaboratorOptions merges project members with selected external collaborators', () => {
  assert.deepEqual(
    buildCollaboratorOptions(members, ['Sam', 'outside@example.com'], 'Alex'),
    [
      { value: 'Sam', label: 'Sam · sam@example.com', secondaryLabel: 'sam@example.com', selected: true, missing: false },
      { value: 'pat@example.com', label: 'pat@example.com', secondaryLabel: 'Project member', selected: false, missing: false },
      { value: 'outside@example.com', label: 'outside@example.com', secondaryLabel: 'Not on project', selected: true, missing: true },
    ],
  )
})
