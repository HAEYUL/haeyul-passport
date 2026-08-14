-- ============================================================
-- 해율 자연의 흐름 전자여권 — 실물 선물 → 금액형 할인권(쿠폰) 전환
-- 008_coupon_rewards.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 007_multi_store.sql 실행 이후에 실행하세요.
--
-- 실물 선물(rewards, 고정 5개 항목) 대신, 관리자가 직접 수정 가능한 규칙
-- (reward_rules)으로부터 계산되는 3매장 공통 금액형 할인권으로 전환합니다.
-- 기본 규칙: 3회 1,000원 / 5회 2,000원 / 10회 3,000원 / 15회 4,000원 /
--           20회부터 5회마다(20,25,30...) 5,000원 반복 지급
-- ============================================================

-- ============================================================
-- 1. reward_rules — 할인권 지급 규칙 (관리자가 직접 수정)
-- ============================================================
CREATE TABLE reward_rules (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  threshold_visits  INTEGER NOT NULL,             -- 지급 시작 기준 방문 횟수
  amount            INTEGER NOT NULL,             -- 할인 금액(원)
  is_repeating      BOOLEAN NOT NULL DEFAULT FALSE,
  repeat_interval   INTEGER,                      -- 반복 지급 간격(회). is_repeating=TRUE일 때만 사용
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_reward_rules_amount CHECK (amount > 0),
  CONSTRAINT chk_reward_rules_threshold CHECK (threshold_visits > 0),
  CONSTRAINT chk_reward_rules_repeat CHECK (NOT is_repeating OR repeat_interval > 0)
);

CREATE TRIGGER trg_reward_rules_updated BEFORE UPDATE ON reward_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO reward_rules (threshold_visits, amount, is_repeating, repeat_interval) VALUES
  (3,  1000, FALSE, NULL),
  (5,  2000, FALSE, NULL),
  (10, 3000, FALSE, NULL),
  (15, 4000, FALSE, NULL),
  (20, 5000, TRUE,  5);

ALTER TABLE reward_rules ENABLE ROW LEVEL SECURITY;
-- reward_rules는 service_role로만 접근 (관리자 화면에서만 조회/수정)

-- ============================================================
-- 2. customer_rewards — 할인권(쿠폰) 발급 방식 지원
-- ============================================================
-- 기존 reward_id(실물 선물)는 과거 기록 보존을 위해 남겨두되 nullable로 전환하고,
-- 새 발급은 reward_rule_id + threshold_visits + amount(발급 시점 금액 고정)로 기록합니다.
ALTER TABLE customer_rewards ALTER COLUMN reward_id DROP NOT NULL;
ALTER TABLE customer_rewards ADD COLUMN reward_rule_id UUID REFERENCES reward_rules(id);
ALTER TABLE customer_rewards ADD COLUMN threshold_visits INTEGER;
ALTER TABLE customer_rewards ADD COLUMN amount INTEGER;

ALTER TABLE customer_rewards ADD CONSTRAINT chk_reward_or_rule
  CHECK (reward_id IS NOT NULL OR reward_rule_id IS NOT NULL);

-- 동일 고객이 동일 규칙의 동일 기준(threshold_visits) 할인권을 중복 수령하지 않도록 방지
CREATE UNIQUE INDEX uq_customer_rewards_coupon
  ON customer_rewards (customer_id, reward_rule_id, threshold_visits)
  WHERE reward_rule_id IS NOT NULL;

-- ============================================================
-- 3. 방문 횟수 → 할인권 목록 계산 함수 (트리거 + 소급 발급에서 공용으로 사용)
-- ============================================================
CREATE OR REPLACE FUNCTION compute_coupon_instances(p_visit_count INTEGER)
RETURNS TABLE(reward_rule_id UUID, threshold_visits INTEGER, amount INTEGER) AS $$
BEGIN
  RETURN QUERY
  -- 1회성 규칙
  SELECT r.id, r.threshold_visits, r.amount
  FROM reward_rules r
  WHERE r.is_active = TRUE
    AND r.is_repeating = FALSE
    AND r.threshold_visits <= p_visit_count

  UNION ALL

  -- 반복 규칙 (threshold_visits, threshold_visits+interval, ... <= p_visit_count)
  SELECT r.id, gs.n::INTEGER, r.amount
  FROM reward_rules r
  CROSS JOIN LATERAL generate_series(r.threshold_visits, p_visit_count, r.repeat_interval) AS gs(n)
  WHERE r.is_active = TRUE
    AND r.is_repeating = TRUE
    AND r.repeat_interval > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 4. 자동 발급 트리거를 reward_rules 기반으로 교체
-- ============================================================
-- update_visit_count()가 세션 로컬 설정에 남긴 방문 매장(app.current_visit_store_id,
-- 007_multi_store.sql 참고)을 그대로 재사용합니다.
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
    ON CONFLICT (customer_id, reward_rule_id, threshold_visits) WHERE reward_rule_id IS NOT NULL
    DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 5. 기존 고객 소급 재계산 발급
-- ============================================================
-- 현재 누적 방문 횟수를 기준으로, 새 규칙에 따라 아직 없는 할인권을 전부 발급합니다.
-- (이미 발급된 것은 uq_customer_rewards_coupon 제약으로 건너뜁니다.)
DO $$
DECLARE
  c RECORD;
  rec RECORD;
  v_haeyul_id UUID;
BEGIN
  SELECT id INTO v_haeyul_id FROM stores WHERE store_code = 'haeyul';

  FOR c IN SELECT id, visit_count FROM customers WHERE is_active = TRUE AND visit_count > 0 LOOP
    FOR rec IN SELECT * FROM compute_coupon_instances(c.visit_count) LOOP
      INSERT INTO customer_rewards
        (customer_id, reward_rule_id, threshold_visits, amount, status, issued_at, issued_store_id)
      VALUES
        (c.id, rec.reward_rule_id, rec.threshold_visits, rec.amount, 'available', NOW(), v_haeyul_id)
      ON CONFLICT (customer_id, reward_rule_id, threshold_visits) WHERE reward_rule_id IS NOT NULL
      DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 6. 기존에 '사용 완료'였던 실물 선물 → 같은 방문횟수 기준의 새 할인권도 사용 완료로
-- ============================================================
-- 예: 기존 10회 선물을 이미 사용했던 고객은, 새로 발급된 10회(3,000원) 할인권도
-- 사용 완료 상태로 맞춰줍니다. (사용일은 기존 기록을 그대로 이어받습니다.)
DO $$
DECLARE
  old_used RECORD;
  v_haeyul_id UUID;
BEGIN
  SELECT id INTO v_haeyul_id FROM stores WHERE store_code = 'haeyul';

  FOR old_used IN
    SELECT cr.customer_id, r.required_visits, cr.used_at
    FROM customer_rewards cr
    JOIN rewards r ON r.id = cr.reward_id
    WHERE cr.status = 'used'
  LOOP
    UPDATE customer_rewards
    SET status = 'used',
        used_at = old_used.used_at,
        used_store_id = v_haeyul_id
    WHERE customer_id = old_used.customer_id
      AND threshold_visits = old_used.required_visits
      AND reward_rule_id IS NOT NULL
      AND status != 'used';
  END LOOP;
END $$;

-- ============================================================
-- 7. 기존 실물 선물(rewards)은 삭제하지 않고 화면 노출만 중단
-- ============================================================
-- 고객용 화면(getRewardCatalog 등)과 RLS 공개 읽기 정책이 모두
-- is_active=TRUE 기준으로 필터링하므로, 비활성화만으로 화면에서 사라집니다.
UPDATE rewards SET is_active = FALSE;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
