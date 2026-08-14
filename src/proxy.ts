import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getStoreIdByActiveToken } from '@/lib/qrSettings';

const COOKIE_NAME = 'haeyul_qr_store';
const MAX_AGE = 60 * 10; // 10분

/**
 * 매장 QR의 key 파라미터를 store_qr_tokens의 활성 토큰들과 대조해 어느 매장인지
 * 식별하고, 맞으면 그 매장 ID를 짧은 유효시간의 쿠키로 남깁니다.
 * (쿠키 쓰기는 proxy/서버 액션에서만 가능해서 여기서 처리합니다.)
 */
export async function proxy(request: NextRequest) {
  const key = request.nextUrl.searchParams.get('key');
  const response = NextResponse.next();

  if (key) {
    const storeId = await getStoreIdByActiveToken(key);
    if (storeId) {
      response.cookies.set(COOKIE_NAME, storeId, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: MAX_AGE,
        path: '/',
      });
    }
  }

  return response;
}

export const config = {
  matcher: '/visit',
};
