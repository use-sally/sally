'use client'

import type React from 'react'
import { useEffect, useRef, useState } from 'react'
import { infoFlagIconButton, infoFlagPopover, infoFlagText, sectionHeaderRow } from '../lib/theme'

export function InfoFlag({ text, align = 'right' }: { text: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) return

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [open])

  return (
    <div ref={rootRef} style={{ position: 'relative' }}>
      <button
        type="button"
        aria-label="More info"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        style={infoFlagIconButton}
      >
        ⓘ
      </button>
      {open ? (
        <div style={{ ...infoFlagPopover, ...(align === 'left' ? { left: 0 } : { right: 0 }) }}>
          <div style={infoFlagText}>{text}</div>
        </div>
      ) : null}
    </div>
  )
}

export function SectionHeaderWithInfo({ title, info, marginBottom = 0, align = 'right' }: { title: string; info?: string; marginBottom?: number; align?: 'left' | 'right' }) {
  return (
    <div style={{ ...sectionHeaderRow, marginBottom }}>
      <div style={{ fontWeight: 750 }}>{title}</div>
      {info ? <InfoFlag text={info} align={align} /> : null}
    </div>
  )
}
