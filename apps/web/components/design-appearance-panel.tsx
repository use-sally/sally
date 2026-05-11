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
          <FontScalePresetTile
            label="Custom"
            previewScale={customSelected ? fontScale : 1.0}
            selected={customSelected}
            tooltip={customSelected ? `Custom · ${Math.round(fontScale * 100)}%` : 'Custom'}
            onClick={enterCustom}
            onHover={() => setHoverScale(fontScale)}
            onLeave={() => setHoverScale(null)}
          />
        </div>

        {effectiveWidth !== null && effectiveHeight !== null ? (
          <div style={{ ...labelText, fontSize: 11, color: 'var(--text-muted)', minHeight: 16 }}>
            {effectiveWidth} × {effectiveHeight}
          </div>
        ) : null}

        <input
          type="range"
          min={FONT_SCALE_MIN}
          max={FONT_SCALE_MAX}
          step={FONT_SCALE_STEP}
          value={roundFontScale(fontScale)}
          onChange={(event) => onChange(Number.parseFloat(event.target.value))}
          aria-label={`Font scale, ${Math.round(fontScale * 100)} percent`}
          style={{ width: '100%', maxWidth: 560 }}
        />
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
