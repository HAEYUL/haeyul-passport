-- ============================================================
-- 해율 자연의 흐름 전자여권 — QR 부정 스캔 방지용 위치 확인 기능
-- 010_qr_location_verification.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~009 마이그레이션 실행 이후에 실행하세요.
--
-- 매장 위치 좌표 + 허용 반경을 stores에 추가하고, 방문(visits) 등록 시
-- 브라우저 위치 정보로 매장과의 거리를 계산해 반경 밖이면 등록을 막습니다.
-- 위치 정보를 가져올 수 없는 경우(권한 거부/미지원)에는 등록을 막지 않고
-- "확인 안 됨" 상태만 기록합니다.
-- ============================================================

-- ============================================================
-- 1. stores — 매장 위치 좌표 + 허용 반경
-- ============================================================
ALTER TABLE stores ADD COLUMN latitude DOUBLE PRECISION;
ALTER TABLE stores ADD COLUMN longitude DOUBLE PRECISION;
ALTER TABLE stores ADD COLUMN radius_meters INTEGER NOT NULL DEFAULT 100;

UPDATE stores SET latitude = 37.3498089, longitude = 127.0857600 WHERE store_code = 'haeyul';
UPDATE stores SET latitude = 37.3470734, longitude = 127.0919019 WHERE store_code = 'gondre';
UPDATE stores SET latitude = 37.3470035, longitude = 127.0884843 WHERE store_code = 'jeongdam';

-- ============================================================
-- 2. visits — 위치 확인 결과
-- ============================================================
-- success: 매장 반경 이내로 확인됨 / failed: 반경 밖으로 확인됨(현재 로직상 등록 자체가
-- 막히므로 정상 플로우에서는 쌓이지 않지만, 감사·향후 정책 변경 대비 값은 남겨둡니다)
-- unavailable: 위치 정보를 가져오지 못함(권한 거부/미지원/수동 등록 등)
ALTER TABLE visits ADD COLUMN location_verified TEXT NOT NULL DEFAULT 'unavailable'
  CHECK (location_verified IN ('success', 'failed', 'unavailable'));
ALTER TABLE visits ADD COLUMN distance_meters INTEGER;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
