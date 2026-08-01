/**
 * 해율 자연의 흐름 전자여권 — 데이터베이스 타입 정의
 */

// ============================================================
// ENUM 타입
// ============================================================
export type RewardStatus = 'available' | 'requested' | 'used';

export type ConsentType = 'privacy' | 'marketing';

// ============================================================
// 테이블 타입
// ============================================================

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
  created_at: string;
  updated_at: string;
}

/** visits 테이블 */
export interface Visit {
  id: string;
  customer_id: string;
  table_id: string | null;
  visit_date: string;
  visit_time: string;
  is_cancelled: boolean;
  cancelled_at: string | null;
  cancelled_by: string | null;
  cancel_reason: string | null;
  created_at: string;
}

/** rewards 테이블 */
export interface Reward {
  id: string;
  name: string;
  description: string | null;
  required_visits: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

/** customer_rewards 테이블 */
export interface CustomerReward {
  id: string;
  customer_id: string;
  reward_id: string;
  status: RewardStatus;
  issued_at: string;
  requested_at: string | null;
  request_table_id: string | null;
  used_at: string | null;
  confirmed_by: string | null;
  table_id_used: string | null;
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
