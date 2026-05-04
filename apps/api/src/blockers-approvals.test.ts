import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildApprovalRequestPayload,
  buildBlockerPayload,
  buildApprovalDecisionPatch,
  buildBlockerResolutionPatch,
} from './blockers-approvals.js'

test('blocker payload normalizes generic fields and rejects secret-like metadata', () => {
  const payload = buildBlockerPayload({
    projectId: 'project_1',
    taskId: 'task_1',
    ownerAgentId: 'agent_1',
    type: 'credential',
    summary: ' Need staging-only credential reference ',
    requiredInput: ' Provide a valid secret reference, not the value. ',
    metadata: { source: 'runtime' },
  })

  assert.equal(payload.projectId, 'project_1')
  assert.equal(payload.type, 'CREDENTIAL')
  assert.equal(payload.summary, 'Need staging-only credential reference')
  assert.equal(payload.requiredInput, 'Provide a valid secret reference, not the value.')
  assert.throws(() => buildBlockerPayload({ summary: 'x', metadata: { apiKey: 'x' } }), /Secret-like key/)
})

test('approval request payload normalizes approval type, options, and recommendation', () => {
  const payload = buildApprovalRequestPayload({
    projectId: 'project_1',
    taskId: 'task_1',
    requestedByAgentId: 'agent_1',
    type: 'live_deploy',
    question: 'Deploy to production?',
    options: ['approve', 'deny'],
    recommendation: 'Approve after tests pass.',
  })

  assert.equal(payload.type, 'LIVE_DEPLOY')
  assert.deepEqual(payload.options, ['approve', 'deny'])
  assert.equal(payload.recommendation, 'Approve after tests pass.')
  assert.throws(() => buildApprovalRequestPayload({ question: 'x', options: [{ password: 'x' }] }), /Secret-like key/)
})

test('approval and blocker decision patches are bounded and generic', () => {
  assert.deepEqual(buildApprovalDecisionPatch({ status: 'approved', decisionNote: 'Ship it' }), {
    status: 'APPROVED',
    decisionNote: 'Ship it',
  })
  assert.deepEqual(buildBlockerResolutionPatch({ status: 'resolved' }), { status: 'RESOLVED' })
  assert.throws(() => buildApprovalDecisionPatch({ status: 'maybe' }), /Invalid approval status/)
  assert.throws(() => buildBlockerResolutionPatch({ status: 'open' }), /Invalid blocker resolution status/)
})
