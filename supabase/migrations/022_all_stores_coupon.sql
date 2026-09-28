-- ============================================================
-- 해율푸드 방문여권 — 세 매장 완주 선물
-- 022_all_stores_coupon.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~021 마이그레이션 실행 이후에 실행하세요.
--
-- 해율만두전골·곤드레밥집·정담명가 남원추어탕 세 매장을 모두 방문한 고객에게
-- 5,000원 "세 매장 완주 선물" 할인권을 평생 한 번 자동 발급합니다.
--   - QR 인증(+위치 확인)을 통과해 기록된, 취소되지 않은 방문만 인정합니다.
--   - 유효기간은 다른 방문 할인권과 같이 발급일로부터 6개월입니다
--     (expires_at 비움 → issued_at + 6개월로 계산).
--   - 방문 취소로 세 매장 조건이 깨지면, 아직 쓰지 않은 선물은 자동 회수(삭제)
--     합니다. 이미 쓴 선물은 되돌릴 수 없어 그대로 둡니다(관리자 화면에서 안내).
--   - 발급 매장(issued_store_id)에는 세 번째 매장을 방문해 완주를 달성한
--     매장을 기록합니다.
--
-- 생일·컴백 쿠폰과 같이 reward_rule_id 방식을 써서 "내 할인권함"에 표시되도록
-- 하되, 방문 횟수 트리거(auto_issue_reward)에는 걸리지 않도록 is_all_stores로
-- 구분합니다. 규칙을 비활성화(is_active = FALSE)하면 새 발급이 멈춥니다.
-- ============================================================

-- 1. reward_rules에 세 매장 완주 전용 규칙 구분 컬럼 추가
ALTER TABLE reward_rules ADD COLUMN IF NOT EXISTS is_all_stores BOOLEAN NOT NULL DEFAULT FALSE;

-- 2. 세 매장 완주 규칙 1건 등록 (threshold_visits는 방문 트리거에서 아예
--    제외되므로 실질적으로 쓰이지 않는 값입니다)
INSERT INTO reward_rules (threshold_visits, amount, is_repeating, repeat_interval, is_all_stores)
SELECT 1, 5000, FALSE, NULL, TRUE
WHERE NOT EXISTS (SELECT 1 FROM reward_rules WHERE is_all_stores = TRUE);

-- 3. 방문 횟수 기준 자동 발급 함수에서 생일·컴백·세 매장 완주 규칙을 모두 제외
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
    AND r.repeat_interval > 0;
END;
$$ LANGUAGE plpgsql STABLE;

-- 4. customer_rewards.source에 'all_stores' 값 허용
ALTER TABLE customer_rewards DROP CONSTRAINT IF EXISTS chk_customer_rewards_source;
ALTER TABLE customer_rewards ADD CONSTRAINT chk_customer_rewards_source
  CHECK (source IN ('visit', 'birthday', 'comeback', 'all_stores'));

-- 5. 고객 1명당 세 매장 완주 선물은 1장만 (동시에 두 매장에서 방문해도 중복 발급 방지)
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_rewards_all_stores
  ON customer_rewards (customer_id)
  WHERE source = 'all_stores';

-- 6. 방문이 기록·취소·복구될 때마다 세 매장 완주 여부를 다시 확인해
--    선물을 발급하거나(조건 충족) 미사용 선물을 회수합니다(조건 깨짐).
CREATE OR REPLACE FUNCTION sync_all_stores_coupon()
RETURNS TRIGGER AS $$
DECLARE
  v_visited_stores INTEGER;
  v_rule_id UUID;
  v_amount INTEGER;
BEGIN
  SELECT COUNT(DISTINCT s.store_code) INTO v_visited_stores
  FROM visits v
  JOIN stores s ON s.id = v.store_id
  WHERE v.customer_id = NEW.customer_id
    AND v.is_cancelled = FALSE
    AND s.store_code IN ('haeyul', 'gondre', 'jeongdam');

  IF v_visited_stores >= 3 THEN
    SELECT r.id, r.amount INTO v_rule_id, v_amount
    FROM reward_rules r
    WHERE r.is_all_stores = TRUE AND r.is_active = TRUE
    ORDER BY r.created_at DESC
    LIMIT 1;

    IF v_rule_id IS NOT NULL THEN
      INSERT INTO customer_rewards
        (customer_id, reward_rule_id, threshold_visits, amount, status, issued_at, issued_store_id, source)
      VALUES
        (NEW.customer_id, v_rule_id, NULL, v_amount, 'available', NOW(), NEW.store_id, 'all_stores')
      ON CONFLICT (customer_id) WHERE source = 'all_stores'
      DO NOTHING;
    END IF;
  ELSE
    DELETE FROM customer_rewards
    WHERE customer_id = NEW.customer_id
      AND source = 'all_stores'
      AND status = 'available';
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_all_stores_coupon ON visits;
CREATE TRIGGER trg_sync_all_stores_coupon
  AFTER INSERT OR UPDATE OF is_cancelled ON visits
  FOR EACH ROW EXECUTE FUNCTION sync_all_stores_coupon();

-- 7. 할인권 사용 한도(한 번 결제에 2장) 확인용 — 고객별 사용 시각 조회 인덱스
CREATE INDEX IF NOT EXISTS idx_customer_rewards_customer_used_at
  ON customer_rewards (customer_id, used_at)
  WHERE status = 'used';

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
