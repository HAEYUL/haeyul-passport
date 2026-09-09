-- ============================================================
-- 해율 자연의 흐름 전자여권 — 관리자 비밀번호 변경 함수
-- 015_set_admin_password.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~014 마이그레이션 실행 이후에 실행하세요.
--
-- 지금까지 관리자 비밀번호는 검증(verify_admin_password)만 가능하고,
-- 실제로 바꾸는 기능은 없었습니다(최초 값이 계속 유지됨). 이 함수는
-- 현재 비밀번호를 먼저 확인한 뒤에만 새 비밀번호로 교체합니다. 해시
-- 생성은 항상 DB(pgcrypto)에서만 이뤄져 평문/해시가 애플리케이션
-- 코드로 노출되지 않습니다.
-- ============================================================

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
      updated_at = NOW()
  WHERE id = p_admin_id;

  RETURN TRUE;
END;
$$;

-- ============================================================
-- 함수 생성 완료
-- ============================================================
