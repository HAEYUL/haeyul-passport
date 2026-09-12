-- ============================================================
-- 해율 자연의 흐름 전자여권 — 알림/이벤트 관리
-- 021_notices.sql
-- ============================================================
-- 관리자가 작성한 알림/이벤트를 고객 전자여권 홈 화면에 노출합니다.
-- 게시기간(starts_at ~ ends_at) 안에 있고 is_active가 TRUE인 것 중
-- 가장 최근에 작성된 1건만 고객에게 노출됩니다(3개 매장 공통).
-- 기존 글은 삭제하지 않고 남겨 관리자모드에서 작성 이력으로 확인합니다.
-- ============================================================

CREATE TABLE notices (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  kind        TEXT NOT NULL CHECK (kind IN ('notice', 'event')),
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_by  UUID REFERENCES admin_users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CHECK (ends_at > starts_at)
);

-- 고객 페이지에서 "현재 노출할 1건"을 찾을 때 쓰는 조회 패턴에 맞춘 색인
CREATE INDEX idx_notices_active_window ON notices (is_active, starts_at, ends_at);

CREATE TRIGGER trg_notices_updated BEFORE UPDATE ON notices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
-- 공개 정책 없음 — 관리자 서버 액션(service_role)에서만 읽고 씁니다.
