-- ============================================================
-- 해율 자연의 흐름 전자여권 — 관리자 비밀번호 검증 함수
-- 003_verify_admin_password.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001_initial_schema.sql, 002_verify_employee_pin.sql 실행 이후에 실행하세요.
-- ============================================================

-- admin_users.password_hash(bcrypt)와 입력 비밀번호를 서버 측(DB)에서 비교합니다.
-- service_role 클라이언트가 SECURITY DEFINER로 호출하며, 해시 원문은
-- 애플리케이션 코드로 노출되지 않습니다.
CREATE OR REPLACE FUNCTION verify_admin_password(p_admin_id UUID, p_password TEXT)
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

  RETURN v_hash = crypt(p_password, v_hash);
END;
$$;

-- ============================================================
-- 함수 생성 완료
-- ============================================================
