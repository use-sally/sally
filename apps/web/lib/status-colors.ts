const STATUS_COLOR_PRESETS = [
  { bg: '#FDE2E4', text: '#7F1D1D' },
  { bg: '#FEEBC8', text: '#7C2D12' },
  { bg: '#FEF3C7', text: '#78350F' },
  { bg: '#DCFCE7', text: '#166534' },
  { bg: '#D1FAE5', text: '#065F46' },
  { bg: '#DBEAFE', text: '#1E3A8A' },
  { bg: '#E0E7FF', text: '#3730A3' },
  { bg: '#F3E8FF', text: '#6B21A8' },
  { bg: '#FCE7F3', text: '#9D174D' },
  { bg: '#E2E8F0', text: '#334155' },
] as const

export function statusTextColor(bg?: string | null) {
  return STATUS_COLOR_PRESETS.find((preset) => preset.bg.toLowerCase() === (bg || '').toLowerCase())?.text || '#334155'
}

export function statusChipStyle(bg?: string | null): React.CSSProperties {
  const background = bg || '#f8fafc'
  return {
    background,
    color: statusTextColor(bg),
    borderRadius: 999,
    padding: '5px 10px',
    fontSize: 12,
    fontWeight: 700,
    display: 'inline-flex',
    alignItems: 'center',
  }
}
