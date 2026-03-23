'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ReactNode } from 'react'
import { useProjectsQuery } from '../lib/query'

const navItems = [
  { href: '/', label: 'Overview' },
  { href: '/projects', label: 'Projects' },
  { href: '/timesheets', label: 'Timesheets' },
]

export function AppShell({ title, subtitle, children, actions }: { title: string; subtitle: string; children: ReactNode; actions?: ReactNode }) {
  const pathname = usePathname()
  const { data: projects = [] } = useProjectsQuery()

  return (
    <main style={{ minHeight: '100vh', background: '#f5f7fb', color: '#0f172a', fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', minHeight: '100vh' }}>
        <aside style={{ background: '#ffffff', borderRight: '1px solid #e2e8f0', padding: '24px 18px', display: 'flex', flexDirection: 'column', gap: 24 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.08em', color: '#64748b', textTransform: 'uppercase' }}>AutomateThis PM</div>
            <div style={{ marginTop: 8, fontSize: 22, fontWeight: 700 }}>Workspace</div>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>Low-noise internal product management.</div>
          </div>

          <nav style={{ display: 'grid', gap: 8 }}>
            {navItems.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href)
              return (
                <div key={item.href} style={{ display: 'grid', gap: 8 }}>
                  <Link href={item.href} style={{ padding: '11px 12px', borderRadius: 12, color: active ? '#fff' : '#334155', fontWeight: 700, fontSize: 14, textDecoration: 'none', background: active ? '#0f172a' : '#fff' }}>
                    {item.label}
                  </Link>
                  {item.href === '/projects' && projects.length ? (
                    <div style={{ display: 'grid', gap: 6, paddingLeft: 10 }}>
                      {projects.map((project) => {
                        const projectHref = `/projects/${project.id}`
                        const projectActive = pathname.startsWith(projectHref)
                        return (
                          <Link
                            key={project.id}
                            href={projectHref}
                            style={{
                              padding: '9px 10px',
                              borderRadius: 10,
                              color: projectActive ? '#0f172a' : '#475569',
                              fontWeight: projectActive ? 700 : 600,
                              fontSize: 13,
                              textDecoration: 'none',
                              background: projectActive ? '#eef2ff' : 'transparent',
                            }}
                          >
                            {project.name}
                          </Link>
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </nav>

          <div style={{ marginTop: 'auto', padding: 14, borderRadius: 16, background: '#f8fafc', border: '1px solid #e2e8f0' }}>
            <div style={{ fontWeight: 700 }}>Design target</div>
            <div style={{ marginTop: 6, color: '#64748b', fontSize: 14 }}>Plane-like simplicity, without SaaS clutter.</div>
          </div>
        </aside>

        <section style={{ padding: '28px 32px 40px' }}>
          <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
            <div>
              <div style={{ fontSize: 32, fontWeight: 750, letterSpacing: '-0.03em' }}>{title}</div>
              <div style={{ marginTop: 6, color: '#64748b' }}>{subtitle}</div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>{actions ?? <button style={secondaryButton}>Invite</button>}</div>
          </header>
          {children}
        </section>
      </div>
    </main>
  )
}

export const panel: React.CSSProperties = { background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 20, boxShadow: '0 1px 2px rgba(15, 23, 42, 0.04)', padding: 18, minWidth: 0 }
export const panelHeader: React.CSSProperties = { padding: '18px 18px 14px', fontWeight: 750, fontSize: 16, borderBottom: '1px solid #eef2f7' }
const secondaryButton: React.CSSProperties = { background: '#fff', color: '#0f172a', border: '1px solid #dbe1ea', borderRadius: 12, padding: '11px 14px', fontWeight: 700 }
export function pill(bg: string, color: string): React.CSSProperties { return { background: bg, color, borderRadius: 999, padding: '5px 10px', fontSize: 12, fontWeight: 700 } }
export function tagStyle(): React.CSSProperties { return { display: 'inline-flex', alignItems: 'center', background: '#f8fafc', color: '#475569', border: '1px solid #e2e8f0', borderRadius: 999, padding: '4px 10px', fontSize: 12, fontWeight: 600 } }
export function priorityStars(priority: 'P1' | 'P2' | 'P3'): string {
  const value = priority === 'P1' ? 3 : priority === 'P2' ? 2 : 1
  return '★'.repeat(value) + '☆'.repeat(3 - value)
}
