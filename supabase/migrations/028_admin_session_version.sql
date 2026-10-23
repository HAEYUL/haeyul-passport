-- ============================================================
-- 해율 자연의 흐름 전자여권 — 비밀번호를 바꾸면 모든 기기 로그아웃
-- 028_admin_session_version.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~027 마이그레이션 실행 이후에 실행하세요.
--
-- 관리자·매니저 로그인을 한 달 유지하므로, 비밀번호를 바꾸면 이미 로그인된 다른 기기가
-- 바로 로그아웃되도록 계정마다 '로그인 버전'을 둡니다. 비밀번호를 바꿀 때 버전이 1 오르고,
-- 이전 버전으로 로그인된 기기는 다음 화면부터 로그인 화면으로 돌아갑니다.
-- ============================================================

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS session_version INTEGER NOT NULL DEFAULT 0;

-- 관리자 본인 비밀번호 변경 (015) — 로그인 버전도 올립니다
CREATE OR REPLACE FUNCTION set_admin_password(
  p_admin_id UUID,
  p_current_password TEXT,
  p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_hash TEXT;
BEGIN
  SELECT password_hash INTO v_hash
  FROM admin_users
  WHERE id = p_admin_id AND is_active = TRUE;

  IF v_hash IS NULL THEN
    RETURN FALSE;
  END IF;

  IF v_hash != crypt(p_current_password, v_hash) THEN
    RETURN FALSE;
  END IF;

  UPDATE admin_users
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      session_version = session_version + 1,
      updated_at = NOW()
  WHERE id = p_admin_id;

  RETURN TRUE;
END;
$$;

-- 매니저 비밀번호 재설정 (027) — 로그인 버전도 올립니다
CREATE OR REPLACE FUNCTION reset_manager_password(p_admin_id UUID, p_new_password TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  UPDATE admin_users
  SET password_hash = crypt(p_new_password, gen_salt('bf')),
      failed_login_count = 0,
      locked_until = NULL,
      session_version = session_version + 1,
      updated_at = NOW()
  WHERE id = p_admin_id AND role = 'manager';
  RETURN FOUND;
END;
$$;

REVOKE ALL ON FUNCTION reset_manager_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION reset_manager_password(UUID, TEXT) TO service_role;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
