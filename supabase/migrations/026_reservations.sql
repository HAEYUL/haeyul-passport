-- ============================================================
-- 해율 자연의 흐름 전자여권 — 전화 예약자 명단
-- 026_reservations.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~025 마이그레이션 실행 이후에 실행하세요.
--
-- 전화로 예약한 손님을 관리자(매니저)가 입력하고, 예약 안내 문자(장문)를 보냅니다.
--   - 여권 회원 명단(customers)과는 완전히 분리된 별도 명단입니다.
--   - 예약 안내(정보성) 목적으로만 쓰며, 홍보 문자 대상으로 쓰지 않습니다.
--   - 보관 기간: 같은 전화번호의 마지막 예약일로부터 3년이 지나면 자동 삭제합니다
--     (purge_old_reservations — 관리자가 예약 화면을 열 때마다 실행).
--   - 문자 문구는 app_settings(reservation_sms_title / reservation_sms_body)에 저장하며,
--     없으면 프로그램에 들어 있는 기본 문구를 씁니다.
-- ============================================================

CREATE TABLE IF NOT EXISTS reservations (
  id             UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_name  TEXT NOT NULL,
  phone          TEXT NOT NULL,                    -- 010-1234-5678 형식
  reserved_date  DATE NOT NULL,
  reserved_time  TIME NOT NULL,
  party_size     INTEGER NOT NULL CHECK (party_size > 0),
  memo           TEXT,                             -- 직원용 메모 (문자에는 넣지 않음)
  status         TEXT NOT NULL DEFAULT 'reserved' CHECK (status IN ('reserved', 'cancelled')),
  sms_status     TEXT CHECK (sms_status IN ('sent', 'failed')),
  sms_sent_at    TIMESTAMPTZ,
  sms_error      TEXT,
  created_by     UUID REFERENCES admin_users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_reservations_date ON reservations (reserved_date, reserved_time);
CREATE INDEX IF NOT EXISTS idx_reservations_phone ON reservations (phone);

DROP TRIGGER IF EXISTS trg_reservations_updated ON reservations;
CREATE TRIGGER trg_reservations_updated BEFORE UPDATE ON reservations
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE reservations ENABLE ROW LEVEL SECURITY;
-- 공개 정책 없음 — 관리자 서버 액션(service_role)에서만 읽고 씁니다.

-- 같은 전화번호의 마지막 예약일로부터 3년이 지난 예약 기록을 모두 삭제하고, 삭제한 건수를 돌려줍니다.
CREATE OR REPLACE FUNCTION purge_old_reservations()
RETURNS INTEGER AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM reservations
  WHERE phone IN (
    SELECT phone
    FROM reservations
    GROUP BY phone
    HAVING MAX(reserved_date) < ((NOW() AT TIME ZONE 'Asia/Seoul')::DATE - INTERVAL '3 years')
  );
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
