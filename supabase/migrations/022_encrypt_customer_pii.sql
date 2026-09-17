-- ============================================================
-- 022. 고객 개인정보(이름/전화번호/생년월일) 암호화 — 1단계(추가만, 안전)
-- ============================================================
-- 기존 평문 컬럼(name, phone, birth_date)은 그대로 두고, 암호화된 값을
-- 저장할 새 컬럼만 추가합니다. 애플리케이션이 새 컬럼에 값을 채우기
-- 시작한 뒤, scripts/encrypt-existing-pii.mjs로 기존 고객 데이터를
-- 백필하고, 정상 동작을 충분히 확인한 다음에야
-- 023_drop_plaintext_customer_pii.sql(2단계)로 평문 컬럼을 제거합니다.
--
-- 지금 이 파일만 실행해도 기존 기능은 전혀 영향받지 않습니다(컬럼 추가는
-- 논블로킹 작업입니다).

ALTER TABLE customers
  ADD COLUMN name_enc TEXT,
  ADD COLUMN phone_enc TEXT,
  ADD COLUMN birth_date_enc TEXT,
  ADD COLUMN phone_hash TEXT;

COMMENT ON COLUMN customers.name_enc IS '이름 (AES-256-GCM 암호화, 애플리케이션에서만 복호화 가능)';
COMMENT ON COLUMN customers.phone_enc IS '휴대전화 번호 (AES-256-GCM 암호화)';
COMMENT ON COLUMN customers.birth_date_enc IS '생년월일 (AES-256-GCM 암호화, YYYY-MM-DD 원문을 암호화)';
COMMENT ON COLUMN customers.phone_hash IS '전화번호 조회/중복확인용 HMAC-SHA256 해시 (복호화 불가, phone의 대체 UNIQUE 키)';

-- phone_hash가 채워진 행에 한해 유니크 제약을 겁니다(백필 전에는 NULL이라 허용).
-- 백필이 끝나고 phone_hash를 NOT NULL로 바꾸면(2단계) 이 부분 유니크 인덱스가
-- 그대로 실질적인 UNIQUE 제약 역할을 합니다.
CREATE UNIQUE INDEX idx_customers_phone_hash ON customers (phone_hash) WHERE phone_hash IS NOT NULL;
