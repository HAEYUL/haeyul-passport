-- 005_reward_restore.sql
-- 관리자가 잘못 "사용 완료" 처리된 선물을 "사용 가능"으로 되돌리는 기능.
--
-- customer_rewards 테이블에는 사용 완료된 선물의 재사용(악용)을 막기 위해
-- trg_prevent_reward_reuse 트리거가 걸려 있어, status='used' -> 다른 값으로의
-- 일반 UPDATE는 항상 예외를 던집니다 (001_initial_schema.sql 참고).
--
-- 이 마이그레이션은 그 보호를 유지하면서, 관리자 전용 경로로만 복원할 수 있도록
-- 트랜잭션 로컬 플래그(app.bypass_reward_reuse_check)를 트리거가 확인하게 하고,
-- 해당 플래그를 설정한 뒤 UPDATE를 수행하는 SECURITY DEFINER 함수를 추가합니다.

CREATE OR REPLACE FUNCTION prevent_reward_reuse()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'used' AND NEW.status != 'used' THEN
    IF current_setting('app.bypass_reward_reuse_check', TRUE) = 'true' THEN
      RETURN NEW;
    END IF;
    RAISE EXCEPTION '사용 완료된 선물은 변경할 수 없습니다. 관리자 복원 기능을 사용하세요.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION restore_reward(p_customer_reward_id UUID)
RETURNS void AS $$
BEGIN
  PERFORM set_config('app.bypass_reward_reuse_check', 'true', TRUE); -- TRUE = 현재 트랜잭션에만 적용

  UPDATE customer_rewards
  SET status = 'available', used_at = NULL
  WHERE id = p_customer_reward_id AND status = 'used';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
