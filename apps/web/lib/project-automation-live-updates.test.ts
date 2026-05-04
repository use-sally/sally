import test from 'node:test'
import assert from 'node:assert/strict'

import { PROJECT_AUTOMATION_REFETCH_INTERVAL_MS } from './query'

test('project automation island refreshes often enough to behave like a live control plane', () => {
  assert.equal(PROJECT_AUTOMATION_REFETCH_INTERVAL_MS, 2000)
})
