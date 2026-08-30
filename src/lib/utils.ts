import { TIMEZONE, STORE_OPEN_HOUR, STORE_CLOSE_HOUR } from './constants';

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
 * 지금이 매장 운영시간(한국시간 기준 오전 10시~오후 9시) 이내인지 확인합니다.
 * QR 가입/방문 등록을 운영시간에만 허용하는 데 사용합니다.
 */
export function isWithinStoreHours(now: Date = getNowKST()): boolean {
  const hour = now.getHours();
  return hour >= STORE_OPEN_HOUR && hour < STORE_CLOSE_HOUR;
}

/**
 * 지금부터 오늘 매장 마감시각(STORE_CLOSE_HOUR)까지 남은 초를 반환합니다.
 * QR 스캔 확인 쿠키가 "그날 영업 종료 시점까지" 유효하도록 만드는 데 사용합니다.
 * 이미 마감시각이 지난 경우엔 짧은 기본값(10분)으로 폴백합니다.
 */
export function secondsUntilStoreClose(now: Date = getNowKST()): number {
  const closeToday = new Date(now);
  closeToday.setHours(STORE_CLOSE_HOUR, 0, 0, 0);
  const diffMs = closeToday.getTime() - now.getTime();
  return diffMs > 0 ? Math.floor(diffMs / 1000) : 60 * 10;
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
 * 생년월일 6자리(YYMMDD, 주민번호 앞자리 형식)를 'YYYY-MM-DD'로 변환합니다.
 * 연도는 세기 구분자 없이 입력받으므로, 현재 연도 뒤 2자리보다 크면 1900년대,
 * 작거나 같으면 2000년대로 판단합니다. 형식이 잘못됐거나 존재할 수 없는
 * 월/일이면 null을 반환합니다.
 */
export function birthDigitsToISODate(digits: string): string | null {
  if (!/^\d{6}$/.test(digits)) return null;

  const yy = parseInt(digits.slice(0, 2), 10);
  const mm = parseInt(digits.slice(2, 4), 10);
  const dd = parseInt(digits.slice(4, 6), 10);

  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return null;

  const nowYY = new Date().getFullYear() % 100;
  const year = (yy <= nowYY ? 2000 : 1900) + yy;

  return `${year}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

/**
 * 'YYYY-MM-DD' 형식의 생년월일을 6자리(YYMMDD)로 변환합니다.
 * 생년월일 수정 화면에서 기존 값을 숫자판에 미리 채워 넣을 때 사용합니다.
 */
export function isoDateToBirthDigits(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return `${year.slice(2)}${month}${day}`;
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
