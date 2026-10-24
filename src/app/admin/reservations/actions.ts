'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getAdminSession, getStaffSession } from '@/lib/adminSession';
import { sendSms } from '@/lib/sms';
import { normalizePhone, isValidPhone, getTodayKST, estimateSmsByteLength } from '@/lib/utils';
import { AUDIT_ACTION } from '@/lib/constants';
import {
  DEFAULT_RESERVATION_SMS_TITLE,
  DEFAULT_RESERVATION_SMS_BODY,
  LMS_TITLE_BYTE_LIMIT,
  RESERVATION_TEMPLATE_BYTE_LIMIT,
  renderReservationMessage,
} from '@/lib/reservationMessage';
import type { ApiResponse } from '@/types/database';

/**
 * 전화 예약자 명단 · 예약 안내 문자 (026 마이그레이션)
 * 여권 회원 명단과 분리된 별도 명단이며, 예약 안내(정보성) 목적으로만 씁니다.
 * 예약 입력·문자 보내기·명단 보기·예약 수정·취소·삭제는 매니저 계정도 쓸 수 있고(getStaffSession),
 * 문구 수정은 전체 관리자만 할 수 있습니다(getAdminSession).
 */

const TEMPLATE_TITLE_KEY = 'reservation_sms_title';
const TEMPLATE_BODY_KEY = 'reservation_sms_body';
const PAST_LIST_LIMIT = 500;

export interface ReservationItem {
  id: string;
  customerName: string;
  phone: string;
  /** 'YYYY-MM-DD' */
  reservedDate: string;
  /** 'HH:MM' */
  reservedTime: string;
  partySize: number;
  memo: string | null;
  status: 'reserved' | 'cancelled';
  smsStatus: 'sent' | 'failed' | null;
  smsSentAt: string | null;
  smsError: string | null;
  createdAt: string;
  /** 같은 번호의 여권 회원이 있는지 */
  isPassportMember: boolean;
}

export interface ReservationInput {
  customerName: string;
  phone: string;
  reservedDate: string;
  reservedTime: string;
  partySize: number;
  memo: string;
}

export interface ReservationSmsTemplate {
  title: string;
  body: string;
}

interface ReservationRow {
  id: string;
  customer_name: string;
  phone: string;
  reserved_date: string;
  reserved_time: string;
  party_size: number;
  memo: string | null;
  status: 'reserved' | 'cancelled';
  sms_status: 'sent' | 'failed' | null;
  sms_sent_at: string | null;
  sms_error: string | null;
  created_at: string;
}

function toItem(row: ReservationRow, memberPhones: Set<string>): ReservationItem {
  return {
    id: row.id,
    customerName: row.customer_name,
    phone: row.phone,
    reservedDate: row.reserved_date,
    reservedTime: row.reserved_time.slice(0, 5),
    partySize: row.party_size,
    memo: row.memo,
    status: row.status,
    smsStatus: row.sms_status,
    smsSentAt: row.sms_sent_at,
    smsError: row.sms_error,
    createdAt: row.created_at,
    isPassportMember: memberPhones.has(row.phone),
  };
}

