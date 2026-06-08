'use client'

import { renderMarkdownToHtml } from './markdown-description-editor'

export function TaskDescriptionRender({ description }: { description: string }) {
  return (
    <div className="task-description-render" style={{ lineHeight: 1.6 }}>
      <style>{`
        .task-description-render img {
          display: block;
          max-width: 100%;
          width: auto;
          height: auto;
          border-radius: 12px;
        }
        .task-description-render h1,
        .task-description-render h2,
        .task-description-render h3,
        .task-description-render h4,
        .task-description-render h5,
        .task-description-render h6 {
          color: var(--task-title);
        }
        .task-description-render blockquote {
          margin: 12px 0;
          padding: 10px 14px;
          border-left: 4px solid var(--form-border-focus);
          border-radius: 10px;
          background: color-mix(in srgb, var(--form-border-focus) 10%, transparent);
          color: var(--text-secondary);
        }
        .task-description-render pre {
          margin: 12px 0;
          padding: 12px 14px;
          border: 1px solid var(--panel-border);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.78);
          color: #e5e7eb;
          overflow-x: auto;
        }
        .task-description-render code {
          border-radius: 6px;
          padding: 2px 5px;
          background: rgba(15, 23, 42, 0.68);
          color: #e5e7eb;
        }
        .task-description-render pre code {
          padding: 0;
          background: transparent;
        }
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(description || '') || '<p>No description yet.</p>' }} />
    </div>
  )
}
