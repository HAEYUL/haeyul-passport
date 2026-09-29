import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * 쿠키 위조 방지용 서명 — 서버만 아는 비밀키로 HMAC 서명을 붙이고, 읽을 때 서명과 만료를 확인합니다.
 * 서명이 없거나 틀리거나 만료된 쿠키는 없는 것으로 취급합니다.
 *
 * 비밀키: SESSION_SECRET 환경변수가 있으면 그것을, 없으면 서버 전용 비밀값인
 * SUPABASE_SERVICE_ROLE_KEY에서 파생한 키를 씁니다. (둘 중 하나를 바꾸면 모든 로그인이 풀립니다)
 */
function getSigningKey(): Buffer {
  const explicit = process.env.SESSION_SECRET;
  if (explicit) return Buffer.from(explicit);
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('쿠키 서명용 비밀키(SESSION_SECRET 또는 SUPABASE_SERVICE_ROLE_KEY)가 설정되지 않았습니다.');
  }
  return createHmac('sha256', serviceKey).update('haeyul-cookie-signing-v1').digest();
}

function sign(data: string): string {
  return createHmac('sha256', getSigningKey()).update(data).digest('base64url');
}

/** payload를 만료시각과 함께 서명한 쿠키 값으로 만듭니다. */
export function createSignedValue(payload: unknown, maxAgeSeconds: number): string {
  const body = Buffer.from(
    JSON.stringify({ p: payload, exp: Math.floor(Date.now() / 1000) + maxAgeSeconds })
  ).toString('base64url');
  return `${body}.${sign(body)}`;
}

/** 서명·만료를 확인하고 payload를 돌려줍니다. 위조·만료·형식 오류면 null. */
export function readSignedValue<T>(value: string | undefined | null): T | null {
  if (!value) return null;
  const dot = value.lastIndexOf('.');
  if (dot <= 0) return null;
  const body = value.slice(0, dot);
  const given = Buffer.from(value.slice(dot + 1));
  const expected = Buffer.from(sign(body));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const { p, exp } = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as { p: T; exp: number };
    if (typeof exp !== 'number' || exp < Math.floor(Date.now() / 1000)) return null;
    return p;
  } catch {
    return null;
  }
}
