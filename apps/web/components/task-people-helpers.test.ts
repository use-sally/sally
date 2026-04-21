import test from 'node:test'
import assert from 'node:assert/strict'
import type { ProjectMember, TaskCollaborator, TaskParticipant } from '@sally/types/src'
import {
  buildTaskPeopleOptions,
  buildTaskPeopleUpdate,
  getTaskPeopleSelection,
  promoteTaskPersonSelection,
  toggleTaskPersonSelection,
  resolveTaskPeopleSelectionAgainstMembers,
} from './task-people-helpers'

const members: ProjectMember[] = [
  { id: 'm1', accountId: 'a1', name: 'Alex', email: 'alex@example.com', role: 'OWNER', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'm2', accountId: 'a2', name: 'Sam', email: 'sam@example.com', role: 'MEMBER', createdAt: '2026-01-01T00:00:00.000Z' },
  { id: 'm3', accountId: 'a3', name: null, email: 'pat@example.com', role: 'MEMBER', createdAt: '2026-01-01T00:00:00.000Z' },
]

const participants: TaskParticipant[] = [
  { name: 'Sam', role: 'PARTICIPANT', position: 1, avatarUrl: null } as any,
  { name: 'Alex', role: 'OWNER', position: 0, avatarUrl: null } as any,
]

const collaborators: TaskCollaborator[] = [
  { name: 'Sam', avatarUrl: null },
  { name: 'pat@example.com', avatarUrl: null },
]

test('getTaskPeopleSelection returns first person followed by additional people in order', () => {
  assert.deepEqual(getTaskPeopleSelection('Alex', collaborators), ['Alex', 'Sam', 'pat@example.com'])
})

test('getTaskPeopleSelection prefers canonical participant ordering when available', () => {
  assert.deepEqual(getTaskPeopleSelection(undefined, participants), ['Alex', 'Sam'])
})

test('buildTaskPeopleUpdate uses the first selected person as owner and the rest as additional people', () => {
  assert.deepEqual(buildTaskPeopleUpdate(['Sam', 'pat@example.com']), {
    owner: 'Sam',
    participants: [
      { participant: 'Sam', role: 'OWNER', position: 0 },
      { participant: 'pat@example.com', role: 'PARTICIPANT', position: 1 },
    ],
    assignee: 'Sam',
    collaborators: ['pat@example.com'],
  })
})

test('toggleTaskPersonSelection removes the owner and promotes the next person automatically', () => {
  assert.deepEqual(toggleTaskPersonSelection(['Alex', 'Sam', 'pat@example.com'], 'Alex'), ['Sam', 'pat@example.com'])
})

test('promoteTaskPersonSelection moves an existing collaborator to owner without dropping anyone', () => {
  assert.deepEqual(promoteTaskPersonSelection(['Alex', 'Sam', 'pat@example.com'], 'pat@example.com'), ['pat@example.com', 'Alex', 'Sam'])
})

test('resolveTaskPeopleSelectionAgainstMembers canonicalizes selected email values to the matching project member display value', () => {
  assert.deepEqual(resolveTaskPeopleSelectionAgainstMembers(members, ['alex@example.com', 'sam@example.com']), ['Alex', 'Sam'])
})

test('buildTaskPeopleOptions treats the matching project member as already selected even when the task stores email values', () => {
  assert.deepEqual(buildTaskPeopleOptions(members, resolveTaskPeopleSelectionAgainstMembers(members, ['alex@example.com', 'sam@example.com'])), [
    { value: 'Alex', label: 'Alex · alex@example.com', secondaryLabel: 'First person', selected: true, role: 'owner', missing: false },
    { value: 'Sam', label: 'Sam · sam@example.com', secondaryLabel: 'Additional person', selected: true, role: 'collaborator', missing: false },
    { value: 'pat@example.com', label: 'pat@example.com', secondaryLabel: 'Add to task', selected: false, role: 'available', missing: false },
  ])
})

test('buildTaskPeopleOptions marks the first selected person as owner and keeps selected people sorted first', () => {
  assert.deepEqual(buildTaskPeopleOptions(members, ['Sam', 'pat@example.com']), [
    { value: 'Sam', label: 'Sam · sam@example.com', secondaryLabel: 'First person', selected: true, role: 'owner', missing: false },
    { value: 'pat@example.com', label: 'pat@example.com', secondaryLabel: 'Additional person', selected: true, role: 'collaborator', missing: false },
    { value: 'Alex', label: 'Alex · alex@example.com', secondaryLabel: 'Add to task', selected: false, role: 'available', missing: false },
  ])
})
