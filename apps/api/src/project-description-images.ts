import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { normalizeImageExtension } from './task-description-images.js'

const PUBLIC_PREFIX = '/uploads/project-images/'

export function projectUploadsRoot() {
  return path.resolve(process.cwd(), 'uploads', 'project-images')
}

export function projectUploadsDir(projectId: string) {
  return path.join(projectUploadsRoot(), projectId)
}

export function ensureProjectUploadsDir(projectId: string) {
  const dir = projectUploadsDir(projectId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function saveProjectImage(projectId: string, payload: { fileName?: string; mimeType?: string; base64: string }) {
  const dir = ensureProjectUploadsDir(projectId)
  const ext = normalizeImageExtension(payload.mimeType, payload.fileName)
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  const absolutePath = path.join(dir, fileName)
  fs.writeFileSync(absolutePath, Buffer.from(payload.base64, 'base64'))
  return { fileName, url: `${PUBLIC_PREFIX}${projectId}/${fileName}`, absolutePath }
}

export function extractManagedProjectImageUrls(description?: string | null): string[] {
  if (!description) return []
  const matches = description.matchAll(/!\[[^\]]*\]\((\/uploads\/project-images\/[^")\s]+)\)/g)
  return Array.from(new Set(Array.from(matches, (match) => match[1])))
}

export function deleteProjectImageByUrl(url: string) {
  if (!url.startsWith(PUBLIC_PREFIX)) return
  const relativePath = url.slice(PUBLIC_PREFIX.length)
  const absolutePath = path.join(projectUploadsRoot(), relativePath)
  if (!absolutePath.startsWith(projectUploadsRoot())) return
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath)
}

export function cleanupRemovedProjectDescriptionImages(previousDescription?: string | null, nextDescription?: string | null) {
  const previous = new Set(extractManagedProjectImageUrls(previousDescription))
  const next = new Set(extractManagedProjectImageUrls(nextDescription))
  for (const url of previous) {
    if (!next.has(url)) deleteProjectImageByUrl(url)
  }
}

export function serveProjectImage(filePathParts: string[]) {
  const absolutePath = path.join(projectUploadsRoot(), ...filePathParts)
  if (!absolutePath.startsWith(projectUploadsRoot())) return null
  if (!fs.existsSync(absolutePath)) return null
  const ext = path.extname(absolutePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return { absolutePath, mimeType }
}
