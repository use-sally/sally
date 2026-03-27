import type { CSSProperties } from 'react'

export type StatusColorPair = {
  id: string
  darkBg: string
  darkText: string
  lightBg: string
  lightText: string
}

export const STATUS_COLOR_PAIRS: StatusColorPair[] = [
  { id: 'slate', darkBg: '#111827', darkText: '#D1D5DB', lightBg: '#E5E7EB', lightText: '#374151' },
  { id: 'gray', darkBg: '#1F2937', darkText: '#E5E7EB', lightBg: '#E2E8F0', lightText: '#334155' },
  { id: 'blue', darkBg: '#172554', darkText: '#93C5FD', lightBg: '#DBEAFE', lightText: '#1D4ED8' },
  { id: 'teal', darkBg: '#0F766E', darkText: '#99F6E4', lightBg: '#CCFBF1', lightText: '#0F766E' },
  { id: 'green', darkBg: '#14532D', darkText: '#86EFAC', lightBg: '#DCFCE7', lightText: '#166534' },
  { id: 'emerald', darkBg: '#064E3B', darkText: '#A7F3D0', lightBg: '#D1FAE5', lightText: '#047857' },
  { id: 'amber', darkBg: '#422006', darkText: '#FCD34D', lightBg: '#FEF3C7', lightText: '#B45309' },
  { id: 'orange', darkBg: '#713F12', darkText: '#FDE68A', lightBg: '#FFEDD5', lightText: '#C2410C' },
  { id: 'rose', darkBg: '#4C0519', darkText: '#FDA4AF', lightBg: '#FFE4E6', lightText: '#BE123C' },
  { id: 'zinc', darkBg: '#3F3F46', darkText: '#E4E4E7', lightBg: '#E4E4E7', lightText: '#3F3F46' },
]

export function canonicalStatusColor(color?: string | null) {
  if (!color) return null
  const normalized = color.trim().toUpperCase()
  const pair = STATUS_COLOR_PAIRS.find((entry) => entry.darkBg.toUpperCase() === normalized || entry.lightBg.toUpperCase() === normalized)
  return pair?.darkBg ?? normalized
}

export function resolveStatusPair(color?: string | null) {
  if (!color) return null
  const normalized = color.trim().toUpperCase()
  return STATUS_COLOR_PAIRS.find((entry) => entry.darkBg.toUpperCase() === normalized || entry.lightBg.toUpperCase() === normalized) ?? null
}

export function resolveStatusThemeColors(color?: string | null) {
  const pair = resolveStatusPair(color)
  if (pair) {
    return {
      dark: { background: pair.darkText, color: pair.darkBg, border: pair.darkText },
      light: { background: pair.lightBg, color: pair.lightText, border: pair.lightBg },
    }
  }

  return {
    dark: { background: 'var(--form-bg)', color: 'var(--text-primary)', border: 'var(--form-border)' },
    light: { background: 'var(--form-bg)', color: 'var(--text-primary)', border: 'var(--form-border)' },
  }
}

export function statusThemeVars(color?: string | null): CSSProperties {
  const resolved = resolveStatusThemeColors(color)
  return {
    ['--status-bg-dark' as any]: resolved.dark.background,
    ['--status-text-dark' as any]: resolved.dark.color,
    ['--status-border-dark' as any]: resolved.dark.border,
    ['--status-bg-light' as any]: resolved.light.background,
    ['--status-text-light' as any]: resolved.light.color,
    ['--status-border-light' as any]: resolved.light.border,
  }
}

export function statusChipStyle(color?: string | null): CSSProperties {
  return {
    ...statusThemeVars(color),
    borderWidth: 1,
    borderStyle: 'solid',
  }
}
