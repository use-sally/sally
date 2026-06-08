import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { TASK_MODAL_MAX_HEIGHT } from './task-modal-helpers'

describe('task modal sizing', () => {
  it('keeps enough viewport height for lower task actions like comment submit', () => {
    const match = TASK_MODAL_MAX_HEIGHT.match(/^(\d+)vh$/)
    assert.ok(match, 'modal max height should be expressed in vh')
    assert.ok(Number(match[1]) >= 90, 'modal should use at least 90vh so comment actions are visible without inner scrolling')
  })
})
