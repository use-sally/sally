'use client'

import type React from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { infoFlagIconButton, infoFlagPopover, infoFlagText, sectionHeaderRow } from '../lib/theme'

export function InfoFlag({ text, align = 'right' }: { text: string; align?: 'left' | 'right' }) {
  const [open, setOpen] = useState(false)
  const [popoverPosition, setPopoverPosition] = useState<{ top: number; left: number } | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  const updatePopoverPosition = useCallback(() => {
    const root = rootRef.current
    if (!root) return
    const rect = root.getBoundingClientRect()
    const width = 280
    const viewportPadding = 12
    const preferredLeft = align === 'left' ? rect.left : rect.right - width
    const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding)
    setPopoverPosition({
      top: Math.min(window.innerHeight - viewportPadding, rect.bottom + 6),
      left: Math.min(Math.max(preferredLeft, viewportPadding), maxLeft),
    })
  }, [align])

  useEffect(() => {
    if (!open) return
    updatePopoverPosition()

    const handlePointerDown = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }

    document.addEventListener('mousedown', handlePointerDown)
    window.addEventListener('resize', updatePopoverPosition)
    window.addEventListener('scroll', updatePopoverPosition, true)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      window.removeEventListener('resize', updatePopoverPosition)
      window.removeEventListener('scroll', updatePopoverPosition, true)
    }
  }, [open, updatePopoverPosition])

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
        <div style={{ ...infoFlagPopover, position: 'fixed', top: popoverPosition?.top ?? 0, left: popoverPosition?.left ?? 0 }}>
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
