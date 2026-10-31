-- ============================================================
-- 해율 자연의 흐름 전자여권 — 예약 입금 확인 체크
-- 029_reservation_deposit.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~028 마이그레이션 실행 이후에 실행하세요.
--
-- 예약 안내 문자를 보낸 뒤 예약금이 들어오면, 예약자 명단 맨 앞의 체크박스로 '입금 확인'을 표시합니다.
--   - deposit_paid_at: 입금 확인을 체크한 시각 (비어 있으면 미입금)
--   - deposit_checked_by: 체크한 관리자·매니저 계정
-- ============================================================

ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_paid_at TIMESTAMPTZ;
ALTER TABLE reservations ADD COLUMN IF NOT EXISTS deposit_checked_by UUID REFERENCES admin_users(id);

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
