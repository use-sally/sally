import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const PUBLIC_PREFIX = '/uploads/task-images/'

export function uploadsRoot() {
  return path.resolve(process.cwd(), 'uploads', 'task-images')
}

export function taskUploadsDir(taskId: string) {
  return path.join(uploadsRoot(), taskId)
}

export function ensureTaskUploadsDir(taskId: string) {
  const dir = taskUploadsDir(taskId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function normalizeImageExtension(mimeType?: string, originalName?: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  const ext = originalName?.split('.').pop()?.toLowerCase()
  if (ext && ['png', 'webp', 'jpg', 'jpeg'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext
  return 'jpg'
}

export function saveTaskImage(taskId: string, payload: { fileName?: string; mimeType?: string; base64: string }) {
  const dir = ensureTaskUploadsDir(taskId)
  const ext = normalizeImageExtension(payload.mimeType, payload.fileName)
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  const absolutePath = path.join(dir, fileName)
  fs.writeFileSync(absolutePath, Buffer.from(payload.base64, 'base64'))
  return { fileName, url: `${PUBLIC_PREFIX}${taskId}/${fileName}`, absolutePath }
}

export function extractManagedImageUrls(description?: string | null): string[] {
  if (!description) return []
  const matches = description.matchAll(/!\[[^\]]*\]\((\/uploads\/task-images\/[^")\s]+)\)/g)
  return Array.from(new Set(Array.from(matches, (match) => match[1])))
}

export function deleteImageByUrl(url: string) {
  if (!url.startsWith(PUBLIC_PREFIX)) return
  const relativePath = url.slice(PUBLIC_PREFIX.length)
  const absolutePath = path.join(uploadsRoot(), relativePath)
  if (!absolutePath.startsWith(uploadsRoot())) return
  if (fs.existsSync(absolutePath)) fs.unlinkSync(absolutePath)
}

export function cleanupRemovedDescriptionImages(previousDescription?: string | null, nextDescription?: string | null) {
  const previous = new Set(extractManagedImageUrls(previousDescription))
  const next = new Set(extractManagedImageUrls(nextDescription))
  for (const url of previous) {
    if (!next.has(url)) deleteImageByUrl(url)
  }
}

export function serveTaskImage(filePathParts: string[]) {
  const absolutePath = path.join(uploadsRoot(), ...filePathParts)
  if (!absolutePath.startsWith(uploadsRoot())) return null
  if (!fs.existsSync(absolutePath)) return null
  const ext = path.extname(absolutePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return { absolutePath, mimeType }
}
