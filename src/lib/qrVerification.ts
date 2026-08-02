'use server';

import { cookies } from 'next/headers';

const COOKIE_NAME = 'haeyul_qr_verified';

/**
 * 최근 매장 QR 스캔이 확인된 상태인지 조회합니다.
 * 쿠키는 middleware.ts에서 설정됩니다 (Server Component 렌더 중에는 쿠키를 쓸 수 없어서 분리했습니다).
 */
export async function isQrVerified(): Promise<boolean> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value === '1';
}
