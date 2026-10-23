/**
 * 전화 예약 안내 문자(장문) — 기본 문구와 문구 안의 자동 입력 칸 치환.
 * 관리자 화면(미리보기)과 서버(실제 발송)가 같은 함수를 써서, 미리보기와 받는 문자가 똑같습니다.
 * 문구는 관리자 화면에서 수정할 수 있고(app_settings), 저장된 문구가 없으면 아래 기본 문구를 씁니다.
 */

export const DEFAULT_RESERVATION_SMS_TITLE = '해율만두전골 예약 안내';

export const DEFAULT_RESERVATION_SMS_BODY = `[해율만두전골 예약 안내]

안녕하세요. 해율만두전골입니다.
{예약자명} 고객님, 예약해 주셔서 진심으로 감사드립니다.

■ 예약 내용
일시: {예약날짜} {예약시간}
인원: {인원}명

■ 예약금 안내
NH농협 356-1653-1165-83
예금주: 유종범(해율)
예약금: 50,000원
※ 입금하실 때 입금자명은 예약자 성함으로 해주세요.

■ 변경·취소 안내
예약 변경·취소는 방문 1일 전까지 전화로 연락 주시면 예약금은 전액 환불됩니다.
※ 예약 당일 취소 및 미방문 시 예약금은 환불되지 않습니다.

■ 주차 안내
주차장이 혼잡할 수 있으니 가급적 일행분들과 차량에 함께 탑승하여 방문해 주시면 감사하겠습니다.

■ 매장 위치 및 길찾기
https://naver.me/5wNEyLuN

■ 문의: 031-261-8000

소중한 모임이 즐거운 시간이 되도록 정성껏 준비하겠습니다.

감사합니다.
해율만두전골 드림`;

/** 문구에 넣을 수 있는 자동 입력 칸 */
export const RESERVATION_PLACEHOLDERS = ['{예약자명}', '{예약날짜}', '{예약시간}', '{인원}'] as const;

/** 장문(LMS) 본문 최대 길이(바이트) — 이름 등 자동 입력 칸이 늘어날 여유를 두고 문구 저장 시 검사합니다 */
export const LMS_BODY_BYTE_LIMIT = 2000;
export const RESERVATION_TEMPLATE_BYTE_LIMIT = 1900;
/** 장문 제목 최대 길이(바이트) */
export const LMS_TITLE_BYTE_LIMIT = 44;

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** '2026-10-25' → '10월 25일(일)' */
export function formatReservationDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return date;
  // 날짜만 있는 값이라 시간대 영향을 받지 않도록 UTC로 요일을 계산합니다.
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일(${weekday})`;
}

/** '12:30' → '낮 12시 30분', '18:00' → '저녁 6시' */
export function formatReservationTime(time: string): string {
  const [h, min] = time.split(':').map(Number);
  if (Number.isNaN(h) || Number.isNaN(min)) return time;
  const period = h < 12 ? '오전' : h < 14 ? '낮' : h < 18 ? '오후' : '저녁';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${period} ${hour12}시${min ? ` ${min}분` : ''}`;
}

export interface ReservationMessageValues {
  customerName: string;
  /** 'YYYY-MM-DD' */
  reservedDate: string;
  /** 'HH:MM' */
  reservedTime: string;
  partySize: number;
}

/** 문구의 자동 입력 칸을 예약 내용으로 바꿉니다. */
export function renderReservationMessage(template: string, values: ReservationMessageValues): string {
  return template
    .replaceAll('{예약자명}', values.customerName)
    .replaceAll('{예약날짜}', formatReservationDate(values.reservedDate))
    .replaceAll('{예약시간}', formatReservationTime(values.reservedTime))
    .replaceAll('{인원}', String(values.partySize));
}
