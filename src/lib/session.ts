'use server';

import { cookies } from 'next/headers';

const SESSION_COOKIE = 'haeyul_customer';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30일

interface SessionData {
  customerId: string;
  name: string;
  phone: string;
}

/**
 * 고객 세션 설정 (로그인/가입 시)
 */
export async function setSession(data: SessionData) {
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
 * 고객 세션 조회
 */
export async function getSession(): Promise<SessionData | null> {
  const cookieStore = await cookies();
  const cookie = cookieStore.get(SESSION_COOKIE);

  if (!cookie?.value) return null;

  try {
    return JSON.parse(cookie.value) as SessionData;
  } catch {
    return null;
  }
}

/**
 * 고객 세션 삭제 (로그아웃)
 */
export async function clearSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
