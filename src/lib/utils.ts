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
 * 한국 시간 기준 "오늘" 하루의 시작/끝 시각을 UTC ISO 문자열로 반환합니다.
 * TIMESTAMPTZ 컬럼(예: used_at)을 "오늘(KST)" 기준으로 필터링할 때 사용합니다.
 */
export function getTodayKSTRange(): { start: string; end: string } {
  const start = new Date(`${getTodayKST()}T00:00:00+09:00`);
  const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
  return { start: start.toISOString(), end: end.toISOString() };
}

/**
 * 'YYYY-MM-DD' 문자열에서 days일을 뺀 날짜를 'YYYY-MM-DD'로 반환합니다.
 */
export function subtractDaysFromDateString(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCDate(date.getUTCDate() - days);
  return date.toISOString().slice(0, 10);
}

/**
 * 'YYYY-MM-DD' 문자열에서 days일을 더한 날짜를 'YYYY-MM-DD'로 반환합니다.
 */
export function addDaysToDateString(dateStr: string, days: number): string {
  return subtractDaysFromDateString(dateStr, -days);
}

/**
 * 'YYYY-MM-DD' 문자열에서 months개월을 더한(음수면 뺀) 날짜를 반환합니다.
 */
export function addMonthsToDateString(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  date.setUTCMonth(date.getUTCMonth() + months);
  return date.toISOString().slice(0, 10);
}

/**
 * TIMESTAMPTZ(ISO) 값을 한국 시간 기준 날짜('YYYY-MM-DD')로 변환합니다.
 */
export function toKSTDateString(isoString: string): string {
  return new Date(isoString).toLocaleDateString('en-CA', { timeZone: TIMEZONE });
}

export type StatsPeriod = 'day' | 'week' | 'month';

export interface DateBucket {
  /** 구간 시작일 (포함, KST) */
  start: string;
  /** 구간 종료일 (포함, KST) */
  end: string;
  /** 그래프에 표시할 짧은 라벨 */
  label: string;
}

const DEFAULT_BUCKET_SPAN: Record<StatsPeriod, number> = { day: 14, week: 12, month: 12 };

function startOfWeekKST(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const day = date.getUTCDay(); // 0=일, 1=월 ... 6=토
  const diffToMonday = day === 0 ? -6 : 1 - day;
  date.setUTCDate(date.getUTCDate() + diffToMonday);
  return date.toISOString().slice(0, 10);
}

function startOfMonthString(dateStr: string): string {
  return `${dateStr.slice(0, 7)}-01`;
}

/**
 * 통계 화면의 기간 선택(일/주/월 + 직접 날짜 범위)에 맞춰 날짜 구간 목록을 만듭니다.
 * dateFrom/dateTo를 생략하면 오늘까지 최근 N개 구간(일 14 / 주 12 / 월 12)을 반환합니다.
 */
export function getDateBuckets(period: StatsPeriod, dateFrom?: string, dateTo?: string): DateBucket[] {
  const todayKST = getTodayKST();
  const end = dateTo || todayKST;
  const buckets: DateBucket[] = [];

  if (period === 'day') {
    const start = dateFrom || subtractDaysFromDateString(end, DEFAULT_BUCKET_SPAN.day - 1);
    let cursor = start;
    while (cursor <= end) {
      buckets.push({ start: cursor, end: cursor, label: cursor.slice(5).replace('-', '/') });
      cursor = addDaysToDateString(cursor, 1);
    }
    return buckets;
  }

  if (period === 'week') {
    const rawStart = dateFrom || subtractDaysFromDateString(end, 7 * (DEFAULT_BUCKET_SPAN.week - 1));
    let cursor = startOfWeekKST(rawStart);
    while (cursor <= end) {
      const weekEnd = addDaysToDateString(cursor, 6);
      buckets.push({
        start: cursor,
        end: weekEnd > end ? end : weekEnd,
        label: `${cursor.slice(5).replace('-', '/')}~`,
      });
      cursor = addDaysToDateString(cursor, 7);
    }
    return buckets;
  }

  // month
  const rawStart = dateFrom || addMonthsToDateString(startOfMonthString(end), -(DEFAULT_BUCKET_SPAN.month - 1));
  let cursor = startOfMonthString(rawStart);
  while (cursor <= end) {
    const nextMonthStart = addMonthsToDateString(cursor, 1);
    const monthEnd = subtractDaysFromDateString(nextMonthStart, 1);
    buckets.push({
      start: cursor,
      end: monthEnd > end ? end : monthEnd,
      label: `${cursor.slice(0, 4)}.${cursor.slice(5, 7)}`,
    });
    cursor = nextMonthStart;
  }
  return buckets;
}

/**
 * 두 'YYYY-MM-DD' 문자열 사이의 일수 차이(end - start, 포함일수 아님)를 계산합니다.
 */
export function daysBetweenDateStrings(startStr: string, endStr: string): number {
  const [y1, m1, d1] = startStr.split('-').map(Number);
  const [y2, m2, d2] = endStr.split('-').map(Number);
  const start = Date.UTC(y1, m1 - 1, d1);
  const end = Date.UTC(y2, m2 - 1, d2);
  return Math.round((end - start) / 86400000);
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

/**
 * 전화번호 가운데 자리를 가려 표시합니다.
 * 010-1234-5678 → 010-****-5678
 */
export function maskPhone(phone: string): string {
  const parts = phone.split('-');
  if (parts.length === 3) {
    return `${parts[0]}-${'*'.repeat(parts[1].length)}-${parts[2]}`;
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10 || digits.length === 11) {
    return maskPhone(normalizePhone(phone));
  }
  return phone;
}

/** SMS(단문) 최대 바이트. 초과 시 LMS(장문)로 전환됩니다. */
export const SMS_BYTE_LIMIT = 90;

/**
 * 문자 메시지의 바이트 수를 추정합니다 (한글/특수문자 2바이트, 영숫자 1바이트 기준).
 */
export function estimateSmsByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    bytes += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  return bytes;
}