/** 입력값 검사 · 정리. 문제가 있으면 오류 문구를 돌려줍니다. */
function validateInput(input: ReservationInput): { error: string } | { value: ReservationInput } {
  const customerName = input.customerName.trim();
  if (!customerName) return { error: '예약자명을 입력해 주세요.' };
  if (!isValidPhone(input.phone)) return { error: '올바른 휴대폰 번호를 입력해 주세요.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.reservedDate)) return { error: '예약 날짜를 선택해 주세요.' };
  if (!/^\d{2}:\d{2}$/.test(input.reservedTime)) return { error: '예약 시간을 선택해 주세요.' };
  if (!Number.isInteger(input.partySize) || input.partySize < 1 || input.partySize > 200) {
    return { error: '인원을 1명 이상으로 입력해 주세요.' };
  }
  return {
    value: {
      customerName,
      phone: normalizePhone(input.phone),
      reservedDate: input.reservedDate,
      reservedTime: input.reservedTime,
      partySize: input.partySize,
      memo: input.memo.trim(),
    },
  };
}

async function readTemplate(supabase: ReturnType<typeof createAdminClient>): Promise<ReservationSmsTemplate> {
  const { data } = await supabase
    .from('app_settings')
    .select('key, value')
    .in('key', [TEMPLATE_TITLE_KEY, TEMPLATE_BODY_KEY]);
  const map = new Map((data || []).map((r) => [r.key as string, r.value as string]));
  return {
    title: map.get(TEMPLATE_TITLE_KEY) || DEFAULT_RESERVATION_SMS_TITLE,
    body: map.get(TEMPLATE_BODY_KEY) || DEFAULT_RESERVATION_SMS_BODY,
  };
}

/** 예약 안내 문자를 보내고 결과를 예약 기록에 남깁니다. 실패하면 오류 문구를 돌려줍니다. */
async function sendReservationSms(
  supabase: ReturnType<typeof createAdminClient>,
  reservationId: string,
  value: Omit<ReservationInput, 'memo'>
): Promise<string | null> {
  let smsError: string | null = null;
  try {
    const template = await readTemplate(supabase);
    const message = renderReservationMessage(template.body, value);
    const result = await sendSms({
      receivers: [value.phone.replace(/\D/g, '')],
      message,
      title: template.title,
      forceLms: true,
    });
    if (result.successCount < 1) {
      smsError = '알리고가 발송을 받아들이지 않았습니다. 번호를 확인해 주세요.';
    }
  } catch (error) {
    console.error('예약 안내 문자 발송 오류:', error);
    smsError = error instanceof Error ? error.message : '문자 발송 중 오류가 발생했습니다.';
  }

  await supabase
    .from('reservations')
    .update({
      sms_status: smsError ? 'failed' : 'sent',
      sms_sent_at: new Date().toISOString(),
      sms_error: smsError,
    })
    .eq('id', reservationId);

  return smsError;
}

export interface ReservationSendResult {
  /** 문자를 보내지 못했으면 그 이유 (예약은 저장됨). 성공이면 null */
  smsError: string | null;
}

/** 예약을 예약자 명단에 저장하고 예약 안내 문자(장문)를 보냅니다. */
export async function createReservationAndSendSms(
  input: ReservationInput
): Promise<ApiResponse<ReservationSendResult>> {
  const admin = await getStaffSession();
  if (!admin) return { success: false, error: '관리자 로그인이 필요합니다.' };

  const checked = validateInput(input);
  if ('error' in checked) return { success: false, error: checked.error };
  const value = checked.value;

  try {
    const supabase = createAdminClient();
    const { data: row, error } = await supabase
      .from('reservations')
      .insert({
        customer_name: value.customerName,
        phone: value.phone,
        reserved_date: value.reservedDate,
        reserved_time: value.reservedTime,
        party_size: value.partySize,
        memo: value.memo || null,
        created_by: admin.adminId,
      })
      .select('id')
      .single();

    if (error || !row) {
      console.error('예약 저장 오류:', error);
      return { success: false, error: '예약 저장 중 오류가 발생했습니다. 문자는 보내지 않았습니다.' };
    }

    const smsError = await sendReservationSms(supabase, row.id, value);

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.RESERVATION_CREATE,
      target_type: 'reservation',
      target_id: row.id,
      after_data: {
        reserved_date: value.reservedDate,
        reserved_time: value.reservedTime,
        party_size: value.partySize,
        sms: smsError ? 'failed' : 'sent',
      },
    });

    return { success: true, data: { smsError } };
  } catch (error) {
    console.error('createReservationAndSendSms 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/** 저장된 예약으로 예약 안내 문자를 다시 보냅니다 (실패했거나 내용을 고친 뒤). */
export async function resendReservationSms(reservationId: string): Promise<ApiResponse<ReservationSendResult>> {
  const admin = await getStaffSession();
  if (!admin) return { success: false, error: '관리자 로그인이 필요합니다.' };

  try {
    const supabase = createAdminClient();
    const { data: row } = await supabase
      .from('reservations')
      .select('id, customer_name, phone, reserved_date, reserved_time, party_size, status')
      .eq('id', reservationId)
      .single();
    if (!row) return { success: false, error: '예약을 찾을 수 없습니다.' };
    if (row.status === 'cancelled') return { success: false, error: '취소된 예약에는 문자를 보낼 수 없습니다.' };

    const smsError = await sendReservationSms(supabase, row.id, {
      customerName: row.customer_name,
      phone: row.phone,
      reservedDate: row.reserved_date,
      reservedTime: String(row.reserved_time).slice(0, 5),
      partySize: row.party_size,
    });

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.RESERVATION_SMS_RESEND,
      target_type: 'reservation',
      target_id: row.id,
      after_data: { sms: smsError ? 'failed' : 'sent' },
    });

    return { success: true, data: { smsError } };
  } catch (error) {
    console.error('resendReservationSms 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/** 예약 내용 수정 (문자는 보내지 않음 — 필요하면 '문자재전송') */
export async function updateReservation(reservationId: string, input: ReservationInput): Promise<ApiResponse<null>> {
  const admin = await getStaffSession();
  if (!admin) return { success: false, error: '관리자 로그인이 필요합니다.' };

  const checked = validateInput(input);
  if ('error' in checked) return { success: false, error: checked.error };
  const value = checked.value;

  try {
    const supabase = createAdminClient();
    const { data: before } = await supabase.from('reservations').select('*').eq('id', reservationId).single();
    if (!before) return { success: false, error: '예약을 찾을 수 없습니다.' };

    const { error } = await supabase
      .from('reservations')
      .update({
        customer_name: value.customerName,
        phone: value.phone,
        reserved_date: value.reservedDate,
        reserved_time: value.reservedTime,
        party_size: value.partySize,
        memo: value.memo || null,
      })
      .eq('id', reservationId);
    if (error) return { success: false, error: '예약 수정 중 오류가 발생했습니다.' };

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.RESERVATION_UPDATE,
      target_type: 'reservation',
      target_id: reservationId,
      before_data: {
        reserved_date: before.reserved_date,
        reserved_time: before.reserved_time,
        party_size: before.party_size,
      },
      after_data: {
        reserved_date: value.reservedDate,
        reserved_time: value.reservedTime,
        party_size: value.partySize,
      },
    });

    return { success: true };
  } catch (error) {
    console.error('updateReservation 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/** 예약 삭제 — 예약자 명단에서 완전히 지웁니다 (되돌릴 수 없음). 활동이력에는 전화번호 없이 일시·인원만 남깁니다. */
export async function deleteReservation(reservationId: string): Promise<ApiResponse<null>> {
  const admin = await getStaffSession();
  if (!admin) return { success: false, error: '관리자 로그인이 필요합니다.' };

  try {
    const supabase = createAdminClient();
    const { data: before } = await supabase
      .from('reservations')
      .select('reserved_date, reserved_time, party_size, status')
      .eq('id', reservationId)
      .single();
    if (!before) return { success: false, error: '예약을 찾을 수 없습니다.' };

    const { error } = await supabase.from('reservations').delete().eq('id', reservationId);
    if (error) return { success: false, error: '예약 삭제 중 오류가 발생했습니다.' };

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.RESERVATION_DELETE,
      target_type: 'reservation',
      target_id: reservationId,
      before_data: before,
    });
    return { success: true };
  } catch (error) {
    console.error('deleteReservation 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/** 예약 취소 (명단에는 '취소'로 남습니다) */
export async function cancelReservation(reservationId: string): Promise<ApiResponse<null>> {
  const admin = await getStaffSession();
  if (!admin) return { success: false, error: '관리자 로그인이 필요합니다.' };

  try {
    const supabase = createAdminClient();
    const { error } = await supabase
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId);
    if (error) return { success: false, error: '예약 취소 중 오류가 발생했습니다.' };

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.RESERVATION_CANCEL,
      target_type: 'reservation',
      target_id: reservationId,
    });
    return { success: true };
  } catch (error) {
    console.error('cancelReservation 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/** 예약 목록의 전화번호 중 여권 회원 번호 */
async function findPassportMemberPhones(
  supabase: ReturnType<typeof createAdminClient>,
  rows: ReservationRow[]
): Promise<Set<string>> {
  const phones = [...new Set(rows.map((r) => r.phone))];
  const memberPhones = new Set<string>();
  for (let i = 0; i < phones.length; i += 200) {
    const { data: members } = await supabase
      .from('customers')
      .select('phone')
      .eq('is_active', true)
      .in('phone', phones.slice(i, i + 200));
    (members || []).forEach((m) => memberPhones.add(m.phone as string));
  }
  return memberPhones;
}

export type ReservationListScope = 'upcoming' | 'past';

/**
 * 예약자 명단 — 다가오는 예약(오늘 이후, 빠른 순) 또는 지난 예약(최근 순, 최대 500건).
 * 열 때마다 보관 기간(마지막 예약일로부터 3년)이 지난 기록을 먼저 삭제합니다.
 */
export async function getReservations(scope: ReservationListScope): Promise<ApiResponse<ReservationItem[]>> {
  const admin = await getStaffSession();
  if (!admin) return { success: false, error: '관리자 로그인이 필요합니다.' };

  try {
    const supabase = createAdminClient();
    const { error: purgeError } = await supabase.rpc('purge_old_reservations');
    if (purgeError) console.error('예약 보관기간 정리 오류:', purgeError);

    const today = getTodayKST();
    const query = supabase.from('reservations').select('*');
    const { data, error } =
      scope === 'upcoming'
        ? await query
            .gte('reserved_date', today)
            .order('reserved_date', { ascending: true })
            .order('reserved_time', { ascending: true })
        : await query
            .lt('reserved_date', today)
            .order('reserved_date', { ascending: false })
            .order('reserved_time', { ascending: false })
            .limit(PAST_LIST_LIMIT);

    if (error) {
      console.error('getReservations 오류:', error);
      return { success: false, error: '예약 명단을 불러오지 못했습니다. (026 마이그레이션을 실행했는지 확인해 주세요)' };
    }

    const rows = (data || []) as ReservationRow[];
    const memberPhones = await findPassportMemberPhones(supabase, rows);

    return { success: true, data: rows.map((r) => toItem(r, memberPhones)) };
  } catch (error) {
    console.error('getReservations 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/** 달력 보기 — 기간(보통 한 달) 안의 예약 전체 (취소 포함, 날짜·시간 순) */
export async function getReservationsInRange(from: string, to: string): Promise<ApiResponse<ReservationItem[]>> {
  const admin = await getStaffSession();
  if (!admin) return { success: false, error: '관리자 로그인이 필요합니다.' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return { success: false, error: '기간이 올바르지 않습니다.' };
  }

  try {
    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('reservations')
      .select('*')
      .gte('reserved_date', from)
      .lte('reserved_date', to)
      .order('reserved_date', { ascending: true })
      .order('reserved_time', { ascending: true });

    if (error) {
      console.error('getReservationsInRange 오류:', error);
      return { success: false, error: '예약을 불러오지 못했습니다.' };
    }

    const rows = (data || []) as ReservationRow[];
    const memberPhones = await findPassportMemberPhones(supabase, rows);
    return { success: true, data: rows.map((r) => toItem(r, memberPhones)) };
  } catch (error) {
    console.error('getReservationsInRange 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/** 예약 안내 문자 문구 (저장된 문구, 없으면 기본 문구) */
export async function getReservationSmsTemplate(): Promise<ApiResponse<ReservationSmsTemplate>> {
  const admin = await getStaffSession();
  if (!admin) return { success: false, error: '관리자 로그인이 필요합니다.' };
  try {
    return { success: true, data: await readTemplate(createAdminClient()) };
  } catch (error) {
    console.error('getReservationSmsTemplate 오류:', error);
    return { success: false, error: '문구를 불러오지 못했습니다.' };
  }
}

/** 예약 안내 문자 문구 저장 */
export async function updateReservationSmsTemplate(template: ReservationSmsTemplate): Promise<ApiResponse<null>> {
  const admin = await getAdminSession();
  if (!admin) return { success: false, error: '문구 수정은 전체 관리자만 할 수 있습니다.' };

  const title = template.title.trim();
  const body = template.body.trim();
  if (!title) return { success: false, error: '문자 제목을 입력해 주세요.' };
  if (!body) return { success: false, error: '문자 내용을 입력해 주세요.' };
  if (estimateSmsByteLength(title) > LMS_TITLE_BYTE_LIMIT) {
    return { success: false, error: `제목이 너무 깁니다. (한글 약 ${LMS_TITLE_BYTE_LIMIT / 2}자까지)` };
  }
  if (estimateSmsByteLength(body) > RESERVATION_TEMPLATE_BYTE_LIMIT) {
    return { success: false, error: `내용이 너무 깁니다. (한글 약 ${RESERVATION_TEMPLATE_BYTE_LIMIT / 2}자까지)` };
  }

  try {
    const supabase = createAdminClient();
    const before = await readTemplate(supabase);
    const { error } = await supabase.from('app_settings').upsert(
      [
        { key: TEMPLATE_TITLE_KEY, value: title, updated_at: new Date().toISOString(), updated_by: admin.adminId },
        { key: TEMPLATE_BODY_KEY, value: body, updated_at: new Date().toISOString(), updated_by: admin.adminId },
      ],
      { onConflict: 'key' }
    );
    if (error) {
      console.error('updateReservationSmsTemplate 오류:', error);
      return { success: false, error: '문구 저장 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.RESERVATION_SMS_TEMPLATE_UPDATE,
      target_type: 'app_settings',
      before_data: before,
      after_data: { title, body },
    });
    return { success: true };
  } catch (error) {
    console.error('updateReservationSmsTemplate 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}
