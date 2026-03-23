'use client'

import { useEffect, useRef, useState } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { apiUrl } from '../lib/api'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import Link from '@tiptap/extension-link'
import Placeholder from '@tiptap/extension-placeholder'
import TurndownService from 'turndown'

function normalizeManagedPaths(markdown: string) {
  return markdown
    .replace(/!\[([^\]]*)\]\((\/uploads\/[^\s\)]+)(\s+["'][^"']+["'])?\)/g, (_match, alt, src, title = '') => `![${alt}](${apiUrl(src)}${title || ''})`)
    .replace(/\[([^\]]+)\]\((\/uploads\/[^\s\)]+)(\s+["'][^"']+["'])?\)/g, (_match, text, href, title = '') => `[${text}](${apiUrl(href)}${title || ''})`)
}

function escapeAttr(value: string) {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

function denormalizeManagedPath(src: string) {
  try {
    const url = new URL(src)
    if (url.pathname.startsWith('/uploads/')) return url.pathname
  } catch {}
  return src
}

function extractPersistedWidth(imgTag: string) {
  const styleMatch = imgTag.match(/width:\s*(\d+)px/i)
  if (styleMatch) return Number(styleMatch[1])
  const attrMatch = imgTag.match(/width=["'](\d+)["']/i)
  if (attrMatch) return Number(attrMatch[1])
  const titleMatch = imgTag.match(/title=["']width=(\d+)["']/i)
  if (titleMatch) return Number(titleMatch[1])
  return 640
}

function wrapImagesWithResizablePreview(html: string) {
  return html.replace(/<img\b([^>]*?)src=["']([^"']+)["']([^>]*?)alt=["']([^"']*)["']([^>]*?)>|<img\b([^>]*?)alt=["']([^"']*)["']([^>]*?)src=["']([^"']+)["']([^>]*?)>/gi, (...args) => {
    const match = args[0] as string
    const src = (args[2] || args[9] || '') as string
    const alt = (args[4] || args[7] || '') as string
    const width = extractPersistedWidth(match)
    const persistedSrc = denormalizeManagedPath(src)
    return `<span data-resizable-image="1" data-src="${escapeAttr(persistedSrc)}" data-alt="${escapeAttr(alt)}" style="display:block;position:relative;max-width:100%;width:min(100%, ${width}px);border:1px dashed #e2e8f0;border-radius:12px;padding:4px;background:#fff;margin:12px 0;overflow:visible;"><img src="${escapeAttr(src)}" alt="${escapeAttr(alt)}" style="display:block;width:100%;height:auto;max-width:none;border-radius:8px;" /><span data-resize-handle="1" style="position:absolute;top:4px;right:-6px;bottom:4px;width:12px;cursor:ew-resize;background:linear-gradient(to right, transparent, rgba(148,163,184,0.45));border-radius:999px;"></span></span>`
  })
}

export function renderMarkdownToHtml(markdown: string) {
  const html = marked.parse(normalizeManagedPaths(markdown || ''), {
    breaks: true,
    gfm: true,
  }) as string
  const sanitized = DOMPurify.sanitize(html)
  return wrapImagesWithResizablePreview(sanitized)
}

const turndown = new TurndownService({ headingStyle: 'atx', bulletListMarker: '-', codeBlockStyle: 'fenced' })
turndown.addRule('preserveImageTitleWidth', {
  filter: 'img',
  replacement: (_content, node) => {
    const img = node as HTMLImageElement
    const src = denormalizeManagedPath(img.getAttribute('src') || '')
    const alt = img.getAttribute('alt') || ''
    const title = img.getAttribute('title') || ''
    return title ? `![${alt}](${src} "${title}")` : `![${alt}](${src})`
  },
})

function htmlToMarkdown(html: string) {
  return turndown.turndown(html).trim()
}

function markdownToEditorHtml(markdown: string) {
  return renderMarkdownToHtml(markdown || '')
}

export function MarkdownDescriptionEditor({
  value,
  onCommit,
  onImageUpload,
  busy,
}: {
  value: string
  onCommit: (value: string) => void
  onImageUpload: (file: File) => Promise<{ url: string; alt?: string } | null>
  busy?: boolean
}) {
  const [mounted, setMounted] = useState(false)

  useEffect(() => { setMounted(true) }, [])

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] }, codeBlock: false }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: 'No description yet.' }),
    ],
    content: markdownToEditorHtml(value || ''),
    autofocus: false,
    editorProps: {
      attributes: { style: editorContentStyle },
      handleDrop: (_view, event) => {
        const file = Array.from(event.dataTransfer?.files || []).find((item) => item.type.startsWith('image/'))
        if (!file) return false
        event.preventDefault()
        void (async () => {
          const uploaded = await onImageUpload(file)
          if (!uploaded || !editor) return
          editor.chain().focus().setImage({ src: apiUrl(uploaded.url), alt: uploaded.alt || file.name.replace(/\.[^.]+$/, '') || 'reference' }).run()
          const markdown = htmlToMarkdown(editor.getHTML())
          setTimeout(() => onCommit(markdown), 0)
        })()
        return true
      },
      handlePaste: (_view, event) => {
        const file = Array.from(event.clipboardData?.files || []).find((item) => item.type.startsWith('image/'))
        if (!file) return false
        event.preventDefault()
        void (async () => {
          const uploaded = await onImageUpload(file)
          if (!uploaded || !editor) return
          editor.chain().focus().setImage({ src: apiUrl(uploaded.url), alt: uploaded.alt || file.name.replace(/\.[^.]+$/, '') || 'reference' }).run()
          const markdown = htmlToMarkdown(editor.getHTML())
          setTimeout(() => onCommit(markdown), 0)
        })()
        return true
      },
    },
    onUpdate: () => {},
    onBlur: ({ editor }) => {
      onCommit(htmlToMarkdown(editor.getHTML()))
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!busy)
  }, [editor, busy])

  useEffect(() => {
    if (!editor) return
    const current = htmlToMarkdown(editor.getHTML())
    if (value !== current) editor.commands.setContent(markdownToEditorHtml(value || ''), false)
  }, [editor, value])

  if (!mounted) return <div style={editorShellStyle} />

  return <EditorContent editor={editor} />
}

const editorContentStyle = [
  'width:100%',
  'border:1px solid #dbe1ea',
  'border-radius:12px',
  'padding:12px 14px',
  'background:#fff',
  'min-height:180px',
  'font:inherit',
  'line-height:1.6',
  'outline:none',
].join(';')


const editorShellStyle: React.CSSProperties = { minHeight: 180, border: '1px solid #dbe1ea', borderRadius: 12, background: '#fff' }
