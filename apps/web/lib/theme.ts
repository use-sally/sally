import type { CSSProperties } from 'react'

export type ThemeMode = 'dark' | 'light'

export const darkTheme = {
  color: {
    appBg: '#020617',
    textPrimary: '#d1fae5',
    textSecondary: 'rgba(209, 250, 229, 0.62)',
    textMuted: 'rgba(209, 250, 229, 0.56)',
    formBg: 'rgba(3, 7, 18, 0.96)',
    formText: '#ecfdf5',
    formPlaceholder: 'rgba(209, 250, 229, 0.52)',
    formBorder: 'rgba(16, 185, 129, 0.16)',
    formBorderFocus: 'rgba(52, 211, 153, 0.72)',
    formRing: 'rgba(16, 185, 129, 0.18)',
    dangerText: '#ef4444',
    sortHeaderActive: '#ecfdf5',
    sortHeaderInactive: 'rgba(209, 250, 229, 0.56)',
    taskTitle: '#fde68a',
    checkboxBorder: 'rgba(52, 211, 153, 0.72)',
    checkboxBg: 'rgba(2, 6, 23, 0.96)',
    checkboxFill: '#34d399',
    checkboxShadow: 'rgba(16, 185, 129, 0.08)',
    calendarIconFilter: 'invert(1) brightness(0.9)',
    optionBg: '#020617',
    pageBg: '#020617',
    panelBg: 'rgba(3, 7, 18, 0.92)',
    panelBorder: 'rgba(16, 185, 129, 0.14)',
    panelText: '#d1fae5',
    panelShadow: '0 0 0 1px rgba(16, 185, 129, 0.05), 0 18px 50px rgba(16, 185, 129, 0.12)',
    tagBg: 'rgba(250, 204, 21, 0.10)',
    tagText: '#fde68a',
    tagBorder: 'rgba(250, 204, 21, 0.18)',
    taskRowActiveBg: 'rgba(250, 204, 21, 0.16)',
  },
} as const

export const lightTheme = {
  color: {
    appBg: '#f8fafc',
    textPrimary: '#0f172a',
    textSecondary: 'rgba(15, 23, 42, 0.72)',
    textMuted: 'rgba(15, 23, 42, 0.56)',
    formBg: '#ffffff',
    formText: '#0f172a',
    formPlaceholder: 'rgba(15, 23, 42, 0.46)',
    formBorder: 'rgba(15, 23, 42, 0.14)',
    formBorderFocus: 'rgba(5, 150, 105, 0.72)',
    formRing: 'rgba(16, 185, 129, 0.16)',
    dangerText: '#dc2626',
    sortHeaderActive: '#0f172a',
    sortHeaderInactive: 'rgba(15, 23, 42, 0.52)',
    taskTitle: '#92400e',
    checkboxBorder: 'rgba(5, 150, 105, 0.72)',
    checkboxBg: '#ffffff',
    checkboxFill: '#059669',
    checkboxShadow: 'rgba(15, 23, 42, 0.06)',
    calendarIconFilter: 'none',
    optionBg: '#ffffff',
    pageBg: '#f8fafc',
    panelBg: '#ffffff',
    panelBorder: 'rgba(15, 23, 42, 0.1)',
    panelText: '#0f172a',
    panelShadow: '0 0 0 1px rgba(16, 185, 129, 0.04), 0 18px 40px rgba(16, 185, 129, 0.08)',
    tagBg: '#FEF3C7',
    tagText: '#B45309',
    tagBorder: '#FCD34D',
    taskRowActiveBg: 'rgba(250, 204, 21, 0.10)',
  },
} as const

export const theme = darkTheme

const radius = {
  sm: 8,
  md: 10,
  lg: 12,
} as const

const spacing = {
  smY: '8px',
  smX: '10px',
  mdY: '10px',
  mdX: '12px',
} as const

const fontSize = {
  xs: 12,
  sm: 14,
} as const

export const projectInputField: CSSProperties = {
  width: '100%',
  border: '1px solid var(--form-border)',
  borderRadius: radius.md,
  padding: `${spacing.smY} ${spacing.smX}`,
  background: 'var(--form-bg)',
  color: 'var(--form-text)',
  fontSize: fontSize.sm,
}

export const formControlMd: CSSProperties = {
  ...projectInputField,
  borderRadius: radius.lg,
  padding: `${spacing.mdY} ${spacing.mdX}`,
}

