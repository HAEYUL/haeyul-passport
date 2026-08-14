-- ============================================================
-- 해율 자연의 흐름 전자여권 — 멀티스토어(3매장) 구조 도입
-- 007_multi_store.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~006 마이그레이션 실행 이후에 실행하세요.
--
-- 해율푸드 브랜드 아래 해율만두전골 / 곤드레밥집 / 정담명가 남원추어탕
-- 3개 매장을 통합 회원(customers)이 함께 이용하는 구조로 확장합니다.
-- 기존 데이터는 전부 '해율만두전골(haeyul)' 매장 소속으로 이관됩니다.
-- ============================================================

-- ============================================================
-- 1. stores — 매장
-- ============================================================
CREATE TABLE stores (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_code  TEXT NOT NULL UNIQUE,          -- 'haeyul' / 'gondre' / 'jeongdam'
  name        TEXT NOT NULL,                 -- 매장명
  brand_name  TEXT NOT NULL DEFAULT '해율푸드',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER trg_stores_updated BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO stores (store_code, name, brand_name) VALUES
  ('haeyul',   '해율만두전골',        '해율푸드'),
  ('gondre',   '곤드레밥집',          '해율푸드'),
  ('jeongdam', '정담명가 남원추어탕', '해율푸드');

-- ============================================================
-- 2. store_qr_tokens — 매장별 방문 QR 토큰
-- ============================================================
-- 재발급할 때마다 새 행을 추가하고 이전 활성 토큰은 is_active=FALSE로
-- 전환하는 방식으로, 매장별 토큰 이력을 자연스럽게 남깁니다.
CREATE TABLE store_qr_tokens (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id    UUID NOT NULL REFERENCES stores(id),
  token       TEXT NOT NULL UNIQUE,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 매장당 활성 토큰은 항상 하나만 존재
CREATE UNIQUE INDEX uq_store_qr_tokens_active_per_store
  ON store_qr_tokens (store_id)
  WHERE is_active = TRUE;

CREATE INDEX idx_store_qr_tokens_store ON store_qr_tokens (store_id);

-- ============================================================
-- 3. visits — 매장 구분 추가
-- ============================================================
ALTER TABLE visits ADD COLUMN store_id UUID REFERENCES stores(id);

UPDATE visits
SET store_id = (SELECT id FROM stores WHERE store_code = 'haeyul')
WHERE store_id IS NULL;

ALTER TABLE visits ALTER COLUMN store_id SET NOT NULL;

CREATE INDEX idx_visits_store_id ON visits (store_id);

-- 하루 중복 방문 방지 제약을 매장 단위로 확장
-- (기존: 고객+날짜 중복 금지 → 변경: 고객+날짜+매장 중복 금지, 같은 날 다른 매장 방문은 허용)
DROP INDEX uq_visits_customer_date_active;

CREATE UNIQUE INDEX uq_visits_customer_date_store_active
  ON visits (customer_id, visit_date, store_id)
  WHERE is_cancelled = FALSE;

-- ============================================================
-- 4. customers — 가입 매장 추가
-- ============================================================
ALTER TABLE customers ADD COLUMN signup_store_id UUID REFERENCES stores(id);

UPDATE customers
SET signup_store_id = (SELECT id FROM stores WHERE store_code = 'haeyul')
WHERE signup_store_id IS NULL;

-- ============================================================
-- 5. customer_rewards — 발급/사용 매장 추가
-- ============================================================
ALTER TABLE customer_rewards ADD COLUMN issued_store_id UUID REFERENCES stores(id);
ALTER TABLE customer_rewards ADD COLUMN used_store_id UUID REFERENCES stores(id);

UPDATE customer_rewards
SET issued_store_id = (SELECT id FROM stores WHERE store_code = 'haeyul')
WHERE issued_store_id IS NULL;

UPDATE customer_rewards
SET used_store_id = (SELECT id FROM stores WHERE store_code = 'haeyul')
WHERE status = 'used' AND used_store_id IS NULL;

ALTER TABLE customer_rewards ALTER COLUMN issued_store_id SET NOT NULL;

CREATE INDEX idx_customer_rewards_issued_store ON customer_rewards (issued_store_id);
CREATE INDEX idx_customer_rewards_used_store ON customer_rewards (used_store_id);

-- ============================================================
-- 6. 기존 app_settings QR 토큰 → store_qr_tokens 이관
-- ============================================================
DO $$
DECLARE
  v_haeyul_id UUID;
  v_raw TEXT;
  v_token TEXT;
  v_created_at TIMESTAMPTZ;
BEGIN
  SELECT id INTO v_haeyul_id FROM stores WHERE store_code = 'haeyul';
  SELECT value INTO v_raw FROM app_settings WHERE key = 'visit_qr';

  IF v_raw IS NOT NULL THEN
    BEGIN
      v_token := (v_raw::JSONB ->> 'token');
      v_created_at := COALESCE((v_raw::JSONB ->> 'createdAt')::TIMESTAMPTZ, NOW());
    EXCEPTION WHEN OTHERS THEN
      -- 저장된 값이 예상 형식이 아니면 이관을 건너뜁니다 (getOrCreateQrSettings가
      -- 매장별로 새 토큰을 발급하므로 안전합니다).
      v_token := NULL;
    END;

    IF v_token IS NOT NULL THEN
      INSERT INTO store_qr_tokens (store_id, token, is_active, created_at)
      VALUES (v_haeyul_id, v_token, TRUE, v_created_at)
      ON CONFLICT (token) DO NOTHING;
    END IF;
  END IF;
END $$;

-- ============================================================
-- 7. Row Level Security (RLS)
-- ============================================================
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_qr_tokens ENABLE ROW LEVEL SECURITY;

-- 공개 읽기: 활성 매장 (손님 화면에서 매장명 표시용)
CREATE POLICY "anyone_read_active_stores"
  ON stores FOR SELECT USING (is_active = TRUE);

-- store_qr_tokens는 service_role로만 접근 (토큰 노출 방지)

-- ============================================================
-- 8. 자동 선물 발급 트리거를 매장 인식(store-aware)으로 수정
-- ============================================================
-- customer_rewards.issued_store_id가 NOT NULL이 되면서, 기존 auto_issue_reward()가
-- 이 컬럼 없이 INSERT하던 부분이 그대로 깨집니다(모든 방문 등록이 실패).
-- auto_issue_reward()는 visits가 아니라 customers UPDATE에서 트리거되어 어느 매장의
-- 방문이었는지 직접 알 수 없으므로, update_visit_count()가 세션 로컬 설정값에
-- 방문의 store_id를 남기고 auto_issue_reward()가 이를 읽어 사용합니다.
-- (005_reward_restore.sql의 app.bypass_reward_reuse_check와 동일한 패턴)

CREATE OR REPLACE FUNCTION update_visit_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_cancelled = FALSE THEN
    PERFORM set_config('app.current_visit_store_id', NEW.store_id::TEXT, true);
    UPDATE customers
    SET visit_count = visit_count + 1
    WHERE id = NEW.customer_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_cancelled = FALSE AND NEW.is_cancelled = TRUE THEN
    UPDATE customers
    SET visit_count = GREATEST(visit_count - 1, 0)
    WHERE id = NEW.customer_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_cancelled = TRUE AND NEW.is_cancelled = FALSE THEN
    PERFORM set_config('app.current_visit_store_id', NEW.store_id::TEXT, true);
    UPDATE customers
    SET visit_count = visit_count + 1
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION auto_issue_reward()
RETURNS TRIGGER AS $$
DECLARE
  r RECORD;
  v_store_id UUID;
BEGIN
  IF NEW.visit_count <= 0 THEN
    RETURN NEW;
  END IF;

  -- 이번 방문을 트리거한 매장. 세션 값이 없으면(관리자 수동 조정 등) 해율로 안전하게 대체합니다.
  v_store_id := NULLIF(current_setting('app.current_visit_store_id', true), '')::UUID;
  IF v_store_id IS NULL THEN
    SELECT id INTO v_store_id FROM stores WHERE store_code = 'haeyul';
  END IF;

  FOR r IN
    SELECT id FROM rewards
    WHERE required_visits <= NEW.visit_count AND is_active = TRUE
  LOOP
    INSERT INTO customer_rewards (customer_id, reward_id, status, issued_at, issued_store_id)
    VALUES (NEW.id, r.id, 'available', NOW(), v_store_id)
    ON CONFLICT (customer_id, reward_id) DO NOTHING;
  END LOOP;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
