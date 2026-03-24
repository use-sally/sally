'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode, useEffect, useState } from 'react'
import { getWorkspaceId, loadSession, setWorkspaceId } from '../lib/auth'
import { apiUrl } from '../lib/api'
import { useProjectsQuery } from '../lib/query'
import { workspaceRoleLabel } from '../lib/roles'

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/projects', label: 'Projects' },
  { href: '/clients', label: 'Clients' },
  { href: '/timesheets', label: 'Timesheets' },
  { href: '/workspace', label: 'Workspace' },
]

export function AppShell({ title, subtitle, children, actions }: { title: string; subtitle: string; children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname()
  const { data: projects = [] } = useProjectsQuery()
  const [accountName, setAccountName] = useState<string>('')
  const [accountAvatarUrl, setAccountAvatarUrl] = useState<string>('')
  const [workspaceOptions, setWorkspaceOptions] = useState<{ id: string; name: string; role: string }[]>([])
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string>('')

  useEffect(() => {
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

  const activeWorkspace = workspaceOptions.find((option) => option.id === activeWorkspaceId)

  return (
    <main style={{ minHeight: '100vh', background: '#f5f7fb', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: '100vh' }}>
        <aside style={{ background: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 20, minHeight: '100vh', maxHeight: '100vh', position: 'sticky', top: 0 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>AutomateThis PM</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>Workspace</div>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>Low-noise internal product management.</div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, flex: 1, minHeight: 0 }}>
            {workspaceOptions.length ? (
              <div style={{ display: 'grid', gap: 6 }}>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>Workspace</div>
                <select
                  value={activeWorkspaceId}
                  onChange={(event) => handleWorkspaceChange(event.target.value)}
                  style={{ borderRadius: 10, border: '1px solid #dbe1ea', padding: '10px 12px', fontWeight: 700, background: '#fff', width: '100%' }}
                >
                  {workspaceOptions.map((workspace) => (
                    <option key={workspace.id} value={workspace.id}>{workspace.name}</option>
                  ))}
                </select>
                {activeWorkspace ? <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>{workspaceRoleLabel(activeWorkspace.role)}</span> : null}
              </div>
            ) : null}

            <nav style={{ display: 'grid', gap: 8 }}>
              {navItems.filter((item) => item.href !== '/projects').map((item) => {
                const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
                return (
                  <Link key={item.href} href={item.href} style={{ display: 'block', padding: '11px 12px', borderRadius: 12, color: active ? '#fff' : '#334155', fontWeight: 700, fontSize: 14, lineHeight: 1.2, textDecoration: 'none', background: active ? '#0f172a' : '#fff' }}>
                    {item.label}
                  </Link>
                )
              })}
            </nav>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, flex: 1 }}>
              <Link href="/projects" style={{ display: 'block', padding: '11px 12px', borderRadius: 12, color: pathname.startsWith('/projects') ? '#fff' : '#334155', fontWeight: 700, fontSize: 14, lineHeight: 1.2, textDecoration: 'none', background: pathname.startsWith('/projects') ? '#0f172a' : '#fff', flex: '0 0 auto' }}>
                Projects
              </Link>
              <div style={{ display: 'grid', gap: 6, paddingLeft: 10, overflowY: 'auto', minHeight: 0, alignContent: 'start' }}>
                {projects.map((project) => {
                  const projectHref = `/projects/${project.id}`
                  const projectActive = pathname.startsWith(projectHref)
                  return (
                    <Link
                      key={project.id}
                      href={projectHref}
                      style={{
                        display: 'block',
                        padding: '9px 10px',
                        borderRadius: 10,
                        color: projectActive ? '#0f172a' : '#475569',
                        fontWeight: projectActive ? 700 : 600,
                        fontSize: 13,
                        lineHeight: 1.25,
                        textDecoration: 'none',
                        background: projectActive ? '#eef2ff' : 'transparent',
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
            <Link href="/profile" style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 12px', borderRadius: 14, color: pathname.startsWith('/profile') ? '#fff' : '#334155', fontWeight: 700, fontSize: 14, textDecoration: 'none', background: pathname.startsWith('/profile') ? '#0f172a' : '#fff', border: pathname.startsWith('/profile') ? '1px solid #0f172a' : '1px solid #e2e8f0' }}>
              <div style={{ width: 32, height: 32, borderRadius: 999, overflow: 'hidden', background: pathname.startsWith('/profile') ? 'rgba(255,255,255,0.16)' : '#e2e8f0', display: 'grid', placeItems: 'center', color: pathname.startsWith('/profile') ? '#fff' : '#475569', flex: '0 0 auto' }}>
                {accountAvatarUrl ? <img src={accountAvatarUrl} alt={accountName || 'Profile'} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (accountName?.trim()?.[0] || '?').toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <div>Profile</div>
                {accountName ? <div style={{ fontSize: 12, fontWeight: 600, opacity: pathname.startsWith('/profile') ? 0.85 : 0.7, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{accountName}</div> : null}
              </div>
            </Link>
          </div>
        </aside>

        <section style={{ padding: '28px 32px 40px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 750, letterSpacing: '-0.03em' }}>{title}</div>
              <div style={{ marginTop: 6, color: '#64748b' }}>{subtitle}</div>
            </div>
            <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
              {actions ?? null}
            </div>
          </header>
          {children}
        </section>
      </div>
    </main>
  )
}

export const panel: React.CSSProperties = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)', padding: 18, minWidth: 0 }
export const panelHeader: React.CSSProperties = { padding: '18px 18px 14px', fontWeight: 750, fontSize: 16, borderBottom: '1px solid #eef2f7' }
export function pill(bg: string, color: string): React.CSSProperties { return { background: bg, color, borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 700 } }
export function tagStyle(): React.CSSProperties { return { display: 'inline-flex', alignItems: 'center', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600 } }
export function priorityStars(priority: 'P1' | 'P2' | 'P3'): string {
  const value = priority === 'P1' ? 3 : priority === 'P2' ? 2 : 1
  return '★'.repeat(value) + '☆'.repeat(3 - value)
}
