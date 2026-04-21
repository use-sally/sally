import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLegacyTaskPeopleAliases,
  buildTaskParticipantWrites,
  normalizeTaskPeople,
  resolveVisibleTaskPeople,
} from './task-people.js'

test('normalizeTaskPeople puts owner first, trims values, deduplicates, and preserves participant order', () => {
  assert.deepEqual(
    normalizeTaskPeople(' owner@company.com ', ['member@company.com', 'owner@company.com', '', 'member@company.com', 'other@company.com']).people,
    [
      { participant: 'owner@company.com', role: 'OWNER', position: 0 },
      { participant: 'member@company.com', role: 'PARTICIPANT', position: 1 },
      { participant: 'other@company.com', role: 'PARTICIPANT', position: 2 },
    ],
  )
})

test('normalizeTaskPeople falls back to first participant as owner when owner is omitted', () => {
  const normalized = normalizeTaskPeople(undefined, [' first@company.com ', 'second@company.com'])
  assert.equal(normalized.owner, 'first@company.com')
  assert.deepEqual(normalized.people.map((person) => person.role), ['OWNER', 'PARTICIPANT'])
})

test('buildLegacyTaskPeopleAliases derives assignee and collaborators from canonical people', () => {
  assert.deepEqual(
    buildLegacyTaskPeopleAliases([
      { participant: 'owner@company.com', role: 'OWNER', position: 0 },
      { participant: 'member@company.com', role: 'PARTICIPANT', position: 1 },
      { participant: 'other@company.com', role: 'PARTICIPANT', position: 2 },
    ]),
    {
      assignee: 'owner@company.com',
      collaborators: ['member@company.com', 'other@company.com'],
    },
  )
})

test('resolveVisibleTaskPeople prefers canonical rows and falls back to legacy assignee and collaborators', () => {
  assert.deepEqual(
    resolveVisibleTaskPeople({
      owner: 'owner@company.com',
      participants: [
        { participant: 'owner@company.com', role: 'OWNER', position: 0 },
        { participant: 'member@company.com', role: 'PARTICIPANT', position: 1 },
      ],
      assignee: 'legacy@company.com',
      collaborators: [{ collaborator: 'legacy-helper@company.com' }],
    }),
    {
      owner: 'owner@company.com',
      participants: [
        { participant: 'owner@company.com', role: 'OWNER', position: 0 },
        { participant: 'member@company.com', role: 'PARTICIPANT', position: 1 },
      ],
      assignee: 'owner@company.com',
      collaborators: ['member@company.com'],
    },
  )

  assert.deepEqual(
    resolveVisibleTaskPeople({
      owner: null,
      participants: [],
      assignee: 'legacy@company.com',
      collaborators: [{ collaborator: 'helper@company.com' }, { collaborator: 'legacy@company.com' }],
    }),
    {
      owner: 'legacy@company.com',
      participants: [
        { participant: 'legacy@company.com', role: 'OWNER', position: 0 },
        { participant: 'helper@company.com', role: 'PARTICIPANT', position: 1 },
      ],
      assignee: 'legacy@company.com',
      collaborators: ['helper@company.com'],
    },
  )
})

test('buildTaskParticipantWrites creates nested writes and legacy aliases from mixed payloads', () => {
  assert.deepEqual(
    buildTaskParticipantWrites({
      owner: 'owner@company.com',
      participants: ['member@company.com', 'owner@company.com', 'other@company.com'],
    }),
    {
      owner: 'owner@company.com',
      assignee: 'owner@company.com',
      collaborators: ['member@company.com', 'other@company.com'],
      participantRows: [
        { participant: 'owner@company.com', role: 'OWNER', position: 0 },
        { participant: 'member@company.com', role: 'PARTICIPANT', position: 1 },
        { participant: 'other@company.com', role: 'PARTICIPANT', position: 2 },
      ],
      participantCreateMany: {
        data: [
          { participant: 'owner@company.com', role: 'OWNER', position: 0 },
          { participant: 'member@company.com', role: 'PARTICIPANT', position: 1 },
          { participant: 'other@company.com', role: 'PARTICIPANT', position: 2 },
        ],
      },
    },
  )
})
