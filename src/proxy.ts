import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getStoreIdByActiveToken } from '@/lib/qrSettings';
import { secondsUntilStoreClose } from '@/lib/utils';

const COOKIE_NAME = 'haeyul_qr_store';

/**
 * 매장 QR의 key 파라미터를 store_qr_tokens의 활성 토큰들과 대조해 어느 매장인지
 * 식별하고, 맞으면 그 매장 ID를 쿠키로 남깁니다. 유효시간은 그날 매장 마감시각까지로,
 * 식사 후 계산 시점에 QR 인증이 만료되어 있는 문제를 막습니다.
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
        maxAge: secondsUntilStoreClose(),
        path: '/',
      });
    }
  }

  return response;
}

export const config = {
  matcher: '/visit',
};
