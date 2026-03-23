'use client'

import { renderMarkdownToHtml } from './markdown-description-editor'

export function TaskDescriptionRender({ description }: { description: string }) {
  return <div style={{ lineHeight: 1.6 }} dangerouslySetInnerHTML={{ __html: renderMarkdownToHtml(description || '') || '<p>No description yet.</p>' }} />
}
