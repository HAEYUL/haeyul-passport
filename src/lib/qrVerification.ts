'use server';

import { cookies } from 'next/headers';
import { readSignedValue } from '@/lib/signedCookie';

const COOKIE_NAME = 'haeyul_qr_store';

/**
 * 최근 QR 스캔으로 확인된 매장 ID를 반환합니다. 스캔이 없거나 만료됐으면 null.
 * 쿠키는 proxy.ts에서 서명해 설정합니다 (Server Component 렌더 중에는 쿠키를 쓸 수 없어서 분리했습니다).
 * 서명이 틀린(위조된) 쿠키는 무시해, QR을 찍지 않고 매장을 지정하는 것을 막습니다.
 */
export async function getVerifiedStoreId(): Promise<string | null> {
  const cookieStore = await cookies();
  return readSignedValue<string>(cookieStore.get(COOKIE_NAME)?.value);
}
