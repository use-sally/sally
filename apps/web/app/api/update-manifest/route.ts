import { NextResponse } from 'next/server'
import { updateManifestUrl } from '../../../lib/update-manifest'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const res = await fetch(updateManifestUrl, { cache: 'no-store' })
    const text = await res.text()
    return new NextResponse(text, {
      status: res.status,
      headers: {
        'content-type': res.headers.get('content-type') || 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    })
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : 'Failed to fetch update manifest' }, { status: 502 })
  }
}
