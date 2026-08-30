-- ============================================================
-- 해율 자연의 흐름 전자여권 — 생일축하 쿠폰
-- 016_birthday_coupon.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~015 마이그레이션 실행 이후에 실행하세요.
--
-- 개인정보처리방침에 "생일 혜택 제공"이라 명시했지만 실제 지급 기능이
-- 없었습니다. 매일 1회(스케줄 작업)로 그날 생일인 고객에게 3,000원
-- 생일축하 쿠폰을 자동 발급하고, 문자로 알립니다. 방문 횟수 기준
-- 할인권과 같은 "내 할인권함"에 표시되도록 reward_rule_id 방식을
-- 그대로 사용하되, 방문 횟수 트리거(auto_issue_reward)에는 절대
-- 걸리지 않도록 is_birthday로 구분합니다. 유효기간도 6개월이 아닌
-- 발급일로부터 30일로 별도 지정합니다(customer_rewards.expires_at).
-- ============================================================

-- 1. reward_rules에 생일 전용 규칙 구분 컬럼 추가
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS is_birthday BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. 생일축하 쿠폰 규칙 1건 등록 (threshold_visits는 방문 트리거에서
--    아예 제외되므로 실질적으로 쓰이지 않는 값입니다)
INSERT INTO reward_rules (threshold_visits, amount, is_repeating, repeat_interval, is_birthday)
SELECT 1, 3000, FALSE, NULL, TRUE
WHERE NOT EXISTS (SELECT 1 FROM reward_rules WHERE is_birthday = TRUE);

-- 3. 방문 횟수 기준 자동 발급 함수에서 생일 규칙을 제외
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
    AND r.threshold_visits <= p_visit_count

  UNION ALL

  -- 반복 규칙 (threshold_visits, threshold_visits+interval, ... <= p_visit_count)
  SELECT r.id, gs.n::INTEGER, r.amount
  FROM reward_rules r
  CROSS JOIN LATERAL generate_series(r.threshold_visits, p_visit_count, r.repeat_interval) AS gs(n)
  WHERE r.is_active = TRUE
    AND r.is_repeating = TRUE
    AND r.is_birthday = FALSE
    AND r.repeat_interval > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. customer_rewards에 발급 유형/유효기간/생일연도 컬럼 추가
ALTER TABLE customer_rewards ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'visit';
ALTER TABLE customer_rewards ADD CONSTRAINT chk_customer_rewards_source CHECK (source IN ('visit', 'birthday'));
ALTER TABLE customer_rewards ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;
ALTER TABLE customer_rewards ADD COLUMN IF NOT EXISTS birthday_year INTEGER;

-- 같은 고객에게 같은 해에 생일 쿠폰이 두 번 발급되지 않도록 방지
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_rewards_birthday_year
  ON customer_rewards (customer_id, birthday_year)
  WHERE source = 'birthday';

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
