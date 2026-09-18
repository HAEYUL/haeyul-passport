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

// 위치 확인 반복 실패(GPS 미확인) 악용 방지
// QR 사진 + 위치 권한 거부를 반복하는 패턴을 걸러내기 위한 기준입니다.
// 최근 방문 LOCATION_ABUSE_WINDOW건 중 '확인 안 됨'이 LOCATION_ABUSE_THRESHOLD건 이상이면,
// 그다음 방문부터는 위치 확인 안 됨도 반경 밖과 동일하게 차단합니다.
export const LOCATION_ABUSE_WINDOW = 5;
export const LOCATION_ABUSE_THRESHOLD = 3;

// 의심 활동 유형 (suspicious_activities.activity_type)
export const SUSPICIOUS_ACTIVITY_TYPE = {
  LOCATION_UNAVAILABLE_REPEATED: 'location_unavailable_repeated',
} as const;

export const SUSPICIOUS_ACTIVITY_TYPE_LABELS: Record<string, string> = {
  [SUSPICIOUS_ACTIVITY_TYPE.LOCATION_UNAVAILABLE_REPEATED]: '위치 확인 반복 실패로 방문 차단',
};

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
  CUSTOMER_MANUAL_REGISTER: 'customer_manual_register',
  QR_REISSUE: 'qr_reissue',
  STORE_LOCATION_UPDATE: 'store_location_update',
  SMS_SEND: 'sms_send',
  BIRTHDAY_COUPON_ISSUE: 'birthday_coupon_issue',
  COMEBACK_COUPON_ISSUE: 'comeback_coupon_issue',
  NOTICE_CREATE: 'notice_create',
  NOTICE_UPDATE: 'notice_update',
  NOTICE_END: 'notice_end',
} as const;

// 감사 로그 액션 한글 라벨 (관리자 화면 여러 곳에서 공용으로 사용)
export const AUDIT_ACTION_LABELS: Record<string, string> = {
  [AUDIT_ACTION.VISIT_CANCEL]: '방문 취소',
  [AUDIT_ACTION.VISIT_ADD]: '방문 추가',
  [AUDIT_ACTION.REWARD_RESTORE]: '할인권 복구',
  [AUDIT_ACTION.REWARD_CATALOG_UPDATE]: '할인권 카탈로그 수정',
  [AUDIT_ACTION.REWARD_RULE_CREATE]: '할인권 규칙 생성',
  [AUDIT_ACTION.REWARD_RULE_UPDATE]: '할인권 규칙 수정',
  [AUDIT_ACTION.REWARD_RULE_DELETE]: '할인권 규칙 삭제',
  [AUDIT_ACTION.EMPLOYEE_CREATE]: '직원 등록',
  [AUDIT_ACTION.EMPLOYEE_UPDATE]: '직원 정보 수정',
  [AUDIT_ACTION.TABLE_CREATE]: '테이블 등록',
  [AUDIT_ACTION.TABLE_UPDATE]: '테이블 정보 수정',
  [AUDIT_ACTION.CUSTOMER_UPDATE]: '고객 정보 수정',
  [AUDIT_ACTION.CUSTOMER_DELETE]: '고객 삭제(관리자)',
  [AUDIT_ACTION.CUSTOMER_WITHDRAW]: '회원 탈퇴(고객 본인)',
  [AUDIT_ACTION.CUSTOMER_MANUAL_REGISTER]: '관리자 수동 회원가입',
  [AUDIT_ACTION.QR_REISSUE]: 'QR 재발행',
  [AUDIT_ACTION.STORE_LOCATION_UPDATE]: '매장 위치 설정 변경',
  [AUDIT_ACTION.SMS_SEND]: '문자 발송',
  [AUDIT_ACTION.BIRTHDAY_COUPON_ISSUE]: '생일축하 쿠폰 자동발급',
  [AUDIT_ACTION.COMEBACK_COUPON_ISSUE]: '컴백 쿠폰 자동발급',
  [AUDIT_ACTION.NOTICE_CREATE]: '알림/이벤트 등록',
  [AUDIT_ACTION.NOTICE_UPDATE]: '알림/이벤트 수정',
  [AUDIT_ACTION.NOTICE_END]: '알림/이벤트 중단',
};
