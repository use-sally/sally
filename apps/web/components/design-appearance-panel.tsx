'use client'

import { useState } from 'react'
import { panel } from './app-shell'
import { InfoFlag } from './info-flag'
import { labelText, sectionLabelText } from '../lib/theme'
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_PRESETS,
  FONT_SCALE_STEP,
  STATUS_TINT_MAX,
  STATUS_TINT_MIN,
  matchPreset,
  roundFontScale,
} from '../lib/appearance'

export function DesignAppearancePanel({
  fontScale,
  onChange,
  statusTint,
  onStatusTintChange,
}: {
  fontScale: number
  onChange: (next: number) => void
  statusTint: number
  onStatusTintChange: (next: number) => void
}) {
  const [hoverScale, setHoverScale] = useState<number | null>(null)

  const enterCustom = () => {
    if (matchPreset(fontScale) === 'custom') return
    const bumped = Math.min(FONT_SCALE_MAX, fontScale + FONT_SCALE_STEP)
    const next = matchPreset(bumped) === 'custom' ? bumped : Math.max(FONT_SCALE_MIN, fontScale - FONT_SCALE_STEP)
    onChange(next)
  }

  const customSelected = matchPreset(fontScale) === 'custom'

  return (
    <div style={{ ...panel, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={sectionLabelText}>Design</div>
        <InfoFlag text="Font size is applied immediately and saved to your account. Theme switcher lives in the header." />
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ ...labelText, fontSize: 'var(--font-2xs)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Font size</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{Math.round(fontScale * 100)}%</span>
          {customSelected ? <span style={{ color: 'var(--text-muted)' }}>· custom</span> : null}
        </div>

        <div role="radiogroup" aria-label="Font size preset" className="font-scale-preset-row" style={presetRowStyle}>
          {FONT_SCALE_PRESETS.map((preset) => (
            <FontScalePresetTile
              key={preset.id}
              label={preset.label}
              previewScale={preset.value}
              selected={matchPreset(fontScale) === preset.id}
              tooltip={preset.label || `${Math.round(preset.value * 100)}%`}
              onClick={() => onChange(preset.value)}
              onHover={() => setHoverScale(preset.value)}
              onLeave={() => setHoverScale(null)}
            />
          ))}
          <div
            role="radio"
            aria-checked={customSelected}
            tabIndex={0}
            onClick={enterCustom}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                enterCustom()
              }
            }}
            onMouseEnter={() => setHoverScale(fontScale)}
            onMouseLeave={() => setHoverScale(null)}
            onFocus={() => setHoverScale(fontScale)}
            onBlur={() => setHoverScale(null)}
            className={`font-scale-preset-tile font-scale-custom-tile${customSelected ? ' is-selected' : ''}`}
            title={customSelected ? `Custom · ${Math.round(fontScale * 100)}%` : 'Custom'}
          >
            <FontScaleStepper fontScale={fontScale} onChange={onChange} />
            <div
              style={{
                fontSize: 'var(--font-2xs)',
                fontWeight: customSelected ? 700 : 500,
                color: customSelected ? 'var(--text-primary)' : 'var(--text-muted)',
                textAlign: 'center',
                minHeight: 14,
              }}
            >
              Custom
            </div>
          </div>
        </div>

        <div style={{ ...labelText, fontSize: 'var(--font-2xs)', color: 'var(--text-muted)', minHeight: 16 }}>
          Text size changes do not resize layout, spacing, or sections.
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, paddingTop: 4, borderTop: '1px solid var(--panel-border)' }}>
        <div style={{ ...labelText, fontSize: 'var(--font-2xs)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <span>Status lane background</span>
          <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>{Math.round(statusTint)}%</span>
        </div>
        <input
          type="range"
          min={STATUS_TINT_MIN}
          max={STATUS_TINT_MAX}
          step={1}
          value={statusTint}
          onChange={(event) => onStatusTintChange(Number(event.target.value))}
          aria-label="Status lane background strength"
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: 'var(--font-2xs)', fontWeight: 700 }}>
          <span>0%</span>
          <span>50%</span>
        </div>
        <div style={{ ...labelText, fontSize: 'var(--font-2xs)', color: 'var(--text-muted)' }}>
          Controls the status-color tint behind kanban columns and task status groups.
        </div>
      </div>
    </div>
  )
}

function FontScalePresetTile({
  label,
  previewScale,
  selected,
  tooltip,
  onClick,
  onHover,
  onLeave,
}: {
  label: string
  previewScale: number
  selected: boolean
  tooltip: string
  onClick: () => void
  onHover: () => void
  onLeave: () => void
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onClick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      onFocus={onHover}
      onBlur={onLeave}
      title={tooltip}
      className={`font-scale-preset-tile${selected ? ' is-selected' : ''}`}
    >
      <FontScalePreview scale={previewScale} active={selected} />
      <div
        style={{
          fontSize: 'var(--font-2xs)',
          fontWeight: selected ? 700 : 500,
          color: selected ? 'var(--text-primary)' : 'var(--text-muted)',
          textAlign: 'center',
          minHeight: 14,
        }}
      >
        {label}
      </div>
    </button>
  )
}

function FontScalePreview({ scale, active }: { scale: number; active: boolean }) {
  return (
    <div
      aria-hidden
      style={{
        width: 110,
        height: 80,
        borderRadius: 8,
        border: `2px solid ${active ? 'var(--accent)' : 'var(--panel-border)'}`,
        background: 'var(--form-bg)',
        overflow: 'hidden',
        display: 'grid',
        placeItems: 'center',
        padding: '4px 6px',
        transition: 'border-color 120ms ease',
      }}
    >
      <div
        style={{
          fontSize: Math.round(20 * scale),
          lineHeight: 1.1,
          fontWeight: 700,
          color: 'var(--text-primary)',
          fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, monospace`,
        }}
      >
        Aa
      </div>
    </div>
  )
}

const presetRowStyle = { display: 'flex', gap: 10, overflowX: 'auto', paddingBottom: 4 } as const

function stepCustomScale(current: number, direction: 1 | -1): number {
  let next = roundFontScale(current + direction * FONT_SCALE_STEP)
  while (
    matchPreset(next) !== 'custom' &&
    next > FONT_SCALE_MIN &&
    next < FONT_SCALE_MAX
  ) {
    next = roundFontScale(next + direction * FONT_SCALE_STEP)
  }
  return Math.max(FONT_SCALE_MIN, Math.min(FONT_SCALE_MAX, next))
}

function FontScaleStepper({ fontScale, onChange }: { fontScale: number; onChange: (next: number) => void }) {
  const atMin = roundFontScale(fontScale) <= FONT_SCALE_MIN
  const atMax = roundFontScale(fontScale) >= FONT_SCALE_MAX
  return (
    <div
      className="font-scale-stepper"
      role="group"
      aria-label="Font size"
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        className="font-scale-stepper-btn"
        onClick={() => onChange(stepCustomScale(fontScale, -1))}
        disabled={atMin}
        aria-label="Decrease font size"
      >
        −
      </button>
      <div className="font-scale-stepper-value" aria-live="polite">
        {Math.round(fontScale * 100)}%
      </div>
      <button
        type="button"
        className="font-scale-stepper-btn"
        onClick={() => onChange(stepCustomScale(fontScale, 1))}
        disabled={atMax}
        aria-label="Increase font size"
      >
        +
      </button>
    </div>
  )
}
