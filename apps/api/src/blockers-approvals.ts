import { ApprovalStatus, ApprovalType, BlockerStatus, BlockerType } from '@prisma/client'

const SECRET_KEY_PATTERN = /(?:token|password|secret|private[_-]?key|apikey|api[_-]?key|credentials?|cookie|connection[_-]?string|access[_-]?token|refresh[_-]?token)/i

function assertNoSecretLikeJson(value: unknown, path = '$') {
  if (value == null) return
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretLikeJson(item, `${path}[${index}]`))
    return
  }
  if (typeof value === 'object') {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      const nextPath = `${path}.${key}`
      if (SECRET_KEY_PATTERN.test(key)) throw new Error(`Secret-like key is not allowed at ${nextPath}`)
      assertNoSecretLikeJson(nested, nextPath)
    }
  }
}

function text(value: unknown, field: string, max = 4000) {
  const result = String(value ?? '').trim()
  if (!result) throw new Error(`${field} is required`)
  return result.slice(0, max)
}

function optionalText(value: unknown, max = 4000) {
  const result = String(value ?? '').trim()
  return result ? result.slice(0, max) : null
}

function enumValue<T extends Record<string, string>>(values: T, value: unknown, field: string): T[keyof T] {
  const normalized = String(value ?? '').trim().toUpperCase().replace(/[\s-]+/g, '_')
  const allowed = Object.values(values) as string[]
  if (!allowed.includes(normalized)) throw new Error(`Invalid ${field}: ${value}`)
  return normalized as T[keyof T]
}

export function buildBlockerPayload(input: Record<string, unknown>) {
  assertNoSecretLikeJson(input.metadata)
  return {
    projectId: optionalText(input.projectId, 128),
    taskId: optionalText(input.taskId, 128),
    ownerAgentId: optionalText(input.ownerAgentId, 128),
    type: enumValue(BlockerType, input.type ?? 'AMBIGUITY', 'blocker type'),
    summary: text(input.summary, 'summary'),
    requiredInput: optionalText(input.requiredInput),
    metadata: input.metadata ?? null,
  }
}

export function buildApprovalRequestPayload(input: Record<string, unknown>) {
  assertNoSecretLikeJson(input.options)
  assertNoSecretLikeJson(input.metadata)
  return {
    projectId: optionalText(input.projectId, 128),
    taskId: optionalText(input.taskId, 128),
    requestedByAgentId: optionalText(input.requestedByAgentId, 128),
    type: enumValue(ApprovalType, input.type ?? 'CUSTOMER_DATA', 'approval type'),
    question: text(input.question, 'question'),
    options: input.options ?? null,
    recommendation: optionalText(input.recommendation),
    metadata: input.metadata ?? null,
  }
}

export function buildApprovalDecisionPatch(input: Record<string, unknown>) {
  const status = enumValue(ApprovalStatus, input.status, 'approval status')
  if (![ApprovalStatus.APPROVED, ApprovalStatus.REJECTED, ApprovalStatus.CANCELLED].includes(status as any)) throw new Error(`Invalid approval status: ${input.status}`)
  return { status, decisionNote: optionalText(input.decisionNote) }
}

export function buildBlockerResolutionPatch(input: Record<string, unknown>) {
  const status = enumValue(BlockerStatus, input.status, 'blocker resolution status')
  if (![BlockerStatus.RESOLVED, BlockerStatus.CANCELLED].includes(status as any)) throw new Error(`Invalid blocker resolution status: ${input.status}`)
  return { status }
}
