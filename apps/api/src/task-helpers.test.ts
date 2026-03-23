import test from 'node:test'
import assert from 'node:assert/strict'
import { hasExactTodoOrder, normalizeTaskLabels, normalizeTaskTodoTexts } from './task-helpers.js'

test('normalizeTaskLabels trims, drops blanks, and deduplicates', () => {
  assert.deepEqual(normalizeTaskLabels([' urgent ', '', 'marketing', 'urgent', ' marketing ']), ['urgent', 'marketing'])
})

test('normalizeTaskTodoTexts trims and drops blank checklist items', () => {
  assert.deepEqual(normalizeTaskTodoTexts([{ text: ' Draft outline ' }, { text: '   ' }, { text: 'Ship' }]), ['Draft outline', 'Ship'])
})

test('hasExactTodoOrder accepts exact same set with reordered ids', () => {
  assert.equal(hasExactTodoOrder(['a', 'b', 'c'], ['c', 'a', 'b']), true)
})

test('hasExactTodoOrder rejects missing ids', () => {
  assert.equal(hasExactTodoOrder(['a', 'b', 'c'], ['a', 'b']), false)
})

test('hasExactTodoOrder rejects unknown ids', () => {
  assert.equal(hasExactTodoOrder(['a', 'b', 'c'], ['a', 'b', 'x']), false)
})
