'use server';

import { cookies } from 'next/headers';

const COOKIE_NAME = 'haeyul_qr_store';

/**
 * 최근 QR 스캔으로 확인된 매장 ID를 반환합니다. 스캔이 없거나 만료됐으면 null.
 * 쿠키는 proxy.ts에서 설정됩니다 (Server Component 렌더 중에는 쿠키를 쓸 수 없어서 분리했습니다).
 */
export async function getVerifiedStoreId(): Promise<string | null> {
  const cookieStore = await cookies();
  return cookieStore.get(COOKIE_NAME)?.value || null;
}

/**
 * 어느 매장이든 최근 QR 스캔이 확인된 상태인지만 필요할 때 사용합니다.
 */
export async function isQrVerified(): Promise<boolean> {
  return (await getVerifiedStoreId()) !== null;
}
