-- ============================================================
-- 023. 고객 개인정보 암호화 — 2단계(평문 컬럼 삭제, 되돌릴 수 없음)
-- ============================================================
-- ⚠️ 절대 지금 바로 실행하지 마세요.
-- ⚠️ 아래 순서를 모두 마친 뒤에만 이 파일을 실행하세요:
--   1) 022_encrypt_customer_pii.sql 적용 완료
--   2) 애플리케이션 배포 완료 + PII_ENCRYPTION_KEY, PII_HASH_KEY 환경변수 설정 완료
--      (이 키를 잃어버리면 이 시점부터는 새로 가입한 고객 정보도 복구할 수
--      없으니, 반드시 비밀번호 관리자 등 안전한 곳에 따로 백업해 두세요.)
--   3) scripts/encrypt-existing-pii.mjs 실행으로 기존 고객 전원 백필 완료
--   4) Supabase SQL Editor에서 아래 쿼리로 백필 누락이 없는지 확인:
--        SELECT count(*) FROM customers WHERE phone_enc IS NULL;
--      결과가 0이어야 합니다. 0이 아니면 백필 스크립트를 다시 실행하세요.
--   5) 회원가입/로그인/관리자 고객검색/생일쿠폰 등 핵심 기능이 새 컬럼
--      기준으로 정상 동작하는 것을 실제로 확인
--
-- 이 마이그레이션을 실행하면 name/phone/birth_date 평문 컬럼이 영구
-- 삭제되어 더 이상 되돌릴 수 없습니다(백업이 없다면 복구 불가).

-- 안전장치: phone_enc가 비어있는 행이 하나라도 있으면 이 마이그레이션
-- 전체가 실패하도록 막습니다(백필이 끝나지 않았는데 실수로 실행하는 것을 방지).
DO $$
DECLARE
  unbackfilled_count INTEGER;
BEGIN
  SELECT count(*) INTO unbackfilled_count FROM customers WHERE phone_enc IS NULL;
  IF unbackfilled_count > 0 THEN
    RAISE EXCEPTION '백필이 끝나지 않은 고객이 %명 있습니다. scripts/encrypt-existing-pii.mjs를 먼저 실행하세요.', unbackfilled_count;
  END IF;
END $$;

ALTER TABLE customers
  ALTER COLUMN phone_hash SET NOT NULL,
  ALTER COLUMN name_enc SET NOT NULL,
  ALTER COLUMN phone_enc SET NOT NULL;

DROP INDEX IF EXISTS idx_customers_phone;
DROP INDEX IF EXISTS idx_customers_name;

ALTER TABLE customers
  DROP COLUMN name,
  DROP COLUMN phone,
  DROP COLUMN birth_date;
