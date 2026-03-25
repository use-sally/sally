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
      `}</style>
      <div dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(description || '') || '<p>No description yet.</p>' }} />
    </div>
  )
}
