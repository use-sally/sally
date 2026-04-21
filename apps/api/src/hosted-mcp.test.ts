import test from 'node:test'
import assert from 'node:assert/strict'
import { buildHostedMcpTaskCreatePayload, buildHostedMcpTaskUpdatePayload } from './hosted-mcp.js'

test('buildHostedMcpTaskCreatePayload preserves canonical and legacy task people fields', () => {
  const payload = buildHostedMcpTaskCreatePayload({
    projectId: 'proj_123',
    title: 'Ship rollout',
    owner: 'alex@example.com',
    participants: ['bea@example.com'],
    assignee: 'alex@example.com',
    collaborators: ['bea@example.com'],
    description: 'desc',
    priority: 'P1',
  })

  assert.deepEqual(payload, {
    projectId: 'proj_123',
    title: 'Ship rollout',
    owner: 'alex@example.com',
    participants: ['bea@example.com'],
    assignee: 'alex@example.com',
    collaborators: ['bea@example.com'],
    description: 'desc',
    priority: 'P1',
  })
})

test('buildHostedMcpTaskUpdatePayload preserves canonical task people fields without dropping empty participant arrays', () => {
  const payload = buildHostedMcpTaskUpdatePayload({
    owner: 'alex@example.com',
    participants: [],
    dueDate: null,
  })

  assert.deepEqual(payload, {
    owner: 'alex@example.com',
    participants: [],
    dueDate: null,
  })
})
