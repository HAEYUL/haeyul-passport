-- ============================================================
-- 해율 자연의 흐름 전자여권 — 데이터베이스 스키마
-- 001_initial_schema.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- ============================================================

-- 기존 테이블 삭제 (초기 설정 시에만 사용)
DROP TABLE IF EXISTS employee_pin_attempts CASCADE;
DROP TABLE IF EXISTS suspicious_activities CASCADE;
DROP TABLE IF EXISTS app_settings CASCADE;
DROP TABLE IF EXISTS audit_logs CASCADE;
DROP TABLE IF EXISTS consent_logs CASCADE;
DROP TABLE IF EXISTS customer_rewards CASCADE;
DROP TABLE IF EXISTS visits CASCADE;
DROP TABLE IF EXISTS rewards CASCADE;
DROP TABLE IF EXISTS employees CASCADE;
DROP TABLE IF EXISTS customers CASCADE;
DROP TABLE IF EXISTS dining_tables CASCADE;
DROP TABLE IF EXISTS admin_users CASCADE;
DROP TYPE IF EXISTS reward_status CASCADE;

-- 확장 모듈
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ENUM 타입
CREATE TYPE reward_status AS ENUM ('available', 'requested', 'used');

-- ============================================================
-- 1. dining_tables — 매장 테이블
-- ============================================================
CREATE TABLE dining_tables (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  table_code  TEXT NOT NULL UNIQUE,          -- QR코드에 사용 (예: '201')
  floor       TEXT NOT NULL,                 -- 층 (예: '2층')
  table_name  TEXT NOT NULL,                 -- 이름 (예: '1번 테이블')
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 2. admin_users — 관리자 계정
-- ============================================================
CREATE TABLE admin_users (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  username       TEXT NOT NULL UNIQUE,
  email          TEXT UNIQUE,
  password_hash  TEXT NOT NULL,
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at  TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 3. employees — 직원
-- ============================================================
CREATE TABLE employees (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  pin_hash    TEXT NOT NULL,                 -- 4자리 확인번호 해시 (평문 저장 금지)
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 4. customers — 회원
-- ============================================================
CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_number   TEXT NOT NULL UNIQUE,     -- 자동 발급 회원번호 (예: 'HY-0001')
  name              TEXT NOT NULL,            -- 성함
  phone             TEXT NOT NULL UNIQUE,     -- 휴대전화 번호 (회원 식별정보)
  birth_date        DATE,                     -- 생년월일 (선택)
  marketing_consent BOOLEAN NOT NULL DEFAULT FALSE,
  visit_count       INTEGER NOT NULL DEFAULT 0,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_customers_phone ON customers (phone);
CREATE INDEX idx_customers_name ON customers (name);

-- ============================================================
-- 5. visits — 방문 기록
-- ============================================================
CREATE TABLE visits (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  table_id      UUID REFERENCES dining_tables(id),
  visit_date    DATE NOT NULL,               -- 한국 날짜 기준 (Asia/Seoul)
  visit_time    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_cancelled  BOOLEAN NOT NULL DEFAULT FALSE,
  cancelled_at  TIMESTAMPTZ,
  cancelled_by  UUID REFERENCES admin_users(id),
  cancel_reason TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 핵심 제약: 동일 고객의 동일 날짜 중복 방문 방지 (취소되지 않은 것만)
CREATE UNIQUE INDEX uq_visits_customer_date_active
  ON visits (customer_id, visit_date)
  WHERE is_cancelled = FALSE;

CREATE INDEX idx_visits_customer_id ON visits (customer_id);
CREATE INDEX idx_visits_visit_date ON visits (visit_date DESC);

-- ============================================================
-- 6. rewards — 선물 종류 정의
-- ============================================================
CREATE TABLE rewards (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name             TEXT NOT NULL,             -- 선물명
  description      TEXT,                      -- 설명
  required_visits  INTEGER NOT NULL,          -- 필요 방문 횟수
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 7. customer_rewards — 고객별 선물 발급/사용
-- ============================================================
CREATE TABLE customer_rewards (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id      UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  reward_id        UUID NOT NULL REFERENCES rewards(id),
  status           reward_status NOT NULL DEFAULT 'available',
  issued_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  requested_at     TIMESTAMPTZ,
  request_table_id UUID REFERENCES dining_tables(id),
  used_at          TIMESTAMPTZ,
  confirmed_by     UUID REFERENCES employees(id),
  table_id_used    UUID REFERENCES dining_tables(id),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 핵심 제약: 동일 고객에게 동일 선물 중복 발급 방지
CREATE UNIQUE INDEX uq_customer_rewards_unique
  ON customer_rewards (customer_id, reward_id);

-- ============================================================
-- 8. consent_logs — 개인정보 동의 기록
-- ============================================================
CREATE TABLE consent_logs (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  consent_type  TEXT NOT NULL,               -- 'privacy' | 'marketing'
  consented     BOOLEAN NOT NULL,
  consented_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ip_address    TEXT,
  user_agent    TEXT
);

CREATE INDEX idx_consent_logs_customer ON consent_logs (customer_id);

-- ============================================================
-- 9. audit_logs — 관리자 활동 기록
-- ============================================================
CREATE TABLE audit_logs (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  admin_id     UUID REFERENCES admin_users(id),
  action       TEXT NOT NULL,                -- 'visit_cancel', 'reward_restore' 등
  target_type  TEXT NOT NULL,                -- 'visit', 'customer_reward' 등
  target_id    UUID,
  before_data  JSONB,
  after_data   JSONB,
  reason       TEXT,                         -- 수정 사유
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_admin ON audit_logs (admin_id);
CREATE INDEX idx_audit_logs_target ON audit_logs (target_type, target_id);
CREATE INDEX idx_audit_logs_created ON audit_logs (created_at DESC);

-- ============================================================
-- 10. app_settings — 앱 설정
-- ============================================================
CREATE TABLE app_settings (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key         TEXT NOT NULL UNIQUE,
  value       TEXT NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  UUID REFERENCES admin_users(id)
);

-- ============================================================
-- 추가 테이블: suspicious_activities — 부정 방문 의심 기록
-- ============================================================
CREATE TABLE suspicious_activities (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  activity_type TEXT NOT NULL,               -- 'multiple_users_same_device' 등
  description   TEXT,
  customer_id   UUID REFERENCES customers(id),
  table_id      UUID REFERENCES dining_tables(id),
  device_info   TEXT,
  ip_address    TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- 추가 테이블: employee_pin_attempts — PIN 입력 잠금
-- ============================================================
CREATE TABLE employee_pin_attempts (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  ip_address   TEXT NOT NULL,
  attempts     INTEGER NOT NULL DEFAULT 1,
  locked_until TIMESTAMPTZ,
  last_attempt TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pin_attempts_ip ON employee_pin_attempts (ip_address);

-- ============================================================
-- 함수 & 트리거
-- ============================================================

-- 1) updated_at 자동 갱신
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_dining_tables_updated BEFORE UPDATE ON dining_tables
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_admin_users_updated BEFORE UPDATE ON admin_users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_employees_updated BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_customers_updated BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER trg_rewards_updated BEFORE UPDATE ON rewards
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- 2) 회원번호 자동 생성
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS TRIGGER AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(CAST(REPLACE(customer_number, 'HY-', '') AS INTEGER)), 0
  ) + 1 INTO v_seq
  FROM customers;

  NEW.customer_number := 'HY-' || LPAD(v_seq::TEXT, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_generate_customer_number
  BEFORE INSERT ON customers
  FOR EACH ROW
  WHEN (NEW.customer_number IS NULL OR NEW.customer_number = '')
  EXECUTE FUNCTION generate_customer_number();

-- 3) 방문 등록/취소 시 visit_count 자동 갱신
CREATE OR REPLACE FUNCTION update_visit_count()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' AND NEW.is_cancelled = FALSE THEN
    UPDATE customers
    SET visit_count = visit_count + 1
    WHERE id = NEW.customer_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_cancelled = FALSE AND NEW.is_cancelled = TRUE THEN
    UPDATE customers
    SET visit_count = GREATEST(visit_count - 1, 0)
    WHERE id = NEW.customer_id;
  ELSIF TG_OP = 'UPDATE' AND OLD.is_cancelled = TRUE AND NEW.is_cancelled = FALSE THEN
    UPDATE customers
    SET visit_count = visit_count + 1
    WHERE id = NEW.customer_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_update_visit_count
  AFTER INSERT OR UPDATE ON visits
  FOR EACH ROW EXECUTE FUNCTION update_visit_count();

-- 4) 10회 방문 시 자동 선물 발급
CREATE OR REPLACE FUNCTION auto_issue_reward()
RETURNS TRIGGER AS $$
DECLARE
  v_reward_id UUID;
  v_existing INTEGER;
BEGIN
  IF NEW.visit_count >= 10 THEN
    SELECT id INTO v_reward_id
    FROM rewards
    WHERE required_visits = 10 AND is_active = TRUE
    LIMIT 1;

    IF v_reward_id IS NOT NULL THEN
      SELECT COUNT(*) INTO v_existing
      FROM customer_rewards
      WHERE customer_id = NEW.id AND reward_id = v_reward_id;

      IF v_existing = 0 THEN
        INSERT INTO customer_rewards (customer_id, reward_id, status, issued_at)
        VALUES (NEW.id, v_reward_id, 'available', NOW());
      END IF;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_auto_issue_reward
  AFTER UPDATE ON customers
  FOR EACH ROW
  WHEN (OLD.visit_count IS DISTINCT FROM NEW.visit_count)
  EXECUTE FUNCTION auto_issue_reward();

-- 5) 사용 완료된 선물 재사용 방지
CREATE OR REPLACE FUNCTION prevent_reward_reuse()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'used' AND NEW.status != 'used' THEN
    RAISE EXCEPTION '사용 완료된 선물은 변경할 수 없습니다. 관리자 복원 기능을 사용하세요.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_reward_reuse
  BEFORE UPDATE ON customer_rewards
  FOR EACH ROW EXECUTE FUNCTION prevent_reward_reuse();

-- ============================================================
-- Row Level Security (RLS)
-- ============================================================

ALTER TABLE dining_tables ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE consent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE suspicious_activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE employee_pin_attempts ENABLE ROW LEVEL SECURITY;

-- 공개 읽기: 활성 테이블, 활성 선물
CREATE POLICY "anyone_read_active_tables"
  ON dining_tables FOR SELECT USING (is_active = TRUE);

CREATE POLICY "anyone_read_active_rewards"
  ON rewards FOR SELECT USING (is_active = TRUE);

-- 나머지 테이블은 service_role로만 접근 (API 라우트에서 처리)

-- ============================================================
-- 시험 데이터 (Seed Data)
-- ============================================================

-- 매장 테이블
INSERT INTO dining_tables (table_code, floor, table_name) VALUES
  ('201', '2층', '1번 테이블'),
  ('202', '2층', '2번 테이블'),
  ('203', '2층', '3번 테이블'),
  ('301', '3층', '단체석 1번');

-- 선물 종류
INSERT INTO rewards (name, description, required_visits) VALUES
  ('새싹인삼 서비스', '해율을 10번 찾아주신 감사의 마음을 담아 준비한 새싹인삼 서비스입니다.', 10);

-- 관리자 (아이디: admin / 비밀번호: haeyul8000)
INSERT INTO admin_users (username, email, password_hash) VALUES
  ('admin', 'admin@haeyul.com', crypt('haeyul8000', gen_salt('bf')));

-- 직원 (홍길동 PIN: 1234 / 김직원 PIN: 5678)
INSERT INTO employees (name, pin_hash) VALUES
  ('홍길동', crypt('1234', gen_salt('bf'))),
  ('김직원', crypt('5678', gen_salt('bf')));

-- 테스트 고객
INSERT INTO customers (customer_number, name, phone, visit_count) VALUES
  ('HY-0001', '김신규', '010-1111-0001', 0),
  ('HY-0002', '이중간', '010-2222-0002', 0),
  ('HY-0003', '박아홉', '010-3333-0003', 0),
  ('HY-0004', '최열번', '010-4444-0004', 0),
  ('HY-0005', '정완료', '010-5555-0005', 0);

-- 테스트 방문 기록 & 선물 발급
DO $$
DECLARE
  v_customer_id UUID;
  v_table_id UUID;
  v_reward_id UUID;
  v_employee_id UUID;
  i INTEGER;
BEGIN
  SELECT id INTO v_table_id FROM dining_tables WHERE table_code = '201';
  SELECT id INTO v_reward_id FROM rewards WHERE required_visits = 10;
  SELECT id INTO v_employee_id FROM employees WHERE name = '홍길동';

  -- 김신규: 1회 방문
  SELECT id INTO v_customer_id FROM customers WHERE phone = '010-1111-0001';
  INSERT INTO visits (customer_id, table_id, visit_date, is_cancelled)
  VALUES (v_customer_id, v_table_id, '2026-08-01', FALSE);

  -- 이중간: 4회 방문
  SELECT id INTO v_customer_id FROM customers WHERE phone = '010-2222-0002';
  FOR i IN 0..3 LOOP
    INSERT INTO visits (customer_id, table_id, visit_date, is_cancelled)
    VALUES (v_customer_id, v_table_id, '2026-07-01'::DATE + (i * 7), FALSE);
  END LOOP;

  -- 박아홉: 9회 방문
  SELECT id INTO v_customer_id FROM customers WHERE phone = '010-3333-0003';
  FOR i IN 0..8 LOOP
    INSERT INTO visits (customer_id, table_id, visit_date, is_cancelled)
    VALUES (v_customer_id, v_table_id, '2026-06-01'::DATE + (i * 3), FALSE);
  END LOOP;

  -- 최열번: 10회 방문 (선물 자동 발급됨 — 트리거에 의해)
  SELECT id INTO v_customer_id FROM customers WHERE phone = '010-4444-0004';
  FOR i IN 0..9 LOOP
    INSERT INTO visits (customer_id, table_id, visit_date, is_cancelled)
    VALUES (v_customer_id, v_table_id, '2026-05-01'::DATE + (i * 3), FALSE);
  END LOOP;

  -- 정완료: 12회 방문 (선물 사용 완료)
  SELECT id INTO v_customer_id FROM customers WHERE phone = '010-5555-0005';
  FOR i IN 0..11 LOOP
    INSERT INTO visits (customer_id, table_id, visit_date, is_cancelled)
    VALUES (v_customer_id, v_table_id, '2026-04-01'::DATE + (i * 3), FALSE);
  END LOOP;

  -- 정완료의 선물을 사용 완료 처리
  UPDATE customer_rewards
  SET status = 'requested', requested_at = '2026-06-15'::TIMESTAMPTZ
  WHERE customer_id = v_customer_id AND reward_id = v_reward_id;

  -- 트리거 우회를 위해 직접 업데이트 (관리자 복원 로직과 별도)
  -- 사용 완료 처리는 트리거가 차단하므로, 시드 데이터에서는
  -- 트리거를 일시 비활성화합니다.
  ALTER TABLE customer_rewards DISABLE TRIGGER trg_prevent_reward_reuse;

  UPDATE customer_rewards
  SET status = 'used',
      used_at = '2026-06-15'::TIMESTAMPTZ,
      confirmed_by = v_employee_id,
      table_id_used = v_table_id
  WHERE customer_id = v_customer_id AND reward_id = v_reward_id;

  ALTER TABLE customer_rewards ENABLE TRIGGER trg_prevent_reward_reuse;

END $$;

-- 개인정보 동의 기록 (모든 테스트 고객)
INSERT INTO consent_logs (customer_id, consent_type, consented)
SELECT id, 'privacy', TRUE FROM customers;

-- 앱 설정
INSERT INTO app_settings (key, value) VALUES
  ('store_name', '해율만두전골'),
  ('reward_visits_required', '10'),
  ('reward_name', '새싹인삼 서비스'),
  ('pin_max_attempts', '5'),
  ('pin_lockout_minutes', '5');

-- ============================================================
-- 스키마 생성 완료
-- ============================================================
