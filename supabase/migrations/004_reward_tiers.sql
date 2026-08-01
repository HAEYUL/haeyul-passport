-- ============================================================
-- 해율 자연의 흐름 전자여권 — 방문 등급 & 다단계 방문 선물
-- 004_reward_tiers.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001, 002, 003 마이그레이션 실행 이후에 실행하세요.
--
-- 방문 등급(새싹/푸른잎/나무/숲/해율 VIP)은 누적 방문 횟수로부터 그때그때
-- 계산하는 값이라 별도 컬럼을 두지 않습니다 (src/lib/tiers.ts 참고).
-- 이 파일은 "방문 선물"만 다룹니다: 3/5/10/20/30회에 한 번씩만 자동 발급.
-- ============================================================

-- ─── 1. rewards.required_visits 중복 방지 ─────────────────────────
-- 하나의 방문 횟수 임계값에는 하나의 선물만 연결되도록 보장합니다.
-- (이미 존재하면 건너뜁니다 — 재실행 안전)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'uq_rewards_required_visits'
  ) THEN
    ALTER TABLE rewards ADD CONSTRAINT uq_rewards_required_visits UNIQUE (required_visits);
  END IF;
END $$;

-- ─── 2. 기존 10회 선물 내용 변경 ─────────────────────────
-- (기존에 발급된 고객의 customer_rewards 행은 그대로 유지되고, 표시되는
--  선물명/설명만 새 내용으로 바뀝니다.)
UPDATE rewards
SET name = '동충하초 또는 노루궁뎅이 버섯',
    description = '해율을 10번 찾아주신 감사의 마음을 담아 준비한 동충하초 또는 노루궁뎅이 버섯입니다.'
WHERE required_visits = 10;

-- ─── 3. 신규 방문 선물 추가 (3 / 5 / 20 / 30회) ─────────────────────────
INSERT INTO rewards (name, description, required_visits) VALUES
  ('음료수 또는 만두 2알', '해율을 3번 찾아주신 것을 기념하여 준비한 작은 답례입니다. 음료수 또는 만두 2알 중 선택하실 수 있습니다.', 3),
  ('해율술빵 1개', '해율을 5번 찾아주신 것을 기념하여 준비한 해율술빵입니다.', 5),
  ('새싹인삼 + 전복 2미', '해율을 20번 찾아주신 것을 기념하여 준비한 새싹인삼과 전복 2미입니다.', 20),
  ('해율 VIP 특별 감사 선물', '해율을 30번 찾아주셔서 해율 VIP가 되신 것을 축하드리며 준비한 특별 감사 선물입니다.', 30)
ON CONFLICT (required_visits) DO NOTHING;

-- ─── 4. 자동 발급 트리거 함수를 다단계 임계값 지원으로 교체 ─────────────────────────
-- 방문 횟수가 바뀔 때마다, 현재 방문 횟수 이상을 요구하지 않는(=이미 달성한)
-- 활성 선물 중 아직 발급되지 않은 것을 모두 발급합니다.
-- customer_rewards(customer_id, reward_id)의 UNIQUE 인덱스(uq_customer_rewards_unique)가
-- 동일 선물의 중복 발급을 DB 레벨에서 막아줍니다.
CREATE OR REPLACE FUNCTION auto_issue_reward()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
BEGIN
  IF NEW.visit_count <= 0 THEN
    RETURN NEW;
  END IF;

  FOR r IN
    SELECT id FROM rewards
    WHERE required_visits <= NEW.visit_count AND is_active = TRUE
  LOOP
    INSERT INTO customer_rewards (customer_id, reward_id, status, issued_at)
    VALUES (NEW.id, r.id, 'available', NOW())
    ON CONFLICT (customer_id, reward_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── 5. 기존 고객 백필 ─────────────────────────
-- 새로 추가된 임계값(3/5/20/30회)을 이미 달성한 기존 고객에게도
-- 선물을 소급 발급합니다. (이미 발급된 선물은 건드리지 않습니다.)
DO $$
DECLARE
  c RECORD;
  r RECORD;
BEGIN
  FOR c IN SELECT id, visit_count FROM customers WHERE is_active = TRUE AND visit_count > 0 LOOP
    FOR r IN SELECT id FROM rewards WHERE required_visits <= c.visit_count AND is_active = TRUE LOOP
      INSERT INTO customer_rewards (customer_id, reward_id, status, issued_at)
      VALUES (c.id, r.id, 'available', NOW())
      ON CONFLICT (customer_id, reward_id) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
