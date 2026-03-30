'use client'

import { useState } from 'react'

export function DocsCopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false)

  async function onCopy() {
    await navigator.clipboard.writeText(code)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1600)
  }

  return (
    <button
      onClick={onCopy}
      style={{
        border: '1px solid rgba(125, 211, 252, 0.24)',
        background: copied ? 'rgba(16, 185, 129, 0.18)' : 'rgba(12, 20, 18, 0.9)',
        color: copied ? '#a7f3d0' : '#d1fae5',
        borderRadius: 10,
        padding: '8px 10px',
        fontSize: 12,
        fontWeight: 700,
        cursor: 'pointer',
      }}
    >
      {copied ? 'Copied' : 'Copy'}
    </button>
  )
}
