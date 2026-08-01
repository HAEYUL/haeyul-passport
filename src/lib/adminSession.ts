'use server';

import { cookies } from 'next/headers';

const SESSION_COOKIE = 'haeyul_admin';
const SESSION_MAX_AGE = 60 * 60 * 8; // 8시간

interface AdminSessionData {
  adminId: string;
  username: string;
}

/**
 * 관리자 세션 설정 (로그인 성공 시)
 */
export async function setAdminSession(data: AdminSessionData) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, JSON.stringify(data), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

/**
 * 관리자 세션 조회
 */
export async function getAdminSession(): Promise<AdminSessionData | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);

  if (!cookie?.value) return null;

  try {
    return JSON.parse(cookie.value) as AdminSessionData;
  } catch {
    return null;
  }
}

/**
 * 관리자 세션 삭제 (로그아웃)
 */
export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
