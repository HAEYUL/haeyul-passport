-- ============================================================
-- 해율 자연의 흐름 전자여권 — 방문 횟수별 할인권 규칙 재설정
-- 017_reset_visit_reward_rules.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~016 마이그레이션 실행 이후에 실행하세요.
--
-- 기존 방문 기준 할인권 규칙(생일쿠폰 제외)을 비활성화하고, 아래 새 기준으로
-- 교체합니다. 이미 발급/사용된 과거 쿠폰(customer_rewards)은 금액·기준이
-- 발급 시점 값 그대로 남아있으므로 영향 없습니다 — 규칙 행은 삭제하지 않고
-- 비활성화만 해서 과거 기록의 참조 무결성을 유지합니다.
--
-- 새 기준:
--   3회 1,000원 / 5회 2,000원 / 10회 3,000원 / 15회 3,000원 /
--   20회 4,000원 / 25회 4,000원 / 30회부터 5회마다 5,000원(반복)
--
-- 참고: 이미 10~29회 사이를 방문한 기존 고객은, 다음 방문 시 새로 생긴
-- 10·15·20·25회 구간을 소급으로 인정받아 밀린 쿠폰을 한번에 받게 됩니다.
-- (합의된 사항입니다.)
-- ============================================================

-- 1. 기존 방문 기준 규칙(생일 제외) 비활성화
UPDATE reward_rules
SET is_active = FALSE
WHERE is_birthday = FALSE
  AND is_active = TRUE;

-- 2. 새 기준으로 재등록 (동일 조건의 활성 규칙이 이미 있으면 건너뜀 — 재실행 안전)
INSERT INTO reward_rules (threshold_visits, amount, is_repeating, repeat_interval, is_birthday)
SELECT * FROM (VALUES
  (3,  1000, FALSE, NULL::INTEGER, FALSE),
  (5,  2000, FALSE, NULL::INTEGER, FALSE),
  (10, 3000, FALSE, NULL::INTEGER, FALSE),
  (15, 3000, FALSE, NULL::INTEGER, FALSE),
  (20, 4000, FALSE, NULL::INTEGER, FALSE),
  (25, 4000, FALSE, NULL::INTEGER, FALSE),
  (30, 5000, TRUE,  5,             FALSE)
) AS new_rules(threshold_visits, amount, is_repeating, repeat_interval, is_birthday)
WHERE NOT EXISTS (
  SELECT 1 FROM reward_rules r
  WHERE r.is_active = TRUE
    AND r.is_birthday = FALSE
    AND r.threshold_visits = new_rules.threshold_visits
    AND r.amount = new_rules.amount
    AND r.is_repeating = new_rules.is_repeating
    AND r.repeat_interval IS NOT DISTINCT FROM new_rules.repeat_interval
);

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
