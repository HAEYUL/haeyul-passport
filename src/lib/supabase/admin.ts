import { createClient } from '@supabase/supabase-js';

/**
 * 관리자 전용 Supabase 클라이언트
 * - service_role key 사용 (RLS 우회)
 * - API 라우트에서만 사용 (절대 클라이언트에 노출 금지)
 * - 회원 가입, 방문 등록 등 서버 측 작업에 사용
 */
export function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      'Supabase 환경변수가 설정되지 않았습니다. .env.local 파일을 확인하세요.'
    );
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
