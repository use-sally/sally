import crypto from 'node:crypto'

const SECRET_KEY_PATTERN=/(?:token|password|secret|private[_-]?key|apikey|api[_-]?key|credentials?|cookie|connection[_-]?string|access[_-]?token|refresh[_-]?token)/i

function slugifyIdentifier(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[_\s]+/g, '-')
    .replace(/[^a-z0-9-]+/g, '')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function normalizeRuntimeType(input?: string | null) {
  const runtime = slugifyIdentifier(input ?? '')
  return runtime || 'custom'
}

export function normalizeCapabilityNames(input?: Array<string | null | undefined> | null) {
  const seen = new Set<string>()
  const result: string[] = []
  for (const value of input ?? []) {
    const capability = slugifyIdentifier(value ?? '')
    if (!capability || seen.has(capability)) continue
    seen.add(capability)
    result.push(capability)
  }
  return result
}

export function findSecretLikeJsonPath(value: unknown, path = '$'): string | null {
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const match = findSecretLikeJsonPath(value[i], `${path}[${i}]`)
      if (match) return match
    }
    return null
  }
  if (!value || typeof value !== 'object') return null
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    const nestedPath = `${path}.${key}`
    if (SECRET_KEY_PATTERN.test(key)) return nestedPath
    const match = findSecretLikeJsonPath(nested, nestedPath)
    if (match) return match
  }
  return null
}

export function assertNoSecretLikeJson(value: unknown, label = 'metadata') {
  const match = findSecretLikeJsonPath(value)
  if (match) throw new Error(`${label} must not contain secret-like key: ${match}`)
}

export function createAgentWorkerToken() {
  return `sallyw_${crypto.randomBytes(32).toString('base64url')}`
}

export function hashAgentWorkerToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function verifyAgentWorkerToken(token: string, tokenHash: string) {
  const provided = Buffer.from(hashAgentWorkerToken(token), 'hex')
  const expected = Buffer.from(tokenHash, 'hex')
  return provided.length === expected.length && crypto.timingSafeEqual(provided, expected)
}

export function buildAgentConnectionPatch(input: {
  name?: string | null
  runtimeType?: string | null
  runtimeVersion?: string | null
  profileRef?: string | null
  capabilities?: Array<string | null | undefined> | null
  metadata?: unknown
}) {
  const data: Record<string, unknown> = {}
  if (input.name !== undefined) data.name = input.name?.trim() || 'Connected agent'
  if (input.runtimeType !== undefined) data.runtimeType = normalizeRuntimeType(input.runtimeType)
  if (input.runtimeVersion !== undefined) data.runtimeVersion = input.runtimeVersion?.trim() || null
  if (input.profileRef !== undefined) data.profileRef = input.profileRef?.trim() || null
  if (input.capabilities !== undefined) data.capabilities = normalizeCapabilityNames(input.capabilities)
  if (input.metadata !== undefined) {
    assertNoSecretLikeJson(input.metadata, 'connection metadata')
    data.metadata = input.metadata ?? null
  }
  return data
}

export function buildAgentEventPayload(type: string, payload: unknown) {
  const eventType = type.trim().toLowerCase()
  if (!eventType) throw new Error('event type is required')
  assertNoSecretLikeJson(payload, 'agent event payload')
  return { type: eventType, payload: payload ?? null }
}

export function chooseAgentEventCursor(input: { queryCursor?: string | null; ackLastEventId?: string | null }) {
  return input.queryCursor?.trim() || input.ackLastEventId?.trim() || ''
}

export function redactAgentConnection(connection: Record<string, any>) {
  const { tokenHash: _tokenHash, ...safe } = connection
  return safe
}
