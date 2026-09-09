-- ============================================================
-- 해율 자연의 흐름 전자여권 — VIP 방문 할인권 재설계
-- 019_vip_reward_redesign.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~018 마이그레이션 실행 이후에 실행하세요.
--
-- 변경 내용:
--   - 기존 "30회부터 5회마다 5,000원(반복)" 규칙을 비활성화합니다.
--   - 30회는 1회성 VIP 축하쿠폰 10,000원으로 신설합니다.
--   - 35회부터 5회마다(35, 40, 45, ...) 반복되는 5,000원 규칙을 신설합니다.
--
-- 이미 발급된 과거 쿠폰(customer_rewards)은 발급 시점 값 그대로 남아있으므로
-- 영향 없습니다. 앞으로 새로 30회/35회 이상에 도달하는 고객부터 새 기준이
-- 적용됩니다(합의된 사항).
-- ============================================================

-- 1. 기존 "30회부터 5회마다 5,000원" 규칙 비활성화
UPDATE reward_rules
SET is_active = FALSE
WHERE is_active = TRUE
  AND is_birthday = FALSE
  AND is_comeback = FALSE
  AND threshold_visits = 30
  AND is_repeating = TRUE
  AND repeat_interval = 5
  AND amount = 5000;

-- 2. 새 기준으로 등록 (동일 조건의 활성 규칙이 이미 있으면 건너뜀 — 재실행 안전)
INSERT INTO reward_rules (threshold_visits, amount, is_repeating, repeat_interval, is_birthday, is_comeback)
SELECT * FROM (VALUES
  (30, 10000, FALSE, NULL::INTEGER, FALSE, FALSE),
  (35, 5000,  TRUE,  5,             FALSE, FALSE)
) AS new_rules(threshold_visits, amount, is_repeating, repeat_interval, is_birthday, is_comeback)
WHERE NOT EXISTS (
  SELECT 1 FROM reward_rules r
  WHERE r.is_active = TRUE
    AND r.is_birthday = FALSE
    AND r.is_comeback = FALSE
    AND r.threshold_visits = new_rules.threshold_visits
    AND r.amount = new_rules.amount
    AND r.is_repeating = new_rules.is_repeating
    AND r.repeat_interval IS NOT DISTINCT FROM new_rules.repeat_interval
);

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
