import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'

const PUBLIC_PREFIX = '/uploads/profile-images/'

export function uploadsRoot() {
  return path.resolve(process.cwd(), 'uploads', 'profile-images')
}

export function accountUploadsDir(accountId: string) {
  return path.join(uploadsRoot(), accountId)
}

export function ensureAccountUploadsDir(accountId: string) {
  const dir = accountUploadsDir(accountId)
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

function normalizeImageExtension(mimeType?: string, originalName?: string) {
  if (mimeType === 'image/png') return 'png'
  if (mimeType === 'image/webp') return 'webp'
  if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') return 'jpg'
  const ext = originalName?.split('.').pop()?.toLowerCase()
  if (ext && ['png', 'webp', 'jpg', 'jpeg'].includes(ext)) return ext === 'jpeg' ? 'jpg' : ext
  return 'jpg'
}

export function saveProfileImage(accountId: string, payload: { fileName?: string; mimeType?: string; base64: string }) {
  const dir = ensureAccountUploadsDir(accountId)
  const ext = normalizeImageExtension(payload.mimeType, payload.fileName)
  const fileName = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`
  const absolutePath = path.join(dir, fileName)
  fs.writeFileSync(absolutePath, Buffer.from(payload.base64, 'base64'))
  return { fileName, url: `${PUBLIC_PREFIX}${accountId}/${fileName}`, absolutePath }
}

export function serveProfileImage(filePathParts: string[]) {
  const absolutePath = path.join(uploadsRoot(), ...filePathParts)
  if (!absolutePath.startsWith(uploadsRoot())) return null
  if (!fs.existsSync(absolutePath)) return null
  const ext = path.extname(absolutePath).toLowerCase()
  const mimeType = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg'
  return { absolutePath, mimeType }
}
