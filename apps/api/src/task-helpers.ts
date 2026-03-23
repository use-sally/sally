export function normalizeTaskLabels(labels?: string[]): string[] {
  return Array.from(new Set((labels || []).map((s) => s.trim()).filter(Boolean)))
}

export function normalizeTaskTodoTexts(todos?: { text: string }[]): string[] {
  return (todos || []).map((todo) => todo.text?.trim()).filter(Boolean) as string[]
}

export function hasExactTodoOrder(existingIds: string[], orderedTodoIds: string[]): boolean {
  if (!Array.isArray(orderedTodoIds) || !orderedTodoIds.length) return false
  if (orderedTodoIds.length !== existingIds.length) return false
  const existing = new Set(existingIds)
  return orderedTodoIds.every((id) => existing.has(id))
}
