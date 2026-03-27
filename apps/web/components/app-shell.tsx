'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { ReactNode, useEffect, useRef, useState } from 'react'
import type { Notification } from '@sally/types/src'
import { getWorkspaceId, loadSession, setWorkspaceId } from '../lib/auth'
import { apiUrl, getNotifications, readAllNotifications, readNotification } from '../lib/api'
import { useProjectsQuery } from '../lib/query'
import { workspaceRoleLabel } from '../lib/roles'
import type { ThemeMode } from '../lib/theme'
import { appBuildTime, appVersionLabel } from '../lib/version'

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/projects', label: 'Projects' },
  { href: '/clients', label: 'Clients' },
  { href: '/timesheets', label: 'Timesheets' },
  { href: '/workspace', label: 'Workspace' },
]

const monoFont = `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`
const bgGrid = `
  radial-gradient(circle at 20% 0%, rgba(16,185,129,0.12), transparent 28%),
  radial-gradient(circle at 100% 0%, rgba(250,204,21,0.06), transparent 20%),
  linear-gradient(rgba(16,185,129,0.04) 1px, transparent 1px),
  linear-gradient(90deg, rgba(16,185,129,0.04) 1px, transparent 1px),
  var(--page-bg)
`

export function AppShell({ title, subtitle, children, actions }: { title: string; subtitle: string; children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const { data: projects = [] } = useProjectsQuery()
  const [accountName, setAccountName] = useState<string>('')
  const [accountAvatarUrl, setAccountAvatarUrl] = useState<string>('')
  const [workspaceOptions, setWorkspaceOptions] = useState<{ id: string; name: string; role: string }[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('')
  const [themeMode, setThemeMode] = useState<ThemeMode>('dark')
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const [notificationsLoading, setNotificationsLoading] = useState(false)
  const notificationsRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const storedTheme = (typeof window !== 'undefined' ? window.localStorage.getItem('theme-mode') : null) as ThemeMode | null
    const nextTheme: ThemeMode = storedTheme === 'light' ? 'light' : 'dark'
    setThemeMode(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)

    const session = loadSession()
    if (session?.account?.name) setAccountName(session.account.name)
    else if (session?.account?.email) setAccountName(session.account.email)
    if (session?.account?.avatarUrl) setAccountAvatarUrl(session.account.avatarUrl.startsWith('/') ? apiUrl(session.account.avatarUrl) : session.account.avatarUrl)

    const memberships = session?.memberships ?? []
    const options = memberships.map((membership) => ({
      id: membership.workspaceId,
      name: membership.workspaceName,
      role: membership.role,
    }))
    setWorkspaceOptions(options)

    const storedWorkspace = getWorkspaceId()
    const fallbackWorkspace = options[0]?.id
    const nextWorkspace = storedWorkspace || fallbackWorkspace || ''
    if (nextWorkspace) {
      setActiveWorkspaceId(nextWorkspace)
      if (!storedWorkspace) setWorkspaceId(nextWorkspace)
    }
  }, [])

  const handleWorkspaceChange = (nextWorkspaceId: string) => {
    if (!nextWorkspaceId || nextWorkspaceId === activeWorkspaceId) return
    setWorkspaceId(nextWorkspaceId)
    setActiveWorkspaceId(nextWorkspaceId)
    window.location.reload()
  }

  const handleThemeChange = (nextTheme: ThemeMode) => {
    setThemeMode(nextTheme)
    document.documentElement.setAttribute('data-theme', nextTheme)
    window.localStorage.setItem('theme-mode', nextTheme)
  }

  const loadNotifications = async (options?: { unreadOnly?: boolean }) => {
    setNotificationsLoading(true)
    try {
      const items = await getNotifications({ unreadOnly: options?.unreadOnly, limit: 12 })
      setNotifications(items)
    } finally {
      setNotificationsLoading(false)
    }
  }

  useEffect(() => {
    void loadNotifications({ unreadOnly: false })
    const interval = window.setInterval(() => { void loadNotifications({ unreadOnly: false }) }, 30000)
    return () => window.clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!notificationsOpen) return
    const handlePointerDown = (event: MouseEvent) => {
      if (!notificationsRef.current?.contains(event.target as Node)) setNotificationsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [notificationsOpen])

  const unreadCount = notifications.filter((notification) => !notification.readAt).length

  const activeWorkspace = workspaceOptions.find((option) => option.id === activeWorkspaceId)

  const handleNotificationClick = async (notification: Notification) => {
    await readNotification(notification.id)
    setNotifications((current) => current.filter((item) => item.id !== notification.id))
    setNotificationsOpen(false)
    const workspaceQuery = activeWorkspaceId ? `?workspaceId=${encodeURIComponent(activeWorkspaceId)}` : ''
    if (notification.taskId) {
      router.push(`/tasks/${notification.taskId}${workspaceQuery}`)
      return
    }
    if (notification.projectId) {
      router.push(`/projects/${notification.projectId}${workspaceQuery}`)
    }
  }

  return (
    <main
      style={{
        minHeight: '100vh',
        background: bgGrid,
        backgroundSize: 'auto, auto, 32px 32px, 32px 32px, auto',
        color: 'var(--text-primary)',
        fontFamily: monoFont,
      }}
    >
      <style>{`
        @keyframes sally-cursor-blink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }
      `}</style>
      <div style={{ display: 'grid', gridTemplateColumns: '280px 1fr', minHeight: '100vh' }}>
        <aside
          style={{
            background: 'var(--panel-bg)',
            borderRight: '1px solid var(--panel-border)',
            padding: '24px 18px',
            display: 'flex',
            flexDirection: 'column',
            gap: 20,
            minHeight: '100vh',
            maxHeight: '100vh',
            position: 'sticky',
            top: 0,
            backdropFilter: 'blur(10px)',
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-0.03em', color: 'var(--text-primary)', lineHeight: 1 }}>
              sally<span style={{ color: '#34d399', animation: 'sally-cursor-blink 1s steps(1, end) infinite' }}>_</span>
            </div>
            <div style={{ marginTop: 8, color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.5 }}>Minimal control surface for projects, tasks, clients, and time.</div>
            <div title={appBuildTime || undefined} style={{ marginTop: 6, color: 'var(--text-muted)', fontSize: 11, fontWeight: 700 }}>
              v{appVersionLabel()}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
            {workspaceOptions.length ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', color: 'rgba(250, 204, 21, 0.82)', textTransform: 'uppercase' }}>Workspace</div>
                <select
                  value={activeWorkspaceId}
                  onChange={(event) => handleWorkspaceChange(event.target.value)}
                  style={{
                    borderRadius: 12,
                    border: '1px solid var(--form-border)',
                    padding: '10px 12px',
                    fontWeight: 700,
                    background: 'var(--form-bg)',
                    color: 'var(--form-text)',
                    width: '100%',
                    fontFamily: monoFont,
                    outline: 'none',
                  }}
                >
                  {workspaceOptions.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                  ))}
                </select>
                {activeWorkspace ? <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{workspaceRoleLabel(activeWorkspace.role)}</span> : null}
              </div>
            ) : null}

            <nav style={{ display: 'grid', gap: 8 }}>
              {navItems.filter((item) => item.href !== '/projects').map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    style={{
                      display: 'block',
                      padding: '10px 12px',
                      borderRadius: 12,
                      color: active ? '#052e16' : 'var(--text-secondary)',
                      fontWeight: 700,
                      fontSize: 13,
                      lineHeight: 1.2,
                      textDecoration: 'none',
                      background: active ? '#fcd34d' : 'transparent',
                      border: active ? '1px solid rgba(250, 204, 21, 0.5)' : '1px solid transparent',
                    }}
                  >
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, flex: 1 }}>
              <Link
                href="/projects"
                style={{
                  display: 'block',
                  padding: '10px 12px',
                  borderRadius: 12,
                  color: pathname.startsWith('/projects') ? '#052e16' : 'var(--text-secondary)',
                  fontWeight: 700,
                  fontSize: 13,
                  lineHeight: 1.2,
                  textDecoration: 'none',
                  background: pathname.startsWith('/projects') ? '#fcd34d' : 'transparent',
                  border: pathname.startsWith('/projects') ? '1px solid rgba(250, 204, 21, 0.5)' : '1px solid transparent',
                  flex: '0 0 auto',
                }}
              >
                Projects
              </Link>
              <div style={{ display: 'grid', gap: 6, paddingLeft: 4, overflowY: 'auto', minHeight: 0, alignContent: 'start' }}>
                {projects.map((project) => {
                  const projectHref = `/projects/${project.id}`
                  const projectActive = pathname.startsWith(projectHref)
                  return (
                    <Link
                      key={project.id}
                      href={projectHref}
                      style={{
                        display: 'block',
                        padding: '8px 10px',
                        borderRadius: 10,
                        color: projectActive ? 'var(--text-primary)' : 'var(--text-muted)',
                        fontWeight: projectActive ? 700 : 600,
                        fontSize: 12,
                        lineHeight: 1.35,
                        textDecoration: 'none',
                        background: projectActive ? 'rgba(16, 185, 129, 0.08)' : 'transparent',
                        border: projectActive ? '1px solid rgba(16, 185, 129, 0.18)' : '1px solid transparent',
                        boxShadow: projectActive ? 'inset 0 0 0 1px rgba(16, 185, 129, 0.04)' : 'none',
                      }}
                    >
                      {project.name}
                    </Link>
                  )
                })}
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gap: 12, marginTop: 'auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, paddingLeft: 2 }}>
              <a
                href="https://usesally.com/sponsorships"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  color: '#f472b6',
                  fontWeight: 400,
                  fontSize: 13,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true" style={{ display: 'block', flex: '0 0 auto' }}>
                  <rect x="2" y="1" width="2" height="2" fill="#f472b6" />
                  <rect x="4" y="1" width="2" height="2" fill="#f472b6" />
                  <rect x="8" y="1" width="2" height="2" fill="#f472b6" />
                  <rect x="10" y="1" width="2" height="2" fill="#f472b6" />
                  <rect x="1" y="3" width="2" height="2" fill="#f472b6" />
                  <rect x="3" y="3" width="2" height="2" fill="#f472b6" />
                  <rect x="5" y="3" width="2" height="2" fill="#f472b6" />
                  <rect x="7" y="3" width="2" height="2" fill="#f472b6" />
                  <rect x="9" y="3" width="2" height="2" fill="#f472b6" />
                  <rect x="11" y="3" width="2" height="2" fill="#f472b6" />
                  <rect x="2" y="5" width="2" height="2" fill="#f472b6" />
                  <rect x="4" y="5" width="2" height="2" fill="#f472b6" />
                  <rect x="6" y="5" width="2" height="2" fill="#f472b6" />
                  <rect x="8" y="5" width="2" height="2" fill="#f472b6" />
                  <rect x="10" y="5" width="2" height="2" fill="#f472b6" />
                  <rect x="3" y="7" width="2" height="2" fill="#f472b6" />
                  <rect x="5" y="7" width="2" height="2" fill="#f472b6" />
                  <rect x="7" y="7" width="2" height="2" fill="#f472b6" />
                  <rect x="9" y="7" width="2" height="2" fill="#f472b6" />
                  <rect x="4" y="9" width="2" height="2" fill="#f472b6" />
                  <rect x="6" y="9" width="2" height="2" fill="#f472b6" />
                  <rect x="8" y="9" width="2" height="2" fill="#f472b6" />
                  <rect x="5" y="11" width="2" height="2" fill="#f472b6" />
                  <rect x="7" y="11" width="2" height="2" fill="#f472b6" />
                </svg>
                <span>sally</span>
              </a>

              <a
                href="https://usesally.com/docs"
                target="_blank"
                rel="noreferrer"
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  color: '#6ee7b7',
                  fontWeight: 400,
                  fontSize: 13,
                  textDecoration: 'none',
                  cursor: 'pointer',
                }}
              >
                Docs
              </a>
            </div>

            <Link
              href="/profile"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                borderRadius: 14,
                color: pathname.startsWith('/profile') ? '#052e16' : 'var(--text-primary)',
                fontWeight: 700,
                fontSize: 13,
                textDecoration: 'none',
                background: pathname.startsWith('/profile') ? '#fcd34d' : 'var(--panel-bg)',
                border: pathname.startsWith('/profile') ? '1px solid rgba(250, 204, 21, 0.5)' : '1px solid var(--panel-border)',
              }}
            >
              <div style={{ width: 32, height: 32, borderRadius: 999, overflow: 'hidden', background: pathname.startsWith('/profile') ? 'rgba(5, 46, 22, 0.14)' : 'rgba(16, 185, 129, 0.08)', display: 'grid', placeItems: 'center', color: pathname.startsWith('/profile') ? '#052e16' : '#6ee7b7', flex: '0 0 auto' }}>
                {accountAvatarUrl ? <img src={accountAvatarUrl} alt={accountName || 'Profile'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (accountName?.trim()?.[0] || '?').toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div>Profile</div>
                {accountName ? <div style={{ fontSize: 11, fontWeight: 600, opacity: pathname.startsWith('/profile') ? 0.8 : 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{accountName}</div> : null}
              </div>
            </Link>
          </div>
        </aside>

        <section style={{ padding: '28px 32px 40px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28, gap: 16 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: '#fcd34d', marginBottom: 8 }}>runtime / workspace</div>
              <div style={{ fontSize: 30, fontWeight: 750, letterSpacing: '-0.03em', color: 'var(--text-primary)' }}>{title}</div>
              <div style={{ marginTop: 6, color: 'var(--text-secondary)', fontSize: 14 }}>{subtitle}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => handleThemeChange(themeMode === 'dark' ? 'light' : 'dark')}
                aria-label={`Switch theme from ${themeMode} to ${themeMode === 'dark' ? 'light' : 'dark'}`}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '7px 10px',
                  borderRadius: 10,
                  border: '1px solid var(--form-border)',
                  background: 'var(--form-bg)',
                  color: 'var(--form-text)',
                  cursor: 'pointer',
                  fontWeight: 400,
                  fontSize: 12,
                }}
              >
                <span style={{ color: themeMode === 'dark' ? 'var(--text-primary)' : 'var(--text-muted)' }}>dark</span>
                <span style={{ color: 'var(--text-muted)' }}>:</span>
                <span style={{ color: themeMode === 'light' ? 'var(--text-primary)' : 'var(--text-muted)' }}>light</span>
              </button>
              <div ref={notificationsRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => {
                    const next = !notificationsOpen
                    setNotificationsOpen(next)
                    if (next) void loadNotifications({ unreadOnly: false })
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '7px 10px',
                    borderRadius: 10,
                    border: '1px solid var(--form-border)',
                    background: 'var(--form-bg)',
                    color: 'var(--form-text)',
                    cursor: 'pointer',
                    fontWeight: 400,
                    fontSize: 12,
                  }}
                >
                  <span>🔔</span>
                  <span>Notifications</span>
                  <span style={{ fontSize: 12, fontWeight: 400, color: unreadCount ? '#fcd34d' : 'var(--text-muted)' }}>{unreadCount || '0'}</span>
                </button>
                {notificationsOpen ? (
                  <div style={{ position: 'absolute', top: 'calc(100% + 8px)', right: 0, width: 360, maxWidth: 'min(420px, calc(100vw - 48px))', zIndex: 30, border: '1px solid var(--panel-border)', borderRadius: 14, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', overflow: 'hidden' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', borderBottom: '1px solid var(--panel-border)' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)' }}>Latest notifications</div>
                      <button type="button" onClick={() => void readAllNotifications().then(() => { setNotifications([]); setNotificationsOpen(false) })} style={{ background: 'transparent', border: 'none', color: 'var(--text-secondary)', fontSize: 12, cursor: 'pointer' }}>Mark all read</button>
                    </div>
                    <div style={{ maxHeight: 320, overflowY: 'auto' }}>
                      {notificationsLoading ? <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>Loading…</div> : null}
                      {!notificationsLoading && !notifications.length ? <div style={{ padding: 12, color: 'var(--text-muted)', fontSize: 12 }}>No notifications yet.</div> : null}
                      {notifications.map((notification) => (
                        <button
                          key={notification.id}
                          type="button"
                          onClick={() => void handleNotificationClick(notification)}
                          style={{ width: '100%', textAlign: 'left', padding: '12px', border: 'none', borderBottom: '1px solid var(--panel-border)', background: notification.readAt ? 'transparent' : 'rgba(16, 185, 129, 0.08)', cursor: 'pointer' }}
                        >
                          <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)' }}>{notification.title}</div>
                          <div style={{ marginTop: 4, fontSize: 12, color: 'var(--text-secondary)' }}>{notification.body}</div>
                          <div style={{ marginTop: 6, fontSize: 11, color: 'var(--text-muted)' }}>{new Date(notification.createdAt).toLocaleString()}</div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
              {actions ?? null}
            </div>
          </header>
          {children}
        </section>
      </div>
    </main>
  )
}

export const panel: React.CSSProperties = {
  background: 'var(--panel-bg)',
  border: '1px solid var(--panel-border)',
  borderRadius: 18,
  boxShadow: 'var(--panel-shadow)',
  padding: 18,
  minWidth: 0,
  color: 'var(--panel-text)',
}

export const panelHeader: React.CSSProperties = {
  padding: '16px 18px 12px',
  fontWeight: 750,
  fontSize: 15,
  color: 'var(--text-primary)',
  borderBottom: '1px solid var(--panel-border)',
}

export function pill(bg: string, color: string): React.CSSProperties {
  return {
    background: bg,
    color,
    borderRadius: 999,
    padding: '5px 10px',
    fontSize: 11,
    fontWeight: 700,
    border: '1px solid rgba(255,255,255,0.08)',
  }
}

export function tagStyle(): React.CSSProperties {
  return {
    display: 'inline-flex',
    alignItems: 'center',
    background: 'var(--tag-bg)',
    color: 'var(--tag-text)',
    border: '1px solid var(--tag-border)',
    borderRadius: 999,
    padding: '4px 10px',
    fontSize: 11,
    fontWeight: 600,
  }
}

export function priorityStars(priority: 'P1' | 'P2' | 'P3'): string {
  const value = priority === 'P1' ? 3 : priority === 'P2' ? 2 : 1
  return '★'.repeat(value) + '☆'.repeat(3 - value)
}
