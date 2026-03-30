import Link from 'next/link'
import { notFound } from 'next/navigation'
import type { CSSProperties } from 'react'
import { DocsCopyButton } from '../../../components/docs-copy-button'
import { docSections, getDocPage, getDocSnippet, getSectionPages, renderDocMarkdown } from '../../../lib/docs'

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: '#08110f',
  color: '#ecfdf5',
}

const shellStyle: CSSProperties = {
  width: 'min(1480px, calc(100vw - 32px))',
  margin: '0 auto',
  padding: '28px 0 40px',
}

const panelStyle: CSSProperties = {
  background: 'rgba(6, 16, 13, 0.9)',
  border: '1px solid rgba(52, 211, 153, 0.14)',
  borderRadius: 18,
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.22)',
}

const proseStyle = `
  .docs-prose { color: rgba(236, 253, 245, 0.9); font-size: 15px; line-height: 1.8; }
  .docs-prose h2 { margin: 32px 0 12px; font-size: 28px; line-height: 1.15; letter-spacing: -0.04em; }
  .docs-prose h3 { margin: 24px 0 10px; font-size: 20px; line-height: 1.25; letter-spacing: -0.03em; }
  .docs-prose p, .docs-prose ul, .docs-prose ol { margin: 0 0 14px; }
  .docs-prose ul, .docs-prose ol { padding-left: 20px; }
  .docs-prose li { margin: 0 0 8px; }
  .docs-prose code { background: rgba(12, 20, 18, 0.9); border: 1px solid rgba(125, 211, 252, 0.14); padding: 2px 6px; border-radius: 8px; color: #d1fae5; }
  .docs-prose pre { background: rgba(4, 12, 10, 0.9); border: 1px solid rgba(125, 211, 252, 0.14); border-radius: 14px; padding: 16px; overflow-x: auto; }
  .docs-prose pre code { background: transparent; border: 0; padding: 0; }
  .docs-prose a { color: #7dd3fc; text-decoration: none; }
`

export default async function DocsDetailPage(props: { params: Promise<{ slug?: string[] }> }) {
  const params = await props.params
  const page = getDocPage(params.slug)
  if (!page) notFound()

  const sectionPages = getSectionPages(page.section)
  const snippets = (page.snippets || []).map((id) => getDocSnippet(id)).filter(Boolean)

  return (
    <main style={pageStyle}>
      <style>{proseStyle}</style>
      <div style={shellStyle}>
        <div style={{ display: 'grid', gridTemplateColumns: '290px minmax(0, 1fr) 360px', gap: 18, alignItems: 'start' }}>
          <aside style={{ ...panelStyle, position: 'sticky', top: 16, padding: 18 }}>
            <Link href="/docs/installer/overview" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div style={{ display: 'grid', gap: 8 }}>
                <img src="/sally-logo.svg" alt="Sally logo" style={{ width: 190, height: 'auto' }} />
                <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fde68a' }}>Official docs</div>
              </div>
            </Link>

            <div style={{ display: 'grid', gap: 18, marginTop: 20 }}>
              {docSections.map((section) => {
                const pages = getSectionPages(section.id)
                const activeSection = section.id === page.section
                return (
                  <div key={section.id} style={{ display: 'grid', gap: 8 }}>
                    <div>
                      <div style={{ fontSize: 14, fontWeight: 800, color: activeSection ? '#d1fae5' : 'rgba(236,253,245,0.78)' }}>{section.title}</div>
                      <div style={{ fontSize: 12, lineHeight: 1.6, color: 'rgba(236,253,245,0.52)' }}>{section.description}</div>
                    </div>
                    <div style={{ display: 'grid', gap: 6 }}>
                      {pages.map((entry) => {
                        const active = entry.slug.join('/') === page.slug.join('/')
                        return (
                          <Link
                            key={entry.slug.join('/')}
                            href={`/docs/${entry.slug.join('/')}`}
                            style={{
                              textDecoration: 'none',
                              color: active ? '#08110f' : '#d1fae5',
                              background: active ? '#a7f3d0' : 'rgba(4, 12, 10, 0.68)',
                              border: active ? '1px solid rgba(167, 243, 208, 0.4)' : '1px solid rgba(52, 211, 153, 0.12)',
                              borderRadius: 12,
                              padding: '10px 12px',
                              fontSize: 13,
                              fontWeight: 700,
                            }}
                          >
                            {entry.title}
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </aside>

          <section style={{ ...panelStyle, padding: 28, minWidth: 0 }}>
            <div style={{ display: 'grid', gap: 10, marginBottom: 22 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#7dd3fc' }}>{page.section}</div>
              <h1 style={{ margin: 0, fontSize: 42, lineHeight: 1.02, letterSpacing: '-0.05em' }}>{page.title}</h1>
              <p style={{ margin: 0, color: 'rgba(236, 253, 245, 0.68)', fontSize: 15, lineHeight: 1.7 }}>{page.description}</p>
            </div>
            <div className="docs-prose" dangerouslySetInnerHTML={{ __html: renderDocMarkdown(page.markdown) }} />
          </section>

          <aside style={{ ...panelStyle, position: 'sticky', top: 16, padding: 18, display: 'grid', gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fde68a' }}>Copy-ready snippets</div>
              <div style={{ marginTop: 6, fontSize: 13, lineHeight: 1.7, color: 'rgba(236, 253, 245, 0.62)' }}>
                Keep the code you actually need on the right, like Scalar-style docs, instead of forcing users to hunt through the prose.
              </div>
            </div>

            {snippets.length > 0 ? snippets.map((snippet) => (
              <div key={snippet!.id} style={{ border: '1px solid rgba(125, 211, 252, 0.14)', borderRadius: 14, overflow: 'hidden', background: 'rgba(4, 12, 10, 0.82)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: 14, borderBottom: '1px solid rgba(125, 211, 252, 0.12)' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{snippet!.title}</div>
                    <div style={{ fontSize: 11, color: 'rgba(236,253,245,0.52)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{snippet!.language}</div>
                  </div>
                  <DocsCopyButton code={snippet!.code} />
                </div>
                <pre style={{ margin: 0, padding: 14, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', fontSize: 12, lineHeight: 1.65, color: '#d1fae5' }}>
                  {snippet!.code}
                </pre>
              </div>
            )) : (
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(236,253,245,0.62)' }}>This page does not have dedicated snippets yet.</div>
            )}

            <div style={{ borderTop: '1px solid rgba(52, 211, 153, 0.12)', paddingTop: 14, display: 'grid', gap: 8 }}>
              <div style={{ fontSize: 12, fontWeight: 800, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#a7f3d0' }}>Next docs passes</div>
              <div style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(236,253,245,0.62)' }}>
                This shell is now structured for full docs expansion across Installer, API, MCP, and End-User Usage.
              </div>
            </div>
          </aside>
        </div>
      </div>
    </main>
  )
}
