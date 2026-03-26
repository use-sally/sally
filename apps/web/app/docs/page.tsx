import Link from 'next/link'
import type { CSSProperties, ReactNode } from 'react'

const pageStyle: CSSProperties = {
  minHeight: '100vh',
  background: '#08110f',
  color: '#ecfdf5',
  fontFamily: `'JetBrains Mono', 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', monospace`,
}

const shellStyle: CSSProperties = {
  width: 'min(1120px, calc(100vw - 48px))',
  margin: '0 auto',
  padding: '48px 0 64px',
}

const panelStyle: CSSProperties = {
  background: 'rgba(6, 16, 13, 0.88)',
  border: '1px solid rgba(52, 211, 153, 0.16)',
  borderRadius: 18,
  padding: 20,
  boxShadow: '0 24px 80px rgba(0, 0, 0, 0.28)',
}

const linkStyle: CSSProperties = {
  color: '#a7f3d0',
  textDecoration: 'none',
  fontWeight: 700,
}

const codeStyle: CSSProperties = {
  margin: 0,
  whiteSpace: 'pre-wrap',
  overflowWrap: 'anywhere',
  fontSize: 12,
  lineHeight: 1.65,
  color: '#d1fae5',
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section style={{ ...panelStyle, display: 'grid', gap: 14 }}>
      <div style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.03em' }}>{title}</div>
      <div style={{ display: 'grid', gap: 12, color: 'rgba(236, 253, 245, 0.88)', lineHeight: 1.7, fontSize: 14 }}>{children}</div>
    </section>
  )
}

export default function DocsPage() {
  return (
    <main style={pageStyle}>
      <div style={shellStyle}>
        <div style={{ display: 'grid', gap: 20 }}>
          <div style={{ ...panelStyle, padding: 28, display: 'grid', gap: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#fcd34d' }}>sally docs</div>
                <h1 style={{ margin: '10px 0 0', fontSize: 42, lineHeight: 1.05, letterSpacing: '-0.05em' }}>Documentation for humans, scripts, and agents.</h1>
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                <Link href="/" style={{ ...linkStyle, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(52, 211, 153, 0.18)', background: 'rgba(16, 185, 129, 0.08)' }}>Open app</Link>
                <a href="https://github.com/use-sally/sally" target="_blank" rel="noreferrer" style={{ ...linkStyle, padding: '10px 14px', borderRadius: 12, border: '1px solid rgba(250, 204, 21, 0.24)', background: 'rgba(250, 204, 21, 0.08)', color: '#fde68a' }}>GitHub</a>
              </div>
            </div>
            <p style={{ margin: 0, maxWidth: 860, color: 'rgba(236, 253, 245, 0.82)', lineHeight: 1.8, fontSize: 15 }}>
              Sally is an API-first project management system with a low-noise web UI, a real HTTP API, and MCP support for agent workflows.
              This docs hub mirrors the current product shape and points to the implementation-backed reference docs in the repo.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: 16 }}>
              {[
                ['Install', 'Ubuntu/Debian installer, managed-simple, existing-infra, release notes.'],
                ['Operate', 'Workspaces, projects, tasks, comments, notifications, timesheets, recovery.'],
                ['Integrate', 'API auth, workspace selection, hosted MCP, stdio MCP, examples.'],
              ].map(([title, body]) => (
                <div key={title} style={{ border: '1px solid rgba(52, 211, 153, 0.14)', borderRadius: 14, padding: 16, background: 'rgba(4, 12, 10, 0.72)' }}>
                  <div style={{ fontWeight: 800, marginBottom: 8 }}>{title}</div>
                  <div style={{ fontSize: 13, lineHeight: 1.7, color: 'rgba(236, 253, 245, 0.74)' }}>{body}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: 20 }}>
            <Section title="Start here">
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
                <li><strong>Install</strong>: <code>npx --yes create-sally@latest</code></li>
                <li><strong>API reference</strong>: <code>docs/api.md</code></li>
                <li><strong>MCP guide</strong>: <code>docs/mcp.md</code></li>
                <li><strong>Product/workflow guide</strong>: <code>docs/product-guide.md</code></li>
                <li><strong>Tutorials + examples</strong>: <code>docs/tutorials.md</code></li>
              </ul>
              <div>
                Recommended order for new operators:
                <ol style={{ margin: '8px 0 0', paddingLeft: 18, display: 'grid', gap: 6 }}>
                  <li>README</li>
                  <li>Product guide</li>
                  <li>Install guide</li>
                  <li>MCP guide</li>
                  <li>Recovery notes</li>
                </ol>
              </div>
            </Section>

            <Section title="Current app state">
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
                <li>Workspaces, memberships, invites, and role-based access</li>
                <li>Projects with statuses, activity, and project memberships</li>
                <li>Tasks with labels, todos, comments, due dates, and inline images</li>
                <li>Clients, notifications, and timesheets</li>
                <li>Hosted MCP at <code>/mcp</code> plus local stdio MCP via <code>sally-mcp</code></li>
              </ul>
              <div>
                The implementation-backed source of truth is the API code plus the repo docs, especially <code>docs/api.md</code>.
              </div>
            </Section>
          </div>

          <Section title="Hosted MCP quick example">
            <p style={{ margin: 0 }}>Hosted MCP is a first-class Sally feature. Typical flow: initialize, send <code>notifications/initialized</code>, list tools, then call tools with the returned session id.</p>
            <div style={{ border: '1px solid rgba(52, 211, 153, 0.12)', borderRadius: 14, padding: 16, background: 'rgba(4, 12, 10, 0.76)' }}>
              <pre style={codeStyle}>{`curl -X POST https://your-sally-domain.com/mcp \
  -H 'Authorization: Bearer sallymcp_...' \
  -H 'Content-Type: application/json' \
  -H 'Accept: application/json, text/event-stream' \
  --data '{
    "jsonrpc":"2.0",
    "id":1,
    "method":"initialize",
    "params":{
      "protocolVersion":"2025-03-26",
      "capabilities":{},
      "clientInfo":{"name":"manual-test","version":"1.0.0"}
    }
  }'`}</pre>
            </div>
          </Section>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 20 }}>
            <Section title="Useful repo docs">
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
                <li><code>docs/index.md</code></li>
                <li><code>docs/product-guide.md</code></li>
                <li><code>docs/api.md</code></li>
                <li><code>docs/mcp.md</code></li>
                <li><code>docs/tutorials.md</code></li>
                <li><code>docs/ubuntu-debian-install.md</code></li>
                <li><code>docs/recovery.md</code></li>
              </ul>
            </Section>

            <Section title="Documentation intent">
              <div>
                These docs are written to be readable by humans and dependable for LLMs. That means:
              </div>
              <ul style={{ margin: 0, paddingLeft: 18, display: 'grid', gap: 8 }}>
                <li>explicit terminology</li>
                <li>practical examples</li>
                <li>clear auth/workspace selection guidance</li>
                <li>reference docs that stay close to the implementation</li>
              </ul>
            </Section>
          </div>
        </div>
      </div>
    </main>
  )
}
