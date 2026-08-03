-- 006_customer_admin_note.sql
-- VIP관리 화면에서 관리자가 고객별로 자유롭게 남길 수 있는 메모 칸을 추가합니다.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS admin_note TEXT;
