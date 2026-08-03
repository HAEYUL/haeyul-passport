/**
 * 해율 자연의 흐름 전자여권 — 상수 정의
 */

// 직원 PIN 관련
export const PIN_MAX_ATTEMPTS = 5;         // 최대 시도 횟수
export const PIN_LOCKOUT_MINUTES = 5;      // 잠금 시간 (분)

// 시간대
export const TIMEZONE = 'Asia/Seoul';

// 회원번호 접두사
export const CUSTOMER_NUMBER_PREFIX = 'HY-';

// 선물 상태
export const REWARD_STATUS = {
  AVAILABLE: 'available',
  REQUESTED: 'requested',
  USED: 'used',
} as const;

// 선물 유효기간 (발급일로부터, 개월)
export const REWARD_EXPIRY_MONTHS = 6;

// 동의 유형
export const CONSENT_TYPE = {
  PRIVACY: 'privacy',
  MARKETING: 'marketing',
} as const;

// 감사 로그 액션
export const AUDIT_ACTION = {
  VISIT_CANCEL: 'visit_cancel',
  VISIT_ADD: 'visit_add',
  REWARD_RESTORE: 'reward_restore',
  REWARD_CATALOG_UPDATE: 'reward_catalog_update',
  EMPLOYEE_CREATE: 'employee_create',
  EMPLOYEE_UPDATE: 'employee_update',
  TABLE_CREATE: 'table_create',
  TABLE_UPDATE: 'table_update',
  CUSTOMER_UPDATE: 'customer_update',
  CUSTOMER_DELETE: 'customer_delete',
  QR_REISSUE: 'qr_reissue',
} as const;

// 매장 정보
export const STORE_INFO = {
  name: '해율만두전골',
  slogan: '자연의 흐름을 맛으로 전합니다.',
  passportName: '해율 자연의 흐름 전자여권',
} as const;
