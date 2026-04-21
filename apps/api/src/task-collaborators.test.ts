import test from 'node:test'
import assert from 'node:assert/strict'
import { canAccessTaskParticipants, normalizeTaskCollaborators } from './task-collaborators.js'

test('normalizeTaskCollaborators trims, drops blanks, removes Unassigned, removes primary assignee, and deduplicates', () => {
  assert.deepEqual(
    normalizeTaskCollaborators([' alex@automatethis.pro ', '', 'Unassigned', 'alex@automatethis.pro', 'bea@automatethis.pro'], 'alex@automatethis.pro'),
    ['bea@automatethis.pro'],
  )
})

test('canAccessTaskParticipants allows unrestricted viewers', () => {
  assert.equal(
    canAccessTaskParticipants({ restricted: false, allowedAssignees: [] }, 'owner@company.com', ['member@company.com']),
    true,
  )
})

test('canAccessTaskParticipants allows a member when they are the primary assignee', () => {
  assert.equal(
    canAccessTaskParticipants({ restricted: true, allowedAssignees: ['member@company.com'] }, 'member@company.com', []),
    true,
  )
})

test('canAccessTaskParticipants allows a member when they are a collaborator', () => {
  assert.equal(
    canAccessTaskParticipants({ restricted: true, allowedAssignees: ['member@company.com'] }, 'other@company.com', ['member@company.com']),
    true,
  )
})

test('canAccessTaskParticipants denies a restricted member when they are neither assignee nor collaborator', () => {
  assert.equal(
    canAccessTaskParticipants({ restricted: true, allowedAssignees: ['member@company.com'] }, 'other@company.com', ['third@company.com']),
    false,
  )
})
