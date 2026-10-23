'use server';

import { cookies } from 'next/headers';
import { createSignedValue, readSignedValue } from '@/lib/signedCookie';
import { createAdminClient } from '@/lib/supabase/admin';

const SESSION_COOKIE = 'haeyul_admin';
const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30일 (관리자·매니저 공통, 로그아웃하면 바로 끝남)

/** owner: 전체 관리자 / manager: 예약관리만 쓰는 매니저 계정 (027 마이그레이션) */
export type AdminRole = 'owner' | 'manager';

interface AdminSessionData {
  adminId: string;
  username: string;
  /** 로그인할 때의 계정 로그인 버전 — 비밀번호를 바꾸면 DB 버전이 올라 이전 로그인이 끊깁니다 (028) */
  sessionVersion?: number;
}

export interface StaffSessionData extends AdminSessionData {
  role: AdminRole;
}

/**
 * 관리자 세션 설정 (로그인 성공 시)
 */
export async function setAdminSession(data: AdminSessionData) {
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE, createSignedValue(data, SESSION_MAX_AGE), {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: SESSION_MAX_AGE,
    path: '/',
  });
}

/**
 * 로그인한 관리자·매니저 — 서명이 맞고 만료되지 않은 쿠키만 인정하고(위조 쿠키 차단),
 * 계정이 아직 사용 중인지와 역할을 DB에서 확인합니다. (사용 중지하거나 비밀번호를 바꾸면 바로 막힙니다)
 */
export async function getStaffSession(): Promise<StaffSessionData | null> {
  const cookieStore = await cookies();
  const data = readSignedValue<AdminSessionData>(cookieStore.get(SESSION_COOKIE)?.value);
  if (!data?.adminId) return null;

  const supabase = createAdminClient();
  const { data: account, error } = await supabase
    .from('admin_users')
    .select('*')
    .eq('id', data.adminId)
    .maybeSingle();

  if (error) {
    console.error('관리자 계정 확인 오류:', error);
    return null;
  }
  if (!account || !account.is_active) return null;
  // 비밀번호를 바꾼 뒤에는 그 전에 로그인한 기기를 로그아웃시킵니다. (session_version 칸은 028 마이그레이션부터)
  if (typeof account.session_version === 'number' && (data.sessionVersion ?? 0) !== account.session_version) {
    return null;
  }

  // role 칸이 없으면(027 마이그레이션 전) 기존 계정은 모두 전체 관리자입니다.
  const role: AdminRole = account.role === 'manager' ? 'manager' : 'owner';
  return { adminId: data.adminId, username: data.username, sessionVersion: data.sessionVersion, role };
}

/**
 * 전체 관리자 세션 — 매니저 계정이면 null.
 * 예약관리를 뺀 모든 관리자 화면·기능은 이 함수로 확인하므로, 매니저는 메뉴를 숨기는 것뿐 아니라 실행 자체가 막힙니다.
 */
export async function getAdminSession(): Promise<StaffSessionData | null> {
  const session = await getStaffSession();
  return session?.role === 'owner' ? session : null;
}

/**
 * 관리자 세션 삭제 (로그아웃)
 */
export async function clearAdminSession() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE);
}