export const formControlSm: CSSProperties = {
  ...projectInputField,
}

export const formControlCell: CSSProperties = {
  ...projectInputField,
  borderRadius: radius.sm,
  padding: '6px 8px',
}

export const deleteTextAction: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: 'var(--danger-text)',
  fontSize: fontSize.sm,
  fontWeight: 400,
  cursor: 'pointer',
}

export const archiveTextAction: CSSProperties = {
  background: 'transparent',
  border: 'none',
  padding: 0,
  color: 'var(--text-secondary)',
  fontSize: fontSize.sm,
  fontWeight: 400,
  cursor: 'pointer',
}

export function sortableHeaderButton(active: boolean): CSSProperties {
  return {
    background: 'transparent',
    border: 'none',
    textAlign: 'left',
    color: active ? 'var(--sort-header-active)' : 'var(--sort-header-inactive)',
    fontSize: 13,
    fontWeight: active ? 800 : 700,
    padding: 0,
    cursor: 'pointer',
  }
}

export const taskTitleText: CSSProperties = {
  color: 'var(--task-title)',
}

export const labelText: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: fontSize.xs,
  fontWeight: 700,
}

export const metaLabelText: CSSProperties = {
  ...labelText,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
}

export const sectionLabelText: CSSProperties = {
  ...labelText,
  fontSize: 14,
  fontWeight: 750,
}

export const sectionHeaderRow: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
}

export const infoFlagIconButton: CSSProperties = {
  listStyle: 'none',
  cursor: 'pointer',
  color: 'var(--text-muted)',
  fontSize: 12,
  fontWeight: 700,
  lineHeight: 1,
  userSelect: 'none',
}

export const infoFlagPopover: CSSProperties = {
  position: 'absolute',
  top: 20,
  zIndex: 20,
  width: 280,
  padding: 10,
  borderRadius: 12,
  border: '1px solid var(--panel-border)',
  background: 'var(--panel-bg)',
  boxShadow: 'var(--panel-shadow)',
}

export const infoFlagText: CSSProperties = {
  color: 'var(--text-muted)',
  fontSize: 12,
  fontWeight: 500,
  textTransform: 'none',
  letterSpacing: 'normal',
  lineHeight: 1.45,
}

function varsFor(mode: ThemeMode) {
  const palette = mode === 'light' ? lightTheme.color : darkTheme.color
  return `
    --app-bg: ${palette.appBg};
    --text-primary: ${palette.textPrimary};
    --text-secondary: ${palette.textSecondary};
    --text-muted: ${palette.textMuted};
    --form-bg: ${palette.formBg};
    --form-text: ${palette.formText};
    --form-placeholder: ${palette.formPlaceholder};
    --form-border: ${palette.formBorder};
    --form-border-focus: ${palette.formBorderFocus};
    --form-ring: ${palette.formRing};
    --danger-text: ${palette.dangerText};
    --sort-header-active: ${palette.sortHeaderActive};
    --sort-header-inactive: ${palette.sortHeaderInactive};
    --task-title: ${palette.taskTitle};
    --checkbox-border: ${palette.checkboxBorder};
    --checkbox-bg: ${palette.checkboxBg};
    --checkbox-fill: ${palette.checkboxFill};
    --checkbox-shadow: ${palette.checkboxShadow};
    --calendar-icon-filter: ${palette.calendarIconFilter};
    --option-bg: ${palette.optionBg};
    --page-bg: ${palette.pageBg};
    --panel-bg: ${palette.panelBg};
    --panel-border: ${palette.panelBorder};
    --panel-text: ${palette.panelText};
    --panel-shadow: ${palette.panelShadow};
    --tag-bg: ${palette.tagBg};
    --tag-text: ${palette.tagText};
    --tag-border: ${palette.tagBorder};
    --task-row-active-bg: ${palette.taskRowActiveBg};
  `
}

