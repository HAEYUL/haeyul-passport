import { TIMEZONE } from './constants';

/**
 * 한국 시간 기준 오늘 날짜 (YYYY-MM-DD)
 */
export function getTodayKST(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

/**
 * 한국 시간 기준 현재 시각 (ISO 문자열)
 */
export function getNowKST(): Date {
  return new Date(
    new Date().toLocaleString('en-US', { timeZone: TIMEZONE })
  );
}

/**
 * 날짜를 한국어 형식으로 표시
 * 예: '2026년 8월 1일'
 */
export function formatDateKR(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString('ko-KR', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    timeZone: TIMEZONE,
  });
}

/**
 * 전화번호 형식 정규화
 * 010-1234-5678 → 010-1234-5678 (하이픈 유지)
 * 01012345678 → 010-1234-5678 (하이픈 추가)
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 11) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone; // 형식이 맞지 않으면 원본 반환
}

/**
 * 전화번호 유효성 검사
 */
export function isValidPhone(phone: string): boolean {
  const digits = phone.replace(/\D/g, '');
  return digits.length === 10 || digits.length === 11;
}
