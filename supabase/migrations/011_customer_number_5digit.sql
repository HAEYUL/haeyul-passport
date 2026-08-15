-- ============================================================
-- 해율 자연의 흐름 전자여권 — 회원번호 5자리로 변경 (HY-00001)
-- 011_customer_number_5digit.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~010 마이그레이션 실행 이후에 실행하세요.
--
-- 기존 생성 함수는 LPAD(v_seq::TEXT, 4, '0')를 사용했는데, PostgreSQL의 LPAD는
-- 문자열이 지정한 길이보다 길면 "잘라내기"(오른쪽 절삭)를 합니다. 즉 10000번째
-- 회원부터는 'HY-10000'이 아니라 'HY-1000'이 생성되어 이미 존재하는 1000번
-- 회원과 번호가 충돌하고, UNIQUE 제약 위반으로 가입 자체가 실패하게 됩니다.
--
-- 이번 마이그레이션은:
-- 1) 기존 회원번호를 전부 5자리(HY-00001 ~)로 다시 채웁니다.
-- 2) 생성 함수를 5자리 기준으로 바꾸고, GREATEST를 사용해 자릿수가 늘어나도
--    (예: 100000번째 회원 → HY-100000) 항상 잘리지 않고 안전하게 늘어나도록
--    고쳤습니다. 같은 버그가 앞으로도 재발하지 않습니다.
-- ============================================================

-- 1. 기존 회원번호를 5자리로 재포맷
UPDATE customers
SET customer_number = 'HY-' || LPAD(
  REPLACE(customer_number, 'HY-', ''),
  GREATEST(5, LENGTH(REPLACE(customer_number, 'HY-', ''))),
  '0'
)
WHERE customer_number LIKE 'HY-%';

-- 2. 회원번호 생성 함수를 5자리 기준으로 교체 (자릿수 초과 시에도 절삭 없이 확장)
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS TRIGGER AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  SELECT COALESCE(
    MAX(CAST(REPLACE(customer_number, 'HY-', '') AS INTEGER)), 0
  ) + 1 INTO v_seq
  FROM customers;

  NEW.customer_number := 'HY-' || LPAD(v_seq::TEXT, GREATEST(5, LENGTH(v_seq::TEXT)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
