-- ============================================================
-- 해율 자연의 흐름 전자여권 — 할인권 규칙 관리자 기능 보강
-- 009_reward_rule_admin.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 008_coupon_rewards.sql 실행 이후에 실행하세요.
--
-- restore_reward()가 status/used_at만 초기화하고 used_store_id는 그대로 남겨두던
-- 문제를 고칩니다 — 복원된 할인권이 "미사용"인데 사용 매장이 표시되는 걸 방지합니다.
-- ============================================================

CREATE OR REPLACE FUNCTION restore_reward(p_customer_reward_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.bypass_reward_reuse_check', 'true', TRUE); -- TRUE = 현재 트랜잭션에만 적용

  UPDATE customer_rewards
  SET status = 'available', used_at = NULL, used_store_id = NULL
  WHERE id = p_customer_reward_id AND status = 'used';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
