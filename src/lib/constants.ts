/**
 * 해율 자연의 흐름 전자여권 — 상수 정의
 */

// 시간대
export const TIMEZONE = 'Asia/Seoul';

// 매장 운영시간 (3개 매장 공통, 한국시간 기준 24시간제)
export const STORE_OPEN_HOUR = 10;   // 오전 10시부터
export const STORE_CLOSE_HOUR = 21;  // 오후 9시까지

// 선물 유효기간 (발급일로부터, 개월)
export const REWARD_EXPIRY_MONTHS = 6;

// 생일축하 쿠폰
export const BIRTHDAY_COUPON_AMOUNT = 5000;      // 할인 금액(원)
export const BIRTHDAY_COUPON_VALID_DAYS = 30;    // 유효기간(발급일로부터, 일)

// 컴백(장기 미방문 복귀 유도) 쿠폰
export const COMEBACK_ABSENCE_DAYS = 45;         // 마지막 방문 후 이 기간(일)이 지나면 발급 대상
export const COMEBACK_COUPON_AMOUNT = 2000;      // 할인 금액(원)
export const COMEBACK_COUPON_VALID_DAYS = 14;    // 유효기간(발급일로부터, 일)

// 감사 로그 액션
export const AUDIT_ACTION = {
  VISIT_CANCEL: 'visit_cancel',
  VISIT_ADD: 'visit_add',
  REWARD_RESTORE: 'reward_restore',
  REWARD_CATALOG_UPDATE: 'reward_catalog_update',
  REWARD_RULE_CREATE: 'reward_rule_create',
  REWARD_RULE_UPDATE: 'reward_rule_update',
  REWARD_RULE_DELETE: 'reward_rule_delete',
  EMPLOYEE_CREATE: 'employee_create',
  EMPLOYEE_UPDATE: 'employee_update',
  TABLE_CREATE: 'table_create',
  TABLE_UPDATE: 'table_update',
  CUSTOMER_UPDATE: 'customer_update',
  CUSTOMER_DELETE: 'customer_delete',
  CUSTOMER_WITHDRAW: 'customer_withdraw',
  QR_REISSUE: 'qr_reissue',
  STORE_LOCATION_UPDATE: 'store_location_update',
  SMS_SEND: 'sms_send',
  BIRTHDAY_COUPON_ISSUE: 'birthday_coupon_issue',
  COMEBACK_COUPON_ISSUE: 'comeback_coupon_issue',
} as const;
