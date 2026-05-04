import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { BOTTOM_TASK_DRAWER_MAX_HEIGHT } from './bottom-task-drawer-helpers'

describe('bottom task drawer sizing', () => {
  it('keeps enough viewport height for lower task actions like comment submit', () => {
    const match = BOTTOM_TASK_DRAWER_MAX_HEIGHT.match(/^(\d+)vh$/)
    assert.ok(match, 'drawer max height should be expressed in vh')
    assert.ok(Number(match[1]) >= 90, 'drawer should use at least 90vh so comment actions are visible without inner scrolling')
  })
})
