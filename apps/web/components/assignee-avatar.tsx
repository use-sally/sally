'use client'

import { apiUrl } from '../lib/api'

export function AssigneeAvatar({ name, avatarUrl, size = 28 }: { name: string; avatarUrl?: string | null; size?: number }) {
  const src = avatarUrl ? (avatarUrl.startsWith('/') ? apiUrl(avatarUrl) : avatarUrl) : ''
  const initial = (name?.trim()?.[0] || '?').toUpperCase()

  return (
    <div title={name} style={{ width: size, height: size, borderRadius: 999, overflow: 'hidden', background: '#e2e8f0', color: '#475569', display: 'grid', placeItems: 'center', fontSize: Math.max(12, Math.round(size * 0.42)), fontWeight: 700, flex: '0 0 auto' }}>
      {src ? <img src={src} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : initial}
    </div>
  )
}
