-- ============================================================
-- 023_admin_stats_functions.sql
--
-- 관리자 대시보드·통계·고객 목록 집계를 데이터베이스 안에서 계산하는 함수들.
--
-- 지금까지는 방문·할인권 기록을 전부 앱으로 가져와 앱에서 셌습니다.
-- 회원이 수만 명, 방문이 수십만 건이 되면 (1) Supabase가 한 번에 1,000행까지만
-- 돌려줘서 숫자가 틀리거나 (2) 나눠 읽느라 화면이 매우 느려집니다.
-- 아래 함수들은 DB에서 바로 세서 "결과 숫자/요약 행"만 돌려줍니다.
--
-- 모든 함수는 관리자 서버(service_role)만 실행할 수 있습니다.
-- ============================================================

-- 집계에 쓰는 기간 조건용 인덱스
CREATE INDEX IF NOT EXISTS idx_customer_rewards_issued_at ON customer_rewards (issued_at);
CREATE INDEX IF NOT EXISTS idx_customer_rewards_used_at ON customer_rewards (used_at) WHERE status = 'used';
CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers (created_at);
CREATE INDEX IF NOT EXISTS idx_visits_customer_date ON visits (customer_id, visit_date) WHERE is_cancelled = FALSE;

-- ------------------------------------------------------------
-- 1. 고객별 최근 방문일 — {"고객ID": "YYYY-MM-DD", ...} 형태의 JSON 하나로 돌려줍니다.
--    (표 형태로 돌려주면 한 번에 1,000행까지만 받을 수 있어 여러 번 나눠 받아야 하므로)
--    p_customer_ids: 이 고객들만 (NULL이면 전체)
--    p_before: 최근 방문일이 이 날짜보다 이전인 고객만 (NULL이면 제한 없음)
--    p_on_or_after: 최근 방문일이 이 날짜 이후(포함)인 고객만 (NULL이면 제한 없음)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_customer_last_visits(UUID[], DATE, DATE);
CREATE OR REPLACE FUNCTION admin_customer_last_visits(
  p_customer_ids UUID[] DEFAULT NULL,
  p_before DATE DEFAULT NULL,
  p_on_or_after DATE DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(jsonb_object_agg(t.customer_id, t.last_visit_date), '{}'::JSONB)
  FROM (
    SELECT v.customer_id, MAX(v.visit_date) AS last_visit_date
    FROM visits v
    WHERE v.is_cancelled = FALSE
      -- 고객 id 목록이 길어도 빠르도록 배열 비교(ANY) 대신 목록과 조인(IN 서브쿼리)합니다.
      AND (p_customer_ids IS NULL OR v.customer_id IN (SELECT unnest(p_customer_ids)))
    GROUP BY v.customer_id
    HAVING (p_before IS NULL OR MAX(v.visit_date) < p_before)
       AND (p_on_or_after IS NULL OR MAX(v.visit_date) >= p_on_or_after)
  ) t
$$;

-- ------------------------------------------------------------
-- 2. 장기 미방문 구간별 인원 (활성 고객, 방문 기록이 있는 고객 기준)
--    p_store_id: 가입 매장 기준으로 좁힘 (NULL이면 전체)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_long_absent_counts(p_today DATE, p_store_id UUID DEFAULT NULL)
RETURNS TABLE (from30to59 BIGINT, from60to89 BIGINT, from90plus BIGINT)
LANGUAGE sql STABLE
AS $$
  WITH last_visits AS (
    SELECT v.customer_id, MAX(v.visit_date) AS d
    FROM visits v
    WHERE v.is_cancelled = FALSE
    GROUP BY v.customer_id
  )
  SELECT
    COUNT(*) FILTER (WHERE lv.d < p_today - 30 AND lv.d >= p_today - 60),
    COUNT(*) FILTER (WHERE lv.d < p_today - 60 AND lv.d >= p_today - 90),
    COUNT(*) FILTER (WHERE lv.d < p_today - 90)
  FROM last_visits lv
  JOIN customers c ON c.id = lv.customer_id
  WHERE c.is_active = TRUE
    AND (p_store_id IS NULL OR c.signup_store_id = p_store_id)
$$;

-- ------------------------------------------------------------
-- 3. 고객별로 다녀간 매장 목록 (세 매장 완주 판단용)
--    {"고객ID": [매장 번호, ...], ...} 형태의 JSON 하나로 돌려줍니다.
--    매장 번호는 p_store_ids 안에서의 순서(1부터)입니다. (매장ID를 반복하지 않아 응답이 작습니다)
--    p_store_ids: 완주 대상 매장
--    p_customer_ids: 이 고객들만 (NULL이면 전체)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_customer_store_sets(UUID[], UUID[]);
CREATE OR REPLACE FUNCTION admin_customer_store_sets(
  p_store_ids UUID[],
  p_customer_ids UUID[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(jsonb_object_agg(t.customer_id, t.store_ids), '{}'::JSONB)
  FROM (
    SELECT v.customer_id, ARRAY_AGG(DISTINCT array_position(p_store_ids, v.store_id)) AS store_ids
    FROM visits v
    WHERE v.is_cancelled = FALSE
      AND v.store_id = ANY (p_store_ids)
      AND (p_customer_ids IS NULL OR v.customer_id IN (SELECT unnest(p_customer_ids)))
    GROUP BY v.customer_id
  ) t
$$;

-- ------------------------------------------------------------
-- 4. 세 매장 완주 / 한 곳만 남은 활성 고객 수
--    p_store_id: 가입 매장 기준으로 좁힘 (NULL이면 전체)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_all_stores_counts(p_store_ids UUID[], p_store_id UUID DEFAULT NULL)
RETURNS TABLE (completed BIGINT, one_left BIGINT)
LANGUAGE sql STABLE
AS $$
  WITH per_customer AS (
    SELECT v.customer_id, COUNT(DISTINCT v.store_id) AS n
    FROM visits v
    WHERE v.is_cancelled = FALSE
      AND v.store_id = ANY (p_store_ids)
    GROUP BY v.customer_id
  )
  SELECT
    COUNT(*) FILTER (WHERE COALESCE(array_length(p_store_ids, 1), 0) > 0 AND pc.n >= array_length(p_store_ids, 1)),
    COUNT(*) FILTER (WHERE COALESCE(array_length(p_store_ids, 1), 0) > 0 AND pc.n = array_length(p_store_ids, 1) - 1)
  FROM per_customer pc
  JOIN customers c ON c.id = pc.customer_id
  WHERE c.is_active = TRUE
    AND (p_store_id IS NULL OR c.signup_store_id = p_store_id)
$$;

-- ------------------------------------------------------------
-- 5. 방문 할인권: 달성 횟수(threshold_visits)·상태별 발급 건수
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_reward_threshold_counts(p_store_id UUID DEFAULT NULL)
RETURNS TABLE (threshold_visits INT, status TEXT, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT cr.threshold_visits, cr.status::TEXT, COUNT(*)
  FROM customer_rewards cr
  WHERE cr.source = 'visit'
    AND cr.reward_rule_id IS NOT NULL
    AND (p_store_id IS NULL OR cr.issued_store_id = p_store_id)
  GROUP BY cr.threshold_visits, cr.status
$$;

-- ------------------------------------------------------------
-- 6. 기간 내 발급된 할인권: 발급 매장·종류별 금액 합계와 건수
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_reward_issued_summary(p_from TIMESTAMPTZ, p_to TIMESTAMPTZ)
RETURNS TABLE (issued_store_id UUID, source TEXT, amount_sum BIGINT, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT cr.issued_store_id, cr.source, COALESCE(SUM(cr.amount), 0), COUNT(*)
  FROM customer_rewards cr
  WHERE cr.reward_rule_id IS NOT NULL
    AND cr.issued_at >= p_from
    AND cr.issued_at <= p_to
  GROUP BY cr.issued_store_id, cr.source
$$;

-- ------------------------------------------------------------
-- 7. 기간 내 사용된 할인권: 사용 매장·금액·종류별 건수
--    p_store_id: 사용 매장으로 좁힘 (NULL이면 전체)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_reward_used_summary(
  p_from TIMESTAMPTZ,
  p_to TIMESTAMPTZ,
  p_store_id UUID DEFAULT NULL
)
RETURNS TABLE (used_store_id UUID, amount INT, source TEXT, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT cr.used_store_id, COALESCE(cr.amount, 0), cr.source, COUNT(*)
  FROM customer_rewards cr
  WHERE cr.status = 'used'
    AND cr.reward_rule_id IS NOT NULL
    AND cr.used_store_id IS NOT NULL
    AND cr.used_at >= p_from
    AND cr.used_at <= p_to
    AND (p_store_id IS NULL OR cr.used_store_id = p_store_id)
  GROUP BY cr.used_store_id, COALESCE(cr.amount, 0), cr.source
$$;

-- ------------------------------------------------------------
-- 8. 같은 고객·같은 날·같은 매장의 취소되지 않은 중복 방문 기록
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_duplicate_visits()
RETURNS TABLE (id UUID, customer_id UUID, store_id UUID, visit_date DATE, visit_time TIMESTAMPTZ)
LANGUAGE sql STABLE
AS $$
  SELECT v.id, v.customer_id, v.store_id, v.visit_date, v.visit_time
  FROM visits v
  JOIN (
    SELECT customer_id, visit_date, store_id
    FROM visits
    WHERE is_cancelled = FALSE
    GROUP BY customer_id, visit_date, store_id
    HAVING COUNT(*) > 1
  ) d ON d.customer_id = v.customer_id AND d.visit_date = v.visit_date AND d.store_id = v.store_id
  WHERE v.is_cancelled = FALSE
$$;

-- ------------------------------------------------------------
-- 9. customers.visit_count와 실제 방문 기록 수가 다른 활성 고객
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_visit_count_mismatches()
RETURNS TABLE (customer_id UUID, recorded_count INT, actual_count BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT c.id, c.visit_count, COALESCE(v.cnt, 0)
  FROM customers c
  LEFT JOIN (
    SELECT customer_id, COUNT(*) AS cnt
    FROM visits
    WHERE is_cancelled = FALSE
    GROUP BY customer_id
  ) v ON v.customer_id = c.id
  WHERE c.is_active = TRUE
    AND c.visit_count <> COALESCE(v.cnt, 0)
$$;

-- ------------------------------------------------------------
-- 10. 날짜별 방문 수 (취소 제외)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_daily_visit_counts(p_from DATE, p_to DATE, p_store_id UUID DEFAULT NULL)
RETURNS TABLE (day DATE, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT v.visit_date, COUNT(*)
  FROM visits v
  WHERE v.is_cancelled = FALSE
    AND v.visit_date BETWEEN p_from AND p_to
    AND (p_store_id IS NULL OR v.store_id = p_store_id)
  GROUP BY v.visit_date
$$;

-- ------------------------------------------------------------
-- 11. 날짜별(한국 날짜) 신규 가입 수 (활성 고객)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_daily_signup_counts(p_from DATE, p_to DATE, p_store_id UUID DEFAULT NULL)
RETURNS TABLE (day DATE, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT (c.created_at AT TIME ZONE 'Asia/Seoul')::DATE AS day, COUNT(*)
  FROM customers c
  WHERE c.is_active = TRUE
    AND c.created_at >= (p_from::TIMESTAMP AT TIME ZONE 'Asia/Seoul')
    AND c.created_at < ((p_to + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul')
    AND (p_store_id IS NULL OR c.signup_store_id = p_store_id)
  GROUP BY 1
$$;

-- ------------------------------------------------------------
-- 12. 날짜별(한국 날짜) VIP 전환 수 (VIP 기준 회차 할인권 발급 기준)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_daily_vip_counts(
  p_from DATE,
  p_to DATE,
  p_threshold INT,
  p_store_id UUID DEFAULT NULL
)
RETURNS TABLE (day DATE, cnt BIGINT)
LANGUAGE sql STABLE
AS $$
  SELECT (cr.issued_at AT TIME ZONE 'Asia/Seoul')::DATE AS day, COUNT(*)
  FROM customer_rewards cr
  WHERE cr.threshold_visits = p_threshold
    AND cr.reward_rule_id IS NOT NULL
    AND cr.issued_at >= (p_from::TIMESTAMP AT TIME ZONE 'Asia/Seoul')
    AND cr.issued_at < ((p_to + 1)::TIMESTAMP AT TIME ZONE 'Asia/Seoul')
    AND (p_store_id IS NULL OR cr.issued_store_id = p_store_id)
  GROUP BY 1
$$;

-- ------------------------------------------------------------
-- 13. 기간(구간)별 신규/재방문 고객 수
--     구간 안에 방문한 고객 중, 첫 방문일(모든 매장 기준)이 그 구간 안이면 신규, 아니면 재방문.
--     p_starts / p_ends: 같은 길이의 구간 시작·끝 날짜 배열 (bucket_index는 1부터)
--     p_store_id: 구간 안 방문을 이 매장 방문으로 좁힘 (첫 방문일은 모든 매장 기준)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_new_returning_counts(
  p_starts DATE[],
  p_ends DATE[],
  p_store_id UUID DEFAULT NULL
)
RETURNS TABLE (bucket_index INT, new_count BIGINT, returning_count BIGINT)
LANGUAGE sql STABLE
AS $$
  WITH buckets AS (
    SELECT i AS bucket_index, p_starts[i] AS s, p_ends[i] AS e
    FROM generate_subscripts(p_starts, 1) AS i
  ),
  in_bucket AS (
    SELECT DISTINCT b.bucket_index, b.s, b.e, v.customer_id
    FROM buckets b
    JOIN visits v
      ON v.is_cancelled = FALSE
     AND v.visit_date BETWEEN b.s AND b.e
     AND (p_store_id IS NULL OR v.store_id = p_store_id)
  ),
  first_visits AS (
    SELECT v.customer_id, MIN(v.visit_date) AS first_date
    FROM visits v
    WHERE v.is_cancelled = FALSE
      AND v.customer_id IN (SELECT customer_id FROM in_bucket)
    GROUP BY v.customer_id
  )
  SELECT b.bucket_index,
         COUNT(ib.customer_id) FILTER (WHERE fv.first_date BETWEEN ib.s AND ib.e),
         COUNT(ib.customer_id) FILTER (WHERE fv.first_date IS NULL OR fv.first_date NOT BETWEEN ib.s AND ib.e)
  FROM buckets b
  LEFT JOIN in_bucket ib ON ib.bucket_index = b.bucket_index
  LEFT JOIN first_visits fv ON fv.customer_id = ib.customer_id
  GROUP BY b.bucket_index
  ORDER BY b.bucket_index
$$;

-- ------------------------------------------------------------
-- 14. 외부 경영관리 시스템용 요약 통계 (JSON)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION admin_management_stats(p_today DATE)
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  WITH month_start AS (
    SELECT date_trunc('month', p_today)::DATE AS d
  ),
  active AS (
    SELECT c.id, c.visit_count, c.signup_store_id, (c.created_at AT TIME ZONE 'Asia/Seoul')::DATE AS created_day
    FROM customers c
    WHERE c.is_active = TRUE
  ),
  last_visits AS (
    SELECT v.customer_id, MAX(v.visit_date) AS d
    FROM visits v
    WHERE v.is_cancelled = FALSE
    GROUP BY v.customer_id
  ),
  absent AS (
    -- 방문 기록이 없는 고객도 장기 미방문으로 셉니다 (기존 계산 방식 유지)
    SELECT
      COUNT(*) FILTER (WHERE lv.d IS NULL OR lv.d < p_today - 30) AS d30,
      COUNT(*) FILTER (WHERE lv.d IS NULL OR lv.d < p_today - 60) AS d60,
      COUNT(*) FILTER (WHERE lv.d IS NULL OR lv.d < p_today - 90) AS d90
    FROM active a
    LEFT JOIN last_visits lv ON lv.customer_id = a.id
  ),
  store_visits AS (
    SELECT v.store_id,
           COUNT(*) AS total_visits,
           COUNT(*) FILTER (WHERE v.visit_date = p_today) AS today_visits
    FROM visits v
    WHERE v.is_cancelled = FALSE
    GROUP BY v.store_id
  )
  SELECT jsonb_build_object(
    'summary', jsonb_build_object(
      'totalCustomers', (SELECT COUNT(*) FROM active),
      'repeatCustomers', (SELECT COUNT(*) FROM active WHERE visit_count >= 2),
      'todayVisits', (SELECT COUNT(*) FROM visits WHERE is_cancelled = FALSE AND visit_date = p_today),
      'newCustomersThisMonth', (SELECT COUNT(*) FROM active, month_start m WHERE created_day >= m.d),
      'vipCount', (SELECT COUNT(*) FROM active WHERE visit_count >= 30),
      'rewardsIssuedThisMonth', (
        SELECT COUNT(*) FROM customer_rewards, month_start m
        WHERE reward_rule_id IS NOT NULL
          AND issued_at >= (m.d::TIMESTAMP AT TIME ZONE 'Asia/Seoul')
      ),
      'rewardsUsedThisMonth', (
        SELECT COUNT(*) FROM customer_rewards, month_start m
        WHERE reward_rule_id IS NOT NULL AND status = 'used'
          AND used_at >= (m.d::TIMESTAMP AT TIME ZONE 'Asia/Seoul')
      ),
      'longAbsent30Days', (SELECT d30 FROM absent),
      'longAbsent60Days', (SELECT d60 FROM absent),
      'longAbsent90Days', (SELECT d90 FROM absent)
    ),
    'stores', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'todayVisits', COALESCE(sv.today_visits, 0),
        'totalVisits', COALESCE(sv.total_visits, 0),
        'newCustomersThisMonth', (
          SELECT COUNT(*) FROM active a, month_start m
          WHERE a.signup_store_id = s.id AND a.created_day >= m.d
        )
      ) ORDER BY s.name)
      FROM stores s
      LEFT JOIN store_visits sv ON sv.store_id = s.id
    ), '[]'::JSONB)
  )
$$;

-- ------------------------------------------------------------
-- 15. 아직 사용하지 않은 할인권을 가진 고객 ID 목록 (중복 없이, JSON 배열)
-- ------------------------------------------------------------
DROP FUNCTION IF EXISTS admin_customers_with_unused_rewards();
CREATE OR REPLACE FUNCTION admin_customers_with_unused_rewards()
RETURNS JSONB
LANGUAGE sql STABLE
AS $$
  SELECT COALESCE(jsonb_agg(DISTINCT cr.customer_id), '[]'::JSONB)
  FROM customer_rewards cr
  WHERE cr.status <> 'used'
$$;

-- ------------------------------------------------------------
-- 실행 권한: 관리자 서버(service_role)만
-- ------------------------------------------------------------
DO $$
DECLARE
  fn TEXT;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'admin_customer_last_visits(uuid[], date, date)',
    'admin_long_absent_counts(date, uuid)',
    'admin_customer_store_sets(uuid[], uuid[])',
    'admin_all_stores_counts(uuid[], uuid)',
    'admin_reward_threshold_counts(uuid)',
    'admin_reward_issued_summary(timestamptz, timestamptz)',
    'admin_reward_used_summary(timestamptz, timestamptz, uuid)',
    'admin_duplicate_visits()',
    'admin_visit_count_mismatches()',
    'admin_daily_visit_counts(date, date, uuid)',
    'admin_daily_signup_counts(date, date, uuid)',
    'admin_daily_vip_counts(date, date, int, uuid)',
    'admin_new_returning_counts(date[], date[], uuid)',
    'admin_management_stats(date)',
    'admin_customers_with_unused_rewards()'
  ]
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
      EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
    END IF;
  END LOOP;
END $$;
