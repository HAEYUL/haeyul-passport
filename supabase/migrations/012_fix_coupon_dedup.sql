-- ============================================================
-- 해율 자연의 흐름 전자여권 — 할인권 중복 발급 방지 기준 수정
-- 012_fix_coupon_dedup.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 011_customer_number_5digit.sql 실행 이후에 실행하세요.
--
-- 문제: auto_issue_reward 트리거는 "(고객, 규칙 ID, 방문횟수)" 조합으로 중복을
-- 막습니다. 그런데 할인권 규칙을 "기존 규칙 비활성화 + 새 규칙 추가" 방식으로
-- 개편하면, 같은 방문횟수 기준이라도 규칙 ID가 달라져서 트리거가 "아직 안 받은
-- 할인권"으로 착각하고 재발급합니다. 실제로 2026-08-17 규칙 개편 이후 첫 방문
-- 고객(유종범)에게 3·5·10·15·20회 할인권이 중복 발급되는 사고가 있었습니다.
--
-- 수정: 중복 방지 기준을 규칙 ID가 아니라 "고객 + 실제 달성한 방문횟수"로
-- 바꿉니다. 이러면 어떤 규칙 행이 발급했든, 같은 방문횟수 기준으로는 평생 한
-- 번만 할인권을 받습니다.
-- ============================================================

-- 1. 기존 유니크 인덱스 교체
DROP INDEX IF EXISTS uq_customer_rewards_coupon;

CREATE UNIQUE INDEX uq_customer_rewards_coupon
  ON customer_rewards (customer_id, threshold_visits)
  WHERE reward_rule_id IS NOT NULL;

-- 2. 트리거 함수의 ON CONFLICT 절을 새 인덱스 기준으로 교체
CREATE OR REPLACE FUNCTION auto_issue_reward()
RETURNS TRIGGER AS $$
DECLARE
  rec RECORD;
  v_store_id UUID;
BEGIN
  IF NEW.visit_count <= 0 THEN
    RETURN NEW;
  END IF;

  v_store_id := NULLIF(current_setting('app.current_visit_store_id', true), '')::UUID;
  IF v_store_id IS NULL THEN
    SELECT id INTO v_store_id FROM stores WHERE store_code = 'haeyul';
  END IF;

  FOR rec IN SELECT * FROM compute_coupon_instances(NEW.visit_count) LOOP
    INSERT INTO customer_rewards
      (customer_id, reward_rule_id, threshold_visits, amount, status, issued_at, issued_store_id)
    VALUES
      (NEW.id, rec.reward_rule_id, rec.threshold_visits, rec.amount, 'available', NOW(), v_store_id)
    ON CONFLICT (customer_id, threshold_visits) WHERE reward_rule_id IS NOT NULL
    DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
