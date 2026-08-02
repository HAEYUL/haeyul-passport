import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const COOKIE_NAME = 'haeyul_qr_verified';
const MAX_AGE = 60 * 10; // 10분

/**
 * 매장 QR의 key 파라미터를 확인하고, 맞으면 짧은 유효시간의 쿠키를 남깁니다.
 * (쿠키 쓰기는 미들웨어/서버 액션에서만 가능해서 여기서 처리합니다.)
 */
export function middleware(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const response = NextResponse.next();

  if (key && process.env.VISIT_QR_KEY && key === process.env.VISIT_QR_KEY) {
    response.cookies.set(COOKIE_NAME, '1', {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: MAX_AGE,
      path: '/',
    });
  }

  return response;
}

export const config = {
  matcher: '/visit',
};
