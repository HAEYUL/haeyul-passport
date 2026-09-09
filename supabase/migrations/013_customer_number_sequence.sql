-- ============================================================
-- 해율 자연의 흐름 전자여권 — 회원번호 발급을 시퀀스 방식으로 교체
-- 013_customer_number_sequence.sql
-- ============================================================
-- 실행 방법: Supabase 대시보드 > SQL Editor에서 이 파일 전체를 복사 후 실행
-- 001~012 마이그레이션 실행 이후에 실행하세요.
--
-- 기존 generate_customer_number()는 매번 "현재 최댓값 + 1"을 계산했습니다.
-- 여러 명이 거의 동시에 가입하면 둘 다 같은 최댓값을 읽어 같은 번호를
-- 만들어낼 수 있고, 그중 한 명은 UNIQUE 제약 위반으로 가입에 실패합니다.
--
-- 이번 마이그레이션은 Postgres SEQUENCE를 도입해 번호 발급을 DB 엔진이
-- 원자적으로 처리하도록 바꿔서, 동시 가입 시에도 번호가 절대 겹치지
-- 않도록 합니다.
-- ============================================================

-- 1. 시퀀스 생성 (지금까지 발급된 가장 큰 회원번호 다음 값부터 시작)
CREATE SEQUENCE IF NOT EXISTS customer_number_seq;

SELECT setval(
  'customer_number_seq',
  COALESCE(
    (SELECT MAX(CAST(REPLACE(customer_number, 'HY-', '') AS INTEGER)) FROM customers),
    0
  ) + 1,
  false
);

-- 2. 회원번호 생성 함수를 시퀀스 기반으로 교체
CREATE OR REPLACE FUNCTION generate_customer_number()
RETURNS TRIGGER AS $$
DECLARE
  v_seq INTEGER;
BEGIN
  v_seq := nextval('customer_number_seq');
  NEW.customer_number := 'HY-' || LPAD(v_seq::TEXT, GREATEST(5, LENGTH(v_seq::TEXT)), '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================
-- 마이그레이션 완료
-- ============================================================
