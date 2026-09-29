-- ============================================================
-- 해율푸드 방문여권 — 가입 축하 할인권
-- 024_signup_coupon.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~023 마이그레이션 실행 이후에 실행하세요. 여러 번 실행해도 안전합니다.
--
-- 새로 가입하는 고객에게 1,000원 "가입 축하 할인권"을 가입 즉시 1장 발급합니다.
--   - 이 파일을 실행한 뒤 새로 가입하는 고객부터 적용됩니다 (기존 회원에게는 발급하지 않음).
--   - 관리자 화면에서 직접 등록한 고객도 새 가입이므로 똑같이 발급됩니다.
--   - 유효기간: 발급일(한국 날짜)로부터 1개월 되는 날 밤 23:59:59까지
--     (예: 3월 5일 가입 → 4월 5일까지, 다음 달에 같은 날이 없으면 그 달 말일까지)
--   - 가입한 날에는 사용할 수 없고 다음 방문(다음 날)부터 사용합니다 — 앱에서 막습니다.
--   - 규칙을 비활성화(is_active = FALSE)하면 새 발급이 멈춥니다.
--
-- 세 매장 완주 선물과 같이 reward_rule_id 방식을 써서 "내 할인권함"에 표시되도록 하되,
-- 방문 횟수 자동 발급(compute_coupon_instances)에는 걸리지 않도록 is_signup으로 구분합니다.
-- ============================================================

-- 1. reward_rules에 가입 축하 전용 규칙 구분 컬럼 추가
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS is_signup BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. 가입 축하 규칙 1건 등록 (threshold_visits는 방문 자동 발급에서 제외되므로 쓰이지 않는 값)
INSERT INTO reward_rules (threshold_visits, amount, is_repeating, repeat_interval, is_signup)
SELECT 1, 1000, FALSE, NULL, TRUE
WHERE NOT EXISTS (SELECT 1 FROM reward_rules WHERE is_signup = TRUE);

-- 3. 방문 횟수 기준 자동 발급 함수에서 생일·컴백·세 매장 완주·가입 축하 규칙을 모두 제외
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
    AND r.is_all_stores = FALSE
    AND r.is_signup = FALSE
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
    AND r.is_all_stores = FALSE
    AND r.is_signup = FALSE
    AND r.repeat_interval > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. customer_rewards.source에 'signup' 값 허용
ALTER TABLE customer_rewards DROP CONSTRAINT IF EXISTS chk_customer_rewards_source;
ALTER TABLE customer_rewards ADD CONSTRAINT chk_customer_rewards_source
  CHECK (source IN ('visit', 'birthday', 'comeback', 'all_stores', 'signup'));

-- 5. 고객 1명당 가입 축하 할인권은 1장만
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_rewards_signup
  ON customer_rewards (customer_id)
  WHERE source = 'signup';

-- 6. 새 고객이 등록되면 가입 축하 할인권을 발급합니다.
--    발급 매장(issued_store_id)은 가입 매장입니다. (가입 매장이 없으면 발급하지 않음)
CREATE OR REPLACE FUNCTION issue_signup_coupon()
RETURNS TRIGGER AS $$
DECLARE
  v_rule_id UUID;
  v_amount INTEGER;
  v_issue_day DATE;
BEGIN
  IF NEW.signup_store_id IS NULL OR NEW.is_active = FALSE THEN
    RETURN NEW;
  END IF;

  SELECT r.id, r.amount INTO v_rule_id, v_amount
  FROM reward_rules r
  WHERE r.is_signup = TRUE AND r.is_active = TRUE
  ORDER BY r.created_at DESC
  LIMIT 1;

  IF v_rule_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_issue_day := (NOW() AT TIME ZONE 'Asia/Seoul')::DATE;

  INSERT INTO customer_rewards
    (customer_id, reward_rule_id, threshold_visits, amount, status, issued_at, expires_at, issued_store_id, source)
  VALUES
    (
      NEW.id, v_rule_id, NULL, v_amount, 'available', NOW(),
      -- 발급일로부터 1개월 되는 날 밤 23:59:59(한국시간)
      (((v_issue_day + INTERVAL '1 month')::DATE)::TIMESTAMP + INTERVAL '23 hours 59 minutes 59 seconds')
        AT TIME ZONE 'Asia/Seoul',
      NEW.signup_store_id, 'signup'
    )
  ON CONFLICT (customer_id) WHERE source = 'signup'
  DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_issue_signup_coupon ON customers;
CREATE TRIGGER trg_issue_signup_coupon
  AFTER INSERT ON customers
  FOR EACH ROW EXECUTE FUNCTION issue_signup_coupon();

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
