import type { ThemeMode } from './theme'

export type { ThemeMode }

export const FONT_SCALE_MIN = 0.75
export const FONT_SCALE_MAX = 1.5
export const FONT_SCALE_STEP = 0.05
export const FONT_SCALE_DEFAULT = 1.0

export type FontScalePresetId = 'small' | 'standard' | 'large'

export const FONT_SCALE_PRESETS: ReadonlyArray<{ id: FontScalePresetId; label: string; value: number }> = [
  { id: 'standard', label: 'Default', value: 1.0 },
  { id: 'small',    label: 'Small',   value: 0.8 },
  { id: 'large',    label: 'Large',   value: 1.25 },
]

export const STORAGE_FONT_SCALE = 'appearance-font-scale'
export const STORAGE_THEME = 'theme-mode'

export function clampFontScale(value: unknown): number {
  let num: number
  if (typeof value === 'number') num = value
  else if (typeof value === 'string' && value.trim() !== '') num = Number(value)
  else return FONT_SCALE_DEFAULT
  if (!Number.isFinite(num)) return FONT_SCALE_DEFAULT
  return Math.min(FONT_SCALE_MAX, Math.max(FONT_SCALE_MIN, num))
}

export function roundFontScale(value: number): number {
  return Math.round(value * 100) / 100
}

export function matchPreset(value: number): FontScalePresetId | 'custom' {
  const rounded = roundFontScale(value)
  const hit = FONT_SCALE_PRESETS.find((preset) => roundFontScale(preset.value) === rounded)
  return hit ? hit.id : 'custom'
}

export function readStoredFontScale(): number {
  if (typeof window === 'undefined') return FONT_SCALE_DEFAULT
  const raw = window.localStorage.getItem(STORAGE_FONT_SCALE)
  if (!raw) return FONT_SCALE_DEFAULT
  return clampFontScale(Number.parseFloat(raw))
}

export function writeStoredFontScale(value: number) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_FONT_SCALE, String(clampFontScale(value)))
}

export function readStoredTheme(): ThemeMode {
  if (typeof window === 'undefined') return 'dark'
  const raw = window.localStorage.getItem(STORAGE_THEME)
  return raw === 'light' ? 'light' : 'dark'
}

export function writeStoredTheme(value: ThemeMode) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(STORAGE_THEME, value)
}

const FONT_SIZE_BASE = {
  '2xs': 11,
  xs: 12,
  sm: 13,
  md: 14,
  lg: 16,
  xl: 20,
  '2xl': 24,
  '3xl': 30,
} as const

export function scaledFontSize(size: keyof typeof FONT_SIZE_BASE, scale: number) {
  return `${Math.round(FONT_SIZE_BASE[size] * clampFontScale(scale) * 100) / 100}px`
}

export function applyFontScale(value: number) {
  if (typeof document === 'undefined') return
  const scale = clampFontScale(value)
  const root = document.documentElement
  root.style.removeProperty('zoom')
  for (const size of Object.keys(FONT_SIZE_BASE) as Array<keyof typeof FONT_SIZE_BASE>) {
    root.style.setProperty(`--font-${size}`, scaledFontSize(size, scale))
  }
}

export function applyTheme(value: ThemeMode) {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', value)
}
