-- 013_referral_source.sql
-- 가입 시 고객이 해율을 알게 된 경로(유입 경로)를 선택 사항으로 물어 저장합니다.
-- 관리자 통계/고객 상세 화면에서 확인하는 용도이며, 고객이 보는 전자여권 화면에는 노출하지 않습니다.

ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_source TEXT
  CHECK (referral_source IN ('signboard', 'online', 'ai', 'sns', 'referral', 'other'));

-- '기타' 선택 시 고객이 직접 입력한 내용
ALTER TABLE customers ADD COLUMN IF NOT EXISTS referral_source_detail TEXT;
