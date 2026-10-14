import { NextResponse, type NextRequest } from 'next/server'
import { v1PathFor, v2Enabled } from '@/lib/routing/v2Gate'

export function middleware(request: NextRequest) {
  if (v2Enabled()) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = v1PathFor(request.nextUrl.pathname)
  url.search = ''
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ['/v2', '/v2/:path*'],
}
