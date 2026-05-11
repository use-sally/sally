'use client'

import { useEffect, useState } from 'react'
import { panel } from './app-shell'
import { InfoFlag } from './info-flag'
import { labelText, sectionLabelText } from '../lib/theme'
import {
  FONT_SCALE_MAX,
  FONT_SCALE_MIN,
  FONT_SCALE_PRESETS,
  FONT_SCALE_STEP,
  matchPreset,
  roundFontScale,
} from '../lib/appearance'

export function DesignAppearancePanel({
  fontScale,
  onChange,
}: {
  fontScale: number
  onChange: (next: number) => void
}) {
  const [hoverScale, setHoverScale] = useState<number | null>(null)
  const [viewport, setViewport] = useState<{ width: number; height: number } | null>(null)

  useEffect(() => {
    if (typeof window === 'undefined') return
    const measure = () => {
      const zoom = Number((document.documentElement.style as unknown as { zoom?: string }).zoom) || 1
      setViewport({
        width: Math.round(window.innerWidth * zoom),
        height: Math.round(window.innerHeight * zoom),
      })
    }
    measure()
    window.addEventListener('resize', measure)
    return () => window.removeEventListener('resize', measure)
  }, [])

  const enterCustom = () => {
    if (matchPreset(fontScale) === 'custom') return
    const bumped = Math.min(FONT_SCALE_MAX, fontScale + FONT_SCALE_STEP)
    const next = matchPreset(bumped) === 'custom' ? bumped : Math.max(FONT_SCALE_MIN, fontScale - FONT_SCALE_STEP)
    onChange(next)
  }

  const customSelected = matchPreset(fontScale) === 'custom'
  const activeScale = hoverScale ?? fontScale
  const effectiveWidth = viewport ? Math.round(viewport.width / activeScale) : null
  const effectiveHeight = viewport ? Math.round(viewport.height / activeScale) : null

  return (
    <div style={{ ...panel, display: 'grid', gap: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={sectionLabelText}>Design</div>
        <InfoFlag text="Font size is applied immediately and saved to your account. Theme switcher lives in the header." />
      </div>
      <div style={{ display: 'grid', gap: 10 }}>
        <div style={{ ...labelText, fontSize: 11, display: 'flex', alignItems: 'center', gap: 6 }}>
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
                fontSize: 11,
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

        {effectiveWidth !== null && effectiveHeight !== null ? (
          <div style={{ ...labelText, fontSize: 11, color: 'var(--text-muted)', minHeight: 16 }}>
            {effectiveWidth} × {effectiveHeight}
          </div>
        ) : null}
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
          fontSize: 11,
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
