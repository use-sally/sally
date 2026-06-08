'use client'

import { useEffect, useRef, useState } from 'react'
import type { ProviderResource } from '@sally/types/src'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { apiUrl, getIntegrationConnectUrl } from '../lib/api'
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

function denormalizeManagedPath(src: string) {
  try {
    const url = new URL(src)
    if (url.pathname.startsWith('/uploads/')) return url.pathname
  } catch {}
  return src
}

export function renderMarkdownToHtml(markdown: string) {
  const html = marked.parse(normalizeManagedPaths(markdown || ''), {
    breaks: true,
    gfm: true,
  }) as string
  return DOMPurify.sanitize(html)
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

const slashActions = [
  { command: 'h1', label: 'Heading 1', description: 'Large section heading', insert: '# ' },
  { command: 'h2', label: 'Heading 2', description: 'Medium section heading', insert: '## ' },
  { command: 'h3', label: 'Heading 3', description: 'Small section heading', insert: '### ' },
  { command: 'bullet', label: 'Bullet list', description: 'Start an unordered list', insert: '- ' },
  { command: 'numbered', label: 'Numbered list', description: 'Start an ordered list', insert: '1. ' },
  { command: 'quote', label: 'Quote', description: 'Insert a blockquote', insert: '> ' },
  { command: 'code', label: 'Code block', description: 'Insert a fenced code block', insert: '```\n\n```' },
  { command: 'bold', label: 'Bold', description: 'Strong text', insert: '**text**' },
  { command: 'italic', label: 'Italic', description: 'Emphasized text', insert: '_text_' },
  { command: 'link', label: 'Link', description: 'Markdown link', insert: '[text](https://)' },
  { command: 'image', label: 'Image', description: 'Upload and insert an image', insert: '' },
  { command: 'googledrive', label: 'Google Drive', description: 'Search connected Google Drive files', insert: '/googledrive ' },
  { command: 'sharepoint', label: 'SharePoint', description: 'Search connected SharePoint files', insert: '/sharepoint ' },
  { command: 'onedrive', label: 'OneDrive', description: 'Search connected OneDrive files', insert: '/onedrive ' },
  { command: 'dropbox', label: 'Dropbox', description: 'Search connected Dropbox files', insert: '/dropbox ' },
]

export function MarkdownDescriptionEditor({
  value,
  onCommit,
  onImageUpload,
  onFileSearch,
  onChange,
  busy,
  compact = false,
  autoFocus = false,
  commitOnOutsideClick = false,
}: {
  value: string
  onCommit: (value: string) => void
  onImageUpload: (file: File) => Promise<{ url: string; alt?: string } | null>
  onFileSearch?: (query: string, providerCommand: string) => Promise<ProviderResource[]>
  onChange?: (value: string) => void
  busy?: boolean
  compact?: boolean
  autoFocus?: boolean
  commitOnOutsideClick?: boolean
}) {
  const [mounted, setMounted] = useState(false)
  const [fileCommand, setFileCommand] = useState<{ from: number; to: number; query: string; providerCommand: string; top: number; left: number } | null>(null)
  const [fileResults, setFileResults] = useState<ProviderResource[]>([])
  const [slashCommand, setSlashCommand] = useState<{ from: number; to: number; query: string; top: number; left: number } | null>(null)
  const [slashIndex, setSlashIndex] = useState(0)
  const slashCommandRef = useRef<typeof slashCommand>(null)
  const slashIndexRef = useRef(0)
  const slashWheelAccumulatorRef = useRef(0)
  const imageInputRef = useRef<HTMLInputElement | null>(null)
  const pendingImageSlashCommandRef = useRef<typeof slashCommand>(null)
  const [fileSearchLoading, setFileSearchLoading] = useState(false)
  const [fileSearchError, setFileSearchError] = useState<string | null>(null)
  const [connectingProvider, setConnectingProvider] = useState<string | null>(null)
  const rootRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => { setMounted(true) }, [])
  useEffect(() => { slashCommandRef.current = slashCommand }, [slashCommand])
  useEffect(() => { slashIndexRef.current = slashIndex }, [slashIndex])

  function syncFileCommand(nextEditor: NonNullable<ReturnType<typeof useEditor>>) {
    const { state, view } = nextEditor
    const selection = state.selection
    if (!selection.empty) {
      setFileCommand(null)
      setSlashCommand(null)
      return
    }
    const cursor = selection.from
    const $from = state.doc.resolve(cursor)
    const beforeCursor = $from.parent.textBetween(0, $from.parentOffset, '\n', '\n')
    const match = onFileSearch ? beforeCursor.match(/(?:^|\s)\/(googledrive|gdrive|sharepoint|onedrive|dropbox)(?:\s+([^\n]*))?$/i) : null
    const slashMatch = beforeCursor.match(/(?:^|\s)\/([a-zA-Z0-9_-]{0,24})$/)
    if (!match) {
      setFileCommand(null)
      setFileResults([])
      setFileSearchError(null)
      if (slashMatch) {
        const commandText = slashMatch[0].trimStart()
        const coords = view.coordsAtPos(cursor)
        const rootRect = rootRef.current?.getBoundingClientRect()
        setSlashCommand({ from: cursor - commandText.length, to: cursor, query: slashMatch[1].toLowerCase(), top: rootRect ? coords.bottom - rootRect.top + 6 : 0, left: rootRect ? Math.max(0, coords.left - rootRect.left) : 0 })
        setSlashIndex(0)
      } else {
        setSlashCommand(null)
      }
      return
    }
    setSlashCommand(null)
    const commandText = match[0].trimStart()
    const from = cursor - commandText.length
    const coords = view.coordsAtPos(cursor)
    const rootRect = rootRef.current?.getBoundingClientRect()
    setFileCommand({
      from,
      to: cursor,
      query: (match[2] || '').trim(),
      providerCommand: match[1].toLowerCase(),
      top: rootRect ? coords.bottom - rootRect.top + 6 : 0,
      left: rootRect ? Math.max(0, coords.left - rootRect.left) : 0,
    })
  }

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Link.configure({ openOnClick: false, autolink: true, linkOnPaste: true }),
      Image.configure({ inline: false, allowBase64: false }),
      Placeholder.configure({ placeholder: 'Use markdown here: # heading 1, ## heading 2, - list item, drag & drop images, paste screenshots, and write structured notes.' }),
    ],
    content: markdownToEditorHtml(value || ''),
    autofocus: autoFocus,
    editorProps: {
      attributes: { style: compact ? compactEditorContentStyle : editorContentStyle },
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
      handleKeyDown: (_view, event) => {
        const command = slashCommandRef.current
        if (!command) return false
        const actions = slashActions.filter((action) => !command.query || action.command.includes(command.query) || action.label.toLowerCase().includes(command.query)).slice(0, 10)
        if (!actions.length) return false
        if (event.key === 'ArrowDown') {
          event.preventDefault()
          setSlashIndex((current) => (current + 1) % actions.length)
          return true
        }
        if (event.key === 'ArrowUp') {
          event.preventDefault()
          setSlashIndex((current) => (current - 1 + actions.length) % actions.length)
          return true
        }
        if (event.key === 'Enter') {
          event.preventDefault()
          insertSlashAction(actions[slashIndexRef.current] || actions[0])
          return true
        }
        if (event.key === 'Escape') {
          event.preventDefault()
          setSlashCommand(null)
          return true
        }
        return false
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
    onUpdate: ({ editor }) => {
      syncFileCommand(editor)
      onChange?.(htmlToMarkdown(editor.getHTML()))
    },
    onSelectionUpdate: ({ editor }) => syncFileCommand(editor),
    onBlur: ({ editor }) => {
      onCommit(htmlToMarkdown(editor.getHTML()))
    },
  })

  useEffect(() => {
    if (!editor) return
    editor.setEditable(!busy)
  }, [editor, busy])

  useEffect(() => {
    if (!onFileSearch || !fileCommand) return
    let cancelled = false
    setFileSearchLoading(true)
    setFileSearchError(null)
    const timeout = window.setTimeout(() => {
      onFileSearch(fileCommand.query, fileCommand.providerCommand)
        .then((items) => { if (!cancelled) setFileResults(items) })
        .catch((error) => {
          if (!cancelled) {
            setFileResults([])
            setFileSearchError(error instanceof Error ? error.message : 'Failed to search files')
          }
        })
        .finally(() => { if (!cancelled) setFileSearchLoading(false) })
    }, 220)
    return () => {
      cancelled = true
      window.clearTimeout(timeout)
    }
  }, [fileCommand?.query, onFileSearch])

  function integrationSlugForCommand(command: string) {
    if (command === 'sharepoint' || command === 'onedrive') return 'microsoft-365' as const
    if (command === 'dropbox') return 'dropbox' as const
    return 'google-drive' as const
  }

  function providerNameForCommand(command: string) {
    if (command === 'sharepoint') return 'SharePoint'
    if (command === 'onedrive') return 'OneDrive'
    if (command === 'dropbox') return 'Dropbox'
    return 'Google Drive'
  }

  async function connectProvider(command: string) {
    setConnectingProvider(command)
    setFileSearchError(null)
    try {
      const response = await getIntegrationConnectUrl(integrationSlugForCommand(command))
      window.location.href = response.url
    } catch (error) {
      setFileSearchError(error instanceof Error ? error.message : 'Failed to start provider connection')
    } finally {
      setConnectingProvider(null)
    }
  }

  function shouldOfferConnect(message: string | null) {
    return Boolean(message && /connect this storage provider|not connected|before browsing resources/i.test(message))
  }

  function insertFileResource(resource: ProviderResource) {
    if (!editor || !fileCommand) return
    editor.chain().focus().deleteRange({ from: fileCommand.from, to: fileCommand.to }).insertContent(`<a href="${resource.webUrl}">${resource.name}</a> `).run()
    setFileCommand(null)
    setFileResults([])
    setFileSearchError(null)
    const markdown = htmlToMarkdown(editor.getHTML())
    onChange?.(markdown)
    setTimeout(() => onCommit(markdown), 0)
  }

  function insertSlashAction(action: typeof slashActions[number]) {
    if (!editor || !slashCommand) return
    const chain = editor.chain().focus().deleteRange({ from: slashCommand.from, to: slashCommand.to })
    if (action.command === 'h1') chain.setNode('heading', { level: 1 }).run()
    else if (action.command === 'h2') chain.setNode('heading', { level: 2 }).run()
    else if (action.command === 'h3') chain.setNode('heading', { level: 3 }).run()
    else if (action.command === 'bullet') chain.toggleBulletList().run()
    else if (action.command === 'numbered') chain.toggleOrderedList().run()
    else if (action.command === 'quote') chain.toggleBlockquote().run()
    else if (action.command === 'code') chain.setCodeBlock().run()
    else if (action.command === 'bold') chain.toggleBold().run()
    else if (action.command === 'italic') chain.toggleItalic().run()
    else if (action.command === 'link') chain.insertContent('<a href="https://">text</a> ').run()
    else if (action.command === 'image') {
      pendingImageSlashCommandRef.current = slashCommand
      imageInputRef.current?.click()
      return
    }
    else chain.insertContent(action.insert).run()
    setSlashCommand(null)
    if (action.insert.startsWith('/')) requestAnimationFrame(() => syncFileCommand(editor))
  }

  async function handleSlashImageSelected(file: File | undefined) {
    if (!file || !editor) return
    const command = pendingImageSlashCommandRef.current
    pendingImageSlashCommandRef.current = null
    const uploaded = await onImageUpload(file)
    if (!uploaded) return
    const chain = editor.chain().focus()
    if (command) chain.deleteRange({ from: command.from, to: command.to })
    chain.setImage({ src: apiUrl(uploaded.url), alt: uploaded.alt || file.name.replace(/\.[^.]+$/, '') || 'reference' }).run()
    setSlashCommand(null)
    const markdown = htmlToMarkdown(editor.getHTML())
    onChange?.(markdown)
    setTimeout(() => onCommit(markdown), 0)
  }

  useEffect(() => {
    if (!editor || !commitOnOutsideClick) return
    const onPointerDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return
      editor.commands.blur()
    }
    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [editor, commitOnOutsideClick])

  useEffect(() => {
    if (!editor) return
    const current = htmlToMarkdown(editor.getHTML())
    if (value !== current) editor.commands.setContent(markdownToEditorHtml(value || ''), { emitUpdate: false })
  }, [editor, value])

  if (!mounted) return <div style={compact ? compactEditorShellStyle : editorShellStyle} />

  return (
    <div ref={rootRef} className="markdown-description-editor" style={{ position: 'relative' }}>
      <style>{`
        .markdown-description-editor .ProseMirror img {
          display: block;
          max-width: 100%;
          width: auto;
          height: auto;
          border-radius: 12px;
        }
        .markdown-description-editor .ProseMirror blockquote {
          margin: 12px 0;
          padding: 10px 14px;
          border-left: 4px solid var(--form-border-focus);
          border-radius: 10px;
          background: color-mix(in srgb, var(--form-border-focus) 10%, transparent);
          color: var(--text-secondary);
        }
        .markdown-description-editor .ProseMirror pre {
          margin: 12px 0;
          padding: 12px 14px;
          border: 1px solid var(--panel-border);
          border-radius: 12px;
          background: rgba(15, 23, 42, 0.78);
          color: #e5e7eb;
          overflow-x: auto;
        }
        .markdown-description-editor .ProseMirror code {
          border-radius: 6px;
          padding: 2px 5px;
          background: rgba(15, 23, 42, 0.68);
          color: #e5e7eb;
        }
        .markdown-description-editor .ProseMirror pre code {
          padding: 0;
          background: transparent;
        }
      `}</style>
      <input ref={imageInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={(event) => { const file = event.target.files?.[0]; event.currentTarget.value = ''; void handleSlashImageSelected(file) }} />
      <EditorContent editor={editor} />
      {slashCommand ? (
        <div onWheelCapture={(event) => { event.preventDefault(); event.stopPropagation() }} onWheel={(event) => { event.preventDefault(); event.stopPropagation(); slashWheelAccumulatorRef.current += event.deltaY; if (Math.abs(slashWheelAccumulatorRef.current) < 80) return; setSlashIndex((current) => current + (slashWheelAccumulatorRef.current > 0 ? 1 : -1)); slashWheelAccumulatorRef.current = 0 }} style={{ position: 'absolute', top: slashCommand.top, left: slashCommand.left, zIndex: 20, width: 340, maxWidth: 'min(360px, calc(100% - 12px))', border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>Markdown actions · ↑↓ Enter</div>
          {(() => {
            const actions = slashActions.filter((action) => !slashCommand.query || action.command.includes(slashCommand.query) || action.label.toLowerCase().includes(slashCommand.query)).slice(0, 10)
            const start = actions.length ? slashIndex % actions.length : 0
            const visibleActions = actions.slice(start).concat(actions.slice(0, start))
            return visibleActions.map((action, index) => {
              const actualIndex = actions.indexOf(action)
              return (
                <button key={action.command} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertSlashAction(action)} style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--panel-border)', padding: '10px 12px', background: index === 0 ? 'color-mix(in srgb, var(--form-border-focus) 18%, transparent)' : 'transparent', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
                  <div style={{ fontWeight: 800 }}>/{action.command} · {action.label}</div>
                  <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>{action.description}</div>
                </button>
              )
            })
          })()}
        </div>
      ) : null}
      {fileCommand ? (
        <div style={{ position: 'absolute', top: fileCommand.top, left: fileCommand.left, zIndex: 20, width: 340, maxWidth: 'min(360px, calc(100% - 12px))', border: '1px solid var(--panel-border)', borderRadius: 12, background: 'var(--panel-bg)', boxShadow: 'var(--panel-shadow)', overflow: 'hidden' }}>
          <div style={{ padding: '8px 10px', borderBottom: '1px solid var(--panel-border)', color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>
            {fileSearchLoading ? 'Searching connected files…' : fileCommand.query ? `/${fileCommand.providerCommand} files matching “${fileCommand.query}”` : `Type after /${fileCommand.providerCommand} to search connected files`}
          </div>
          {fileSearchError ? <div style={{ padding: 10, display: 'grid', gap: 8 }}>
            <div style={{ color: 'var(--danger-text)', fontSize: 'var(--font-13)' }}>{fileSearchError}</div>
            {shouldOfferConnect(fileSearchError) ? <button type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => void connectProvider(fileCommand.providerCommand)} disabled={connectingProvider === fileCommand.providerCommand} style={{ border: '1px solid var(--form-border-focus)', borderRadius: 10, padding: '8px 10px', background: 'color-mix(in srgb, var(--form-border-focus) 14%, transparent)', color: 'var(--text-primary)', fontWeight: 800, cursor: 'pointer' }}>{connectingProvider === fileCommand.providerCommand ? 'Opening connection…' : `Connect ${providerNameForCommand(fileCommand.providerCommand)}`}</button> : null}
          </div> : null}
          {!fileSearchError && fileResults.length ? fileResults.slice(0, 8).map((resource) => (
            <button key={`${resource.provider}:${resource.externalId}`} type="button" onMouseDown={(event) => event.preventDefault()} onClick={() => insertFileResource(resource)} style={{ width: '100%', border: 'none', borderBottom: '1px solid var(--panel-border)', padding: '10px 12px', background: 'transparent', color: 'var(--text-primary)', textAlign: 'left', cursor: 'pointer' }}>
              <div style={{ fontWeight: 800, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.name}</div>
              <div style={{ marginTop: 2, color: 'var(--text-muted)', fontSize: 'var(--font-12)' }}>{resource.provider.replace('_', ' ').toLowerCase()} · {resource.kind.toLowerCase()}</div>
            </button>
          )) : null}
          {!fileSearchLoading && !fileSearchError && !fileResults.length ? <div style={{ padding: 10, color: 'var(--text-muted)', fontSize: 'var(--font-13)' }}>No files found. If this is your first time using {providerNameForCommand(fileCommand.providerCommand)}, connect your account here and try again.</div> : null}
        </div>
      ) : null}
    </div>
  )
}

const editorContentStyle = [
  'width:100%',
  'border:1px solid var(--form-border)',
  'border-radius:12px',
  'padding:12px 14px',
  'background:var(--form-bg)',
  'color:var(--form-text)',
  'min-height:180px',
  'font:inherit',
  'line-height:1.6',
  'outline:none',
].join(';')


const compactEditorContentStyle = [
  'width:100%',
  'border:1px solid var(--form-border)',
  'border-radius:12px',
  'padding:10px 12px',
  'background:var(--form-bg)',
  'color:var(--form-text)',
  'min-height:96px',
  'font:inherit',
  'font-size:13px',
  'line-height:1.5',
  'outline:none',
].join(';')

const editorShellStyle: React.CSSProperties = { minHeight: 180, border: '1px solid var(--form-border)', borderRadius: 12, background: 'var(--form-bg)' }
const compactEditorShellStyle: React.CSSProperties = { minHeight: 96, border: '1px solid var(--form-border)', borderRadius: 12, background: 'var(--form-bg)' }