export const appThemeCss = `
:root {
${varsFor('dark')}
}

html[data-theme='light'] {
${varsFor('light')}
}

html, body {
  background: var(--app-bg);
  color: var(--text-primary);
}

input, textarea, select, button {
  font: inherit;
}

input[type='checkbox'] {
  appearance: none;
  -webkit-appearance: none;
  box-sizing: border-box;
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  min-height: 16px !important;
  max-width: 16px !important;
  max-height: 16px !important;
  margin: 0;
  padding: 0;
  border: 1px solid var(--checkbox-border);
  border-radius: 0 !important;
  background: var(--checkbox-bg);
  display: inline-grid;
  place-items: center;
  flex: 0 0 16px;
  flex-shrink: 0;
  line-height: 1;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px var(--checkbox-shadow);
}

input[type='checkbox']::before {
  content: '';
  width: 8px;
  height: 8px;
  transform: scale(0);
  transition: transform 120ms ease-in-out;
  background: var(--checkbox-fill);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--checkbox-fill) 28%, transparent);
}

input[type='checkbox']:checked::before {
  transform: scale(1);
}

input[type='checkbox']:focus {
  outline: none;
  box-shadow: 0 0 0 2px var(--form-ring);
}

input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']),
textarea,
select {
  color: var(--form-text) !important;
  -webkit-text-fill-color: var(--form-text) !important;
  caret-color: var(--form-text) !important;
  background: var(--form-bg) !important;
  border-color: var(--form-border) !important;
}

input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file'])::placeholder,
textarea::placeholder {
  color: var(--form-placeholder) !important;
  -webkit-text-fill-color: var(--form-placeholder) !important;
  opacity: 1;
}

input:-webkit-autofill,
input:-webkit-autofill:hover,
input:-webkit-autofill:focus,
textarea:-webkit-autofill,
textarea:-webkit-autofill:hover,
textarea:-webkit-autofill:focus,
select:-webkit-autofill,
select:-webkit-autofill:hover,
select:-webkit-autofill:focus {
  -webkit-text-fill-color: var(--form-text) !important;
  box-shadow: 0 0 0 1000px var(--form-bg) inset !important;
  -webkit-box-shadow: 0 0 0 1000px var(--form-bg) inset !important;
  caret-color: var(--form-text) !important;
  border-color: var(--form-border) !important;
  transition: background-color 99999s ease-in-out 0s;
}

input:not([type='checkbox']):not([type='radio']):not([type='range']):not([type='file']):focus,
textarea:focus,
select:focus {
  outline: none;
  border-color: var(--form-border-focus) !important;
  box-shadow: 0 0 0 2px var(--form-ring);
}

select,
input[type='date'],
input[type='datetime-local'],
input[type='time'],
input[type='month'],
input[type='week'] {
  color-scheme: dark;
}

html[data-theme='light'] select,
html[data-theme='light'] input[type='date'],
html[data-theme='light'] input[type='datetime-local'],
html[data-theme='light'] input[type='time'],
html[data-theme='light'] input[type='month'],
html[data-theme='light'] input[type='week'] {
  color-scheme: light;
}

input[type='date']::-webkit-datetime-edit,
input[type='date']::-webkit-datetime-edit-text,
input[type='date']::-webkit-datetime-edit-month-field,
input[type='date']::-webkit-datetime-edit-day-field,
input[type='date']::-webkit-datetime-edit-year-field,
input[type='datetime-local']::-webkit-datetime-edit,
input[type='time']::-webkit-datetime-edit,
input[type='month']::-webkit-datetime-edit,
input[type='week']::-webkit-datetime-edit {
  color: var(--form-text) !important;
  -webkit-text-fill-color: var(--form-text) !important;
}

input[type='date']::-webkit-calendar-picker-indicator,
input[type='datetime-local']::-webkit-calendar-picker-indicator,
input[type='time']::-webkit-calendar-picker-indicator,
input[type='month']::-webkit-calendar-picker-indicator,
input[type='week']::-webkit-calendar-picker-indicator {
  filter: var(--calendar-icon-filter);
  opacity: 0.85;
}

option,
optgroup {
  background: var(--option-bg);
  color: var(--form-text);
}

.status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
  background: var(--status-bg-dark);
  color: var(--status-text-dark);
  border-color: var(--status-border-dark);
}

.status-theme-surface {
  background: var(--status-bg-dark);
  color: var(--status-text-dark);
  border-color: var(--status-border-dark);
}

html[data-theme='light'] .status-chip,
html[data-theme='light'] .status-theme-surface {
  background: var(--status-bg-light);
  color: var(--status-text-light);
  border-color: var(--status-border-light);
}

.ProseMirror p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: var(--text-muted);
  float: left;
  height: 0;
  pointer-events: none;
  white-space: pre-wrap;
}
`;
