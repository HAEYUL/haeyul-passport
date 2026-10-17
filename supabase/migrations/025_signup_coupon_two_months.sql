-- ============================================================
-- 해율 자연의 흐름 전자여권 — 가입 축하 할인권 유효기간 2개월
-- 025_signup_coupon_two_months.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~024 마이그레이션 실행 이후에 실행하세요.
--
-- 변경 내용:
--   - 앞으로 새로 가입하는 고객의 가입 축하 할인권 유효기간을 1개월 → 2개월로 늘립니다.
--     (해율만두전골 단독 운영에서는 재방문 간격이 길어 1개월이면 쓰기 전에 사라지기 쉬움)
--   - 이미 발급된 가입 축하 할인권(1개월)은 그대로 둡니다. (합의된 사항)
--   - 코드의 SIGNUP_COUPON_VALID_MONTHS(constants.ts)와 같은 값이어야 합니다.
-- ============================================================

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
      -- 발급일로부터 2개월 되는 날 밤 23:59:59(한국시간)
      (((v_issue_day + INTERVAL '2 months')::DATE)::TIMESTAMP + INTERVAL '23 hours 59 minutes 59 seconds')
        AT TIME ZONE 'Asia/Seoul',
      NEW.signup_store_id, 'signup'
    )
  ON CONFLICT (customer_id) WHERE source = 'signup'
  DO NOTHING;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
