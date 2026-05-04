import test from 'node:test'
import assert from 'node:assert/strict'

import { formatApiError } from './api'

test('formatApiError preserves JSON API errors', () => {
  assert.equal(formatApiError('/auth/login', 401, '{"error":"Invalid credentials"}'), 'Invalid credentials')
})

test('formatApiError does not dump HTML pages into the UI', () => {
  const html = '<!DOCTYPE html><html><body><h1>404: This page could not be found.</h1></body></html>'
  assert.equal(formatApiError('/auth/login', 404, html), 'API route /auth/login returned an HTML 404 page. Check NEXT_PUBLIC_API_BASE_URL / proxy routing.')
})

test('formatApiError truncates long plain-text responses', () => {
  const message = formatApiError('/x', 500, 'x'.repeat(600))
  assert.equal(message.length, 501)
  assert.match(message, /…$/)
})
