-- ============================================================
-- 해율 자연의 흐름 전자여권 — 매니저(예약 담당) 계정
-- 027_manager_account.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~026 마이그레이션 실행 이후에 실행하세요.
--
-- 변경 내용:
--   - admin_users.role: 'owner'(전체 관리자, 기존 계정 모두) / 'manager'(예약관리만)
--   - 로그인 5회 연속 실패 시 15분 잠금 (failed_login_count, locked_until)
--   - 매니저 계정 만들기·비밀번호 재설정 함수 (전체 관리자 화면에서만 호출, 서버 전용)
-- ============================================================

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'owner';
ALTER TABLE admin_users DROP CONSTRAINT IF EXISTS chk_admin_users_role;
ALTER TABLE admin_users ADD CONSTRAINT chk_admin_users_role CHECK (role IN ('owner', 'manager'));

ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE admin_users ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

-- 매니저 계정 만들기 — 새 계정 id를 돌려줍니다 (아이디가 이미 있으면 오류)
CREATE OR REPLACE FUNCTION create_manager_account(p_username TEXT, p_password TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO admin_users (username, password_hash, role)
  VALUES (p_username, crypt(p_password, gen_salt('bf')), 'manager')
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$;

-- 매니저 계정 비밀번호 재설정 (매니저 계정만 바꿀 수 있음)
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
      updated_at = NOW()
  WHERE id = p_admin_id AND role = 'manager';
  RETURN FOUND;
END;
$$;

-- 서버(service_role)에서만 호출할 수 있게 막습니다 (손님 화면의 공개 키로는 호출 불가)
REVOKE ALL ON FUNCTION create_manager_account(TEXT, TEXT) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION reset_manager_password(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION create_manager_account(TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION reset_manager_password(UUID, TEXT) TO service_role;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
