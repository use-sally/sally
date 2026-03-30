'use client'

import { useEffect, useRef, useState } from 'react'
import { AppShell, panel } from '../../components/app-shell'
import { InfoFlag, SectionHeaderWithInfo } from '../../components/info-flag'
import { PersonalApiKeysPanel } from '../../components/personal-api-keys-panel'
import { apiUrl, getNotificationPreferences, getProfile, logout, updateNotificationPreferences, updateProfile, uploadProfileImage } from '../../lib/api'
import { platformRoleLabel } from '../../lib/roles'
import { labelText, projectInputField, sectionLabelText } from '../../lib/theme'

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
  const [profile, setProfile] = useState<{ id: string; name: string | null; email: string; avatarUrl: string | null; pendingEmail: string | null; platformRole?: 'NONE' | 'SUPERADMIN'; emailLocked?: boolean } | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [loading, setLoading] = useState(true)
  const [savingName, setSavingName] = useState(false)
  const [nameSavedAt, setNameSavedAt] = useState<number | null>(null)
  const [sendingEmailApproval, setSendingEmailApproval] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [notificationPreferences, setNotificationPreferences] = useState<{ eventType: string; inAppEnabled: boolean; emailEnabled: boolean }[]>([])

  const load = async () => {
    setLoading(true)
    try {
      const [response, prefs] = await Promise.all([getProfile(), getNotificationPreferences()])
      setProfile(response.profile)
      setName(response.profile.name || '')
      setEmail(response.profile.email)
      setAvatarUrl(response.profile.avatarUrl || '')
      setNotificationPreferences(prefs)
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
      const response = await updateProfile({ avatarUrl: uploaded.url })
      setProfile({ ...response.profile, pendingEmail: response.emailChange?.pendingEmail ?? profile?.pendingEmail ?? null })
      setInfo('Profile image uploaded and saved.')
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

  const handleNameBlur = async () => {
    if (!profile) return
    const trimmedName = name.trim()
    const currentName = profile.name?.trim() || ''
    if (trimmedName === currentName) return
    setSavingName(true)
    setError(null)
    setInfo(null)
    try {
      const response = await updateProfile({ name: trimmedName || undefined })
      setProfile({ ...response.profile, pendingEmail: response.emailChange?.pendingEmail ?? profile.pendingEmail ?? null })
      setName(response.profile.name || '')
      setNameSavedAt(Date.now())
      setInfo('Name saved.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update profile name')
      setName(profile.name || '')
    } finally {
      setSavingName(false)
    }
  }

  const handleSendEmailApproval = async () => {
    if (!profile) return
    const trimmedEmail = email.trim().toLowerCase()
    const currentEmail = profile.email.trim().toLowerCase()
    if (!trimmedEmail || trimmedEmail === currentEmail) return
    setSendingEmailApproval(true)
    setError(null)
    setInfo(null)
    try {
      const response = await updateProfile({ email: trimmedEmail })
      setProfile({ ...response.profile, pendingEmail: response.emailChange?.pendingEmail ?? profile.pendingEmail ?? null })
      setInfo(response.emailChange
        ? (response.emailChange.emailed
          ? `Confirmation sent to ${response.emailChange.pendingEmail}.`
          : `Could not send confirmation email: ${response.emailChange.reason || 'unknown error'}`)
        : 'Email approval requested.')
      await load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request email change approval')
    } finally {
      setSendingEmailApproval(false)
    }
  }

  const handlePreferenceToggle = async (eventType: string, field: 'inAppEnabled' | 'emailEnabled', value: boolean) => {
    const next = notificationPreferences.map((item) => item.eventType === eventType ? { ...item, [field]: value } : item)
    setNotificationPreferences(next)
    try {
      await updateNotificationPreferences(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update notification preferences')
      await load()
    }
  }

  const avatarSrc = avatarUrl ? (avatarUrl.startsWith('/') ? apiUrl(avatarUrl) : avatarUrl) : ''
  const lockedSuperadminEmail = Boolean(profile?.emailLocked)
  const emailChanged = email.trim().toLowerCase() !== (profile?.email.trim().toLowerCase() || '')
  const showNameSaved = Boolean(nameSavedAt && Date.now() - nameSavedAt < 2500)
  const profileInfoText = lockedSuperadminEmail
    ? 'Profile changes save on blur. Profile image uploads save immediately. The configured superadmin email is locked and can only be changed via .env and redeploy.'
    : 'Profile changes save on blur. Profile image uploads save immediately. Email changes require explicit approval sending and are only applied after confirmation.'

  return (
    <AppShell title="Profile" subtitle="Your account, personal API keys, and access context.">
      <div style={{ display: 'grid', gap: 18 }}>
        <div style={{ ...panel, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SectionHeaderWithInfo title="Profile" info={profileInfoText} />
            {loading ? <div style={{ color: 'var(--text-muted)', fontSize: 14 }}>Loading…</div> : null}
          </div>
          {error ? <div style={{ color: 'var(--danger-text)', fontSize: 13 }}>{error}</div> : null}
          {info ? <div style={{ color: 'var(--text-primary)', fontSize: 13 }}>{info}</div> : null}
          <div style={{ display: 'grid', gap: 12, maxWidth: 560 }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                style={{ width: 72, height: 72, borderRadius: 999, background: 'color-mix(in srgb, var(--form-border-focus) 18%, transparent)', overflow: 'hidden', display: 'grid', placeItems: 'center', fontWeight: 700, color: 'var(--text-primary)', border: '1px solid var(--form-border)', padding: 0, cursor: uploadingImage ? 'progress' : 'pointer' }}
                title={uploadingImage ? 'Uploading…' : 'Click to upload or replace profile image'}
              >
                {avatarSrc ? <img src={avatarSrc} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (name?.trim()?.[0] || email?.trim()?.[0] || '?').toUpperCase()}
              </button>
              <input ref={fileInputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleImageUpload(event)} style={{ display: 'none' }} />
            </div>
            <label style={field}>
              <span>Name</span>
              <input value={name} onChange={(event) => setName(event.target.value)} onBlur={() => void handleNameBlur()} style={inputStyle} />
              <div style={{ ...labelText, fontSize: 12 }}>{savingName ? 'Saving name…' : showNameSaved ? 'Saved.' : 'Saves on blur.'}</div>
            </label>
            <label style={field}>
              <span>Email</span>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      setEmail(profile?.email || '')
                      setError(null)
                      setInfo('Email reset to saved value.')
                    }
                  }}
                  type="email"
                  style={{ ...inputStyle, flex: '1 1 260px' }}
                  disabled={lockedSuperadminEmail}
                />
                {!lockedSuperadminEmail && emailChanged ? (
                  <button
                    type="button"
                    onClick={() => void handleSendEmailApproval()}
                    disabled={sendingEmailApproval || loading}
                    style={{
                      background: 'transparent',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--form-border)',
                      borderRadius: 10,
                      padding: '10px 12px',
                      fontWeight: 700,
                      cursor: sendingEmailApproval ? 'progress' : 'pointer',
                    }}
                  >
                    {sendingEmailApproval ? 'Sending…' : 'Send email approval'}
                  </button>
                ) : null}
              </div>
            </label>
            {profile?.pendingEmail ? <div style={{ ...labelText, fontSize: 13 }}>Pending email change: {profile.pendingEmail}</div> : null}
          </div>
        </div>

        <div style={{ ...panel, display: 'grid', gap: 12 }}>
          <div style={sectionLabelText}>Account context</div>
          <div><strong>Platform role:</strong> {platformRoleLabel(profile?.platformRole || 'NONE')}</div>
          <div><strong>Current email:</strong> {profile?.email || '—'}</div>
          <div>
            <button type="button" onClick={() => void handleLogout()} style={{ borderRadius: 12, border: '1px solid var(--form-border)', padding: '10px 12px', fontWeight: 700, background: 'var(--form-bg)', color: 'var(--text-primary)' }}>Log out</button>
          </div>
        </div>

        <div style={{ ...panel, display: 'grid', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={sectionLabelText}>Notifications</div>
            <InfoFlag text="Notification preference changes are applied immediately when you toggle them." />
          </div>
          <div style={{ display: 'grid', gap: 10 }}>
            {notificationPreferences.map((preference) => (
              <div key={preference.eventType} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 120px', gap: 12, alignItems: 'center', padding: '12px 14px', border: '1px solid var(--panel-border)', borderRadius: 14, background: 'var(--form-bg)' }}>
                <div>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{preference.eventType === 'comment.mentioned' ? 'Comment mentions' : 'Task assignments'}</div>
                  <div style={{ ...labelText, marginTop: 4 }}>{preference.eventType === 'comment.mentioned' ? 'Notify me when someone mentions me in a task comment.' : 'Notify me when I am assigned to a task.'}</div>
                </div>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={preference.inAppEnabled} onChange={(event) => void handlePreferenceToggle(preference.eventType, 'inAppEnabled', event.target.checked)} /> In-app</label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-secondary)', fontSize: 13 }}><input type="checkbox" checked={preference.emailEnabled} onChange={(event) => void handlePreferenceToggle(preference.eventType, 'emailEnabled', event.target.checked)} /> Email</label>
              </div>
            ))}
          </div>
        </div>

        <PersonalApiKeysPanel />
      </div>
    </AppShell>
  )
}

const field: React.CSSProperties = { display: 'grid', gap: 6 }
const inputStyle: React.CSSProperties = { ...projectInputField }
