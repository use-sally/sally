import test from 'node:test'
import assert from 'node:assert/strict'
import { chooseCreateTimesheetUserId } from './timesheet-helpers.js'
import { findCurrentTimesheetUserId, getPreferredTimesheetCreateUserId } from '../../../packages/types/src/index.js'

test('chooseCreateTimesheetUserId defaults elevated creators to their own timesheet user when no explicit user is provided', () => {
  assert.equal(chooseCreateTimesheetUserId({ elevated: true, requestedUserId: undefined, currentUserId: 'user-current' }), 'user-current')
})

test('chooseCreateTimesheetUserId lets elevated creators override the timesheet user explicitly', () => {
  assert.equal(chooseCreateTimesheetUserId({ elevated: true, requestedUserId: 'user-other', currentUserId: 'user-current' }), 'user-other')
})

test('chooseCreateTimesheetUserId ignores explicit overrides for non-elevated creators', () => {
  assert.equal(chooseCreateTimesheetUserId({ elevated: false, requestedUserId: 'user-other', currentUserId: 'user-current' }), 'user-current')
})

test('findCurrentTimesheetUserId matches the current account by name or email', () => {
  const users = [
    { id: 'admin', name: 'Admin' },
    { id: 'alex-user', name: 'alex@automatethis.pro' },
  ]
  assert.equal(findCurrentTimesheetUserId(users, { name: 'Alex', email: 'alex@automatethis.pro' }), 'alex-user')
})

test('getPreferredTimesheetCreateUserId prefers the current account over the first user in the list', () => {
  const users = [
    { id: 'admin', name: 'Admin' },
    { id: 'alex-user', name: 'alex@automatethis.pro' },
  ]
  assert.equal(getPreferredTimesheetCreateUserId(users, { name: 'Alex', email: 'alex@automatethis.pro' }), 'alex-user')
})
