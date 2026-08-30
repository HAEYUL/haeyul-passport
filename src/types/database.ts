/**
 * 해율 자연의 흐름 전자여권 — 데이터베이스 타입 정의
 */

// ============================================================
// ENUM 타입
// ============================================================
export type RewardStatus = 'available' | 'requested' | 'used';

export type ConsentType = 'privacy' | 'marketing';

/** 매장 코드 (store_code) */
export type StoreCode = 'haeyul' | 'gondre' | 'jeongdam';

/** 방문 등록 시 위치 확인 결과 */
export type LocationVerifiedStatus = 'success' | 'failed' | 'unavailable';

// ============================================================
// 테이블 타입
// ============================================================

/** stores 테이블 */
export interface Store {
  id: string;
  store_code: StoreCode;
  name: string;
  brand_name: string;
  is_active: boolean;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  created_at: string;
  updated_at: string;
}

/** store_qr_tokens 테이블 */
export interface StoreQrToken {
  id: string;
  store_id: string;
  token: string;
  is_active: boolean;
  created_at: string;
}

/** dining_tables 테이블 */
export interface DiningTable {
  id: string;
  table_code: string;
  floor: string;
  table_name: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** customers 테이블 */
export interface Customer {
  id: string;
  customer_number: string;
  name: string;
  phone: string;
  birth_date: string | null;
  marketing_consent: boolean;
  visit_count: number;
  is_active: boolean;
  admin_note: string | null;
  signup_store_id: string | null;
  created_at: string;
  updated_at: string;
}

/** visits 테이블 */
export interface Visit {
  id: string;
  customer_id: string;
  table_id: string | null;
  store_id: string;
  visit_date: string;
  visit_time: string;
  is_cancelled: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  location_verified: LocationVerifiedStatus;
  distance_meters: number | null;
  created_at: string;
}

/** rewards 테이블 (실물 선물 — 할인권 전환 후 미사용, 과거 기록 보존용) */
export interface Reward {
  id: string;
  name: string;
  description: string | null;
  required_visits: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** reward_rules 테이블 — 할인권 지급 규칙 (관리자가 직접 수정) */
export interface RewardRule {
  id: string;
  threshold_visits: number;
  amount: number;
  is_repeating: boolean;
  repeat_interval: number | null;
  is_active: boolean;
  /** 생일축하 쿠폰 전용 규칙이면 true. 방문 횟수 자동발급 대상에서 제외됨 */
  is_birthday: boolean;
  created_at: string;
  updated_at: string;
}

/** customer_rewards 테이블 */
export interface CustomerReward {
  id: string;
  customer_id: string;
  /** 실물 선물(구 방식) 참조. 할인권(신규 방식)이면 null */
  reward_id: string | null;
  /** 할인권을 발급한 규칙. 실물 선물(구 방식)이면 null */
  reward_rule_id: string | null;
  /** 이 할인권이 해당하는 방문 횟수 기준 (예: 25) */
  threshold_visits: number | null;
  /** 발급 시점에 고정된 할인 금액(원). 이후 규칙 금액이 바뀌어도 변하지 않음 */
  amount: number | null;
  status: RewardStatus;
  /** 'visit'(방문 기준 할인권) | 'birthday'(생일축하 쿠폰) */
  source: 'visit' | 'birthday';
  /** 명시적으로 지정된 만료 시각(예: 생일축하 쿠폰의 30일). 없으면 issued_at + 6개월로 계산 */
  expires_at: string | null;
  /** 생일축하 쿠폰의 중복 발급 방지용 발급 연도. source가 'birthday'일 때만 값이 있음 */
  birthday_year: number | null;
  issued_at: string;
  requested_at: string | null;
  request_table_id: string | null;
  used_at: string | null;
  confirmed_by: string | null;
  table_id_used: string | null;
  /** 방문 인증 없이 발급되는 생일축하 쿠폰은 특정 매장이 없어 null */
  issued_store_id: string | null;
  used_store_id: string | null;
  created_at: string;
}

/** employees 테이블 */
export interface Employee {
  id: string;
  name: string;
  pin_hash: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** admin_users 테이블 */
export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  password_hash: string;
  is_active: boolean;
  last_login_at: string | null;
  created_at: string;
  updated_at: string;
}

/** consent_logs 테이블 */
export interface ConsentLog {
  id: string;
  customer_id: string;
  consent_type: ConsentType;
  consented: boolean;
  consented_at: string;
  ip_address: string | null;
  user_agent: string | null;
}

/** audit_logs 테이블 */
export interface AuditLog {
  id: string;
  admin_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

/** app_settings 테이블 */
export interface AppSetting {
  id: string;
  key: string;
  value: string;
  updated_at: string;
  updated_by: string | null;
}

/** suspicious_activities 테이블 */
export interface SuspiciousActivity {
  id: string;
  activity_type: string;
  description: string | null;
  customer_id: string | null;
  table_id: string | null;
  device_info: string | null;
  ip_address: string | null;
  created_at: string;
}

/** employee_pin_attempts 테이블 */
export interface EmployeePinAttempt {
  id: string;
  ip_address: string;
  attempts: number;
  locked_until: string | null;
  last_attempt: string;
}

// ============================================================
// API 요청/응답 타입 (추후 단계에서 확장)
// ============================================================

/** 회원 가입 요청 */
export interface RegisterRequest {
  name: string;
  phone: string;
  birth_date?: string;
  marketing_consent?: boolean;
}

/** 회원 로그인 요청 */
export interface LoginRequest {
  name: string;
  phone: string;
}

/** 방문 등록 요청 */
export interface VisitRequest {
  customer_id: string;
}

/** API 공통 응답 */
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}
