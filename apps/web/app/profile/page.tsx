'use client'

import { useEffect, useRef, useState } from 'react'
import { AppShell, panel } from '../../components/app-shell'
import { apiUrl, getProfile, logout, updateProfile, uploadProfileImage } from '../../lib/api'
import { platformRoleLabel } from '../../lib/roles'
import { PersonalApiKeysPanel } from '../../components/personal-api-keys-panel'

async function compressProfileImage(file: File): Promise<{ mimeType: string; base64: string; fileName: string }> {
  const imageUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error('Failed to load image'))
      img.src = imageUrl
    })

    const maxLongSide = 1600
    const longSide = Math.max(image.width, image.height)
    const scale = longSide > maxLongSide ? maxLongSide / longSide : 1
    const width = Math.max(1, Math.round(image.width * scale))
    const height = Math.max(1, Math.round(image.height * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('Canvas unavailable')
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(image, 0, 0, width, height)

    const mimeType = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
    const quality = mimeType === 'image/png' ? undefined : 0.82
    const dataUrl = canvas.toDataURL(mimeType, quality)
    const base64 = dataUrl.split(',')[1] || ''
    const baseName = file.name.replace(/\.[^.]+$/, '') || 'profile'
    const ext = mimeType === 'image/png' ? 'png' : 'jpg'
    return { mimeType, base64, fileName: `${baseName}.${ext}` }
  } finally {
    URL.revokeObjectURL(imageUrl)
  }
}

export default function ProfilePage() {
  const [profile, setProfile] = useState<{ id: string; name: string | null; email: string; avatarUrl: string | null; pendingEmail: string | null; platformRole?: 'NONE' | 'SUPERADMIN' } | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)
    try {
      const response = await getProfile()
      setProfile(response.profile)
      setName(response.profile.name || '')
      setEmail(response.profile.email)
      setAvatarUrl(response.profile.avatarUrl || '')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load profile')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
  }, [])

  const handleImageUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    setError(null)
    setInfo(null)
    try {
      const compressed = await compressProfileImage(file)
      const uploaded = await uploadProfileImage(compressed)
      setAvatarUrl(uploaded.url)
      setInfo('Profile image uploaded.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload profile image')
    } finally {
      event.target.value = ''
      setUploadingImage(false)
    }
  }

  const handleLogout = async () => {
    try {
      await logout()
    } finally {
      localStorage.removeItem('atpm_session')
      localStorage.removeItem('atpm_workspace_id')
      window.location.href = '/'
    }
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    setSaving(true)
    setError(null)
    setInfo(null)
    try {
      const response = await updateProfile({ name, email, avatarUrl: avatarUrl || null })
      setProfile({ ...response.profile, pendingEmail: response.emailChange?.pendingEmail ?? profile?.pendingEmail ?? null })
      setInfo(response.emailChange ? (response.emailChange.emailed ? `Profile updated. Confirm the email change via the link sent to ${response.emailChange.pendingEmail}.` : `Profile updated, but the email confirmation mail could not be sent: ${response.emailChange.reason || 'unknown error'}`) : 'Profile updated.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile')
    } finally {
      setSaving(false)
    }
  }

  const avatarSrc = avatarUrl ? (avatarUrl.startsWith('/') ? apiUrl(avatarUrl) : avatarUrl) : ''

  return (
    <AppShell title="Profile" subtitle="Your account, personal API keys, and access context.">
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ ...panel, display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 750 }}>Profile</div>
          {loading ? <div style={{ color: '#64748b', fontSize: 14 }}>Loading…</div> : null}
          {error ? <div style={{ color: '#991b1b', fontSize: 13 }}>{error}</div> : null}
          {info ? <div style={{ color: '#0f172a', fontSize: 13 }}>{info}</div> : null}
          <form onSubmit={handleSubmit} style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                style={{ width: 72, height: 72, borderRadius: 999, background: '#e2e8f0', overflow: 'hidden', display: 'grid', placeItems: 'center', fontWeight: 700, color: '#475569', border: '1px solid #cbd5e1', padding: 0, cursor: uploadingImage ? 'progress' : 'pointer' }}
                title={uploadingImage ? 'Uploading…' : 'Click to upload or replace profile image'}
              >
                {avatarSrc ? <img src={avatarSrc} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name?.trim()?.[0] || email?.trim()?.[0] || '?').toUpperCase()}
              </button>
              <div style={{ color: '#64748b', fontSize: 13 }}>{uploadingImage ? 'Uploading image…' : 'Click the profile image to upload or replace it. Compression matches task description images.'}</div>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleImageUpload(event)} style={{ display: 'none' }} />
            </div>
            <label style={field}><span>Name</span><input value={name} onChange={(event) => setName(event.target.value)} style={inputStyle} /></label>
            <label style={field}><span>Email</span><input value={email} onChange={(event) => setEmail(event.target.value)} type="email" style={inputStyle} /></label>
            {profile?.pendingEmail ? <div style={{ color: '#64748b', fontSize: 13 }}>Pending email change: {profile.pendingEmail}</div> : null}
            <div style={{ color: '#64748b', fontSize: 13 }}>PNG/JPG/WebP supported.</div>
            <div style={{ color: '#64748b', fontSize: 13 }}>If you change your email, we will send a confirmation link to the new address before applying it.</div>
            <div><button type="submit" disabled={saving || loading} style={{ background: '#0f172a', color: '#fff', border: 'none', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }}>{saving ? 'Saving…' : 'Save profile'}</button></div>
          </form>
        </div>

        <div style={{ ...panel, display: 'grid', gap: 12 }}>
          <div style={{ fontWeight: 750 }}>Account context</div>
          <div><strong>Platform role:</strong> {platformRoleLabel(profile?.platformRole || 'NONE')}</div>
          <div><strong>Current email:</strong> {profile?.email || '—'}</div>
          <div>
            <button type="button" onClick={() => void handleLogout()} style={{ borderRadius: 12, border: '1px solid #dbe1ea', padding: '10px 12px', fontWeight: 700, background: '#fff', color: '#0f172a' }}>Log out</button>
          </div>
        </div>

        <PersonalApiKeysPanel />
      </div>
    </AppShell>
  )
}

const field: React.CSSProperties = { display: 'grid', gap: 6 }
const inputStyle: React.CSSProperties = { padding: '10px 12px', borderRadius: 12, border: '1px solid #dbe1ea', fontSize: 14 }
