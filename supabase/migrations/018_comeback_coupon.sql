-- ============================================================
-- 해율 자연의 흐름 전자여권 — 컴백(장기 미방문 복귀 유도) 쿠폰
-- 018_comeback_coupon.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~017 마이그레이션 실행 이후에 실행하세요.
--
-- 마지막 방문 후 45일이 지난 고객에게 2,000원 컴백 쿠폰을 자동 발급하고
-- 문자로 알립니다(스케줄 작업, /api/cron/issue-comeback-coupons). 생일축하
-- 쿠폰과 동일하게 reward_rule_id 방식을 써서 "내 할인권함"에 표시되도록
-- 하되, 방문 횟수 트리거(auto_issue_reward)에는 걸리지 않도록 is_comeback
-- 으로 구분합니다. 유효기간은 발급일로부터 14일입니다.
-- ============================================================

-- 1. reward_rules에 컴백 전용 규칙 구분 컬럼 추가
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS is_comeback BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. 컴백 쿠폰 규칙 1건 등록 (threshold_visits는 방문 트리거에서 아예
--    제외되므로 실질적으로 쓰이지 않는 값입니다)
INSERT INTO reward_rules (threshold_visits, amount, is_repeating, repeat_interval, is_comeback)
SELECT 1, 2000, FALSE, NULL, TRUE
WHERE NOT EXISTS (SELECT 1 FROM reward_rules WHERE is_comeback = TRUE);

-- 3. 방문 횟수 기준 자동 발급 함수에서 생일·컴백 규칙을 모두 제외
CREATE OR REPLACE FUNCTION compute_coupon_instances(p_visit_count INTEGER)
RETURNS TABLE(reward_rule_id UUID, threshold_visits INTEGER, amount INTEGER) AS $$
BEGIN
  RETURN QUERY
  -- 1회성 규칙
  SELECT r.id, r.threshold_visits, r.amount
  FROM reward_rules r
  WHERE r.is_active = TRUE
    AND r.is_repeating = FALSE
    AND r.is_birthday = FALSE
    AND r.is_comeback = FALSE
    AND r.threshold_visits <= p_visit_count

  UNION ALL

  -- 반복 규칙 (threshold_visits, threshold_visits+interval, ... <= p_visit_count)
  SELECT r.id, gs.n::INTEGER, r.amount
  FROM reward_rules r
  CROSS JOIN LATERAL generate_series(r.threshold_visits, p_visit_count, r.repeat_interval) AS gs(n)
  WHERE r.is_active = TRUE
    AND r.is_repeating = TRUE
    AND r.is_birthday = FALSE
    AND r.is_comeback = FALSE
    AND r.repeat_interval > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. customer_rewards.source에 'comeback' 값 허용
ALTER TABLE customer_rewards DROP CONSTRAINT IF EXISTS chk_customer_rewards_source;
ALTER TABLE customer_rewards ADD CONSTRAINT chk_customer_rewards_source
  CHECK (source IN ('visit', 'birthday', 'comeback'));

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
