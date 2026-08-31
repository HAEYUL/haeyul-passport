'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  normalizePhone,
  isValidPhone,
  getTodayKST,
  isWithinStoreHours,
  birthDigitsToISODate,
  toKSTDateString,
  addMonthsToDateString,
  daysBetweenDateStrings,
} from '@/lib/utils';
import { setSession, getSession, clearSession } from '@/lib/session';
import { getVerifiedStoreId } from '@/lib/qrVerification';
import { getVisitTierInfo, type VisitTierInfo } from '@/lib/tiers';
import { getNextCouponInfo, type RewardRuleInput } from '@/lib/couponRules';
import { REWARD_EXPIRY_MONTHS, STORE_OPEN_HOUR, STORE_CLOSE_HOUR, AUDIT_ACTION } from '@/lib/constants';
import { verifyLocation } from '@/lib/geo';
import type { ApiResponse, Customer, RewardStatus } from '@/types/database';

const LOCATION_REJECTED_ERROR = '매장에서만 방문 등록이 가능합니다.';
const OUTSIDE_STORE_HOURS_ERROR =
  `지금은 매장 운영시간이 아닙니다.\n매일 오전 ${STORE_OPEN_HOUR}시~오후 ${STORE_CLOSE_HOUR - 12}시에 이용해 주세요.`;

/**
 * QR로 확인된 매장의 좌표를 조회하고, 클라이언트 좌표와 비교해 위치 확인 결과를 판정합니다.
 * 반경 밖으로 확인된 경우(status: 'failed') 호출부에서 등록 자체를 막아야 합니다.
 */
async function checkStoreLocation(
  supabase: ReturnType<typeof createAdminClient>,
  storeId: string,
  clientLat: number | null,
  clientLng: number | null
) {
  const { data: store } = await supabase
    .from('stores')
    .select('latitude, longitude, radius_meters')
    .eq('id', storeId)
    .single();

  return verifyLocation(clientLat, clientLng, store ?? { latitude: null, longitude: null, radius_meters: 100 });
}

/**
 * 선물 발급일(issuedAt) 기준 유효기간(6개월)이 지났는지 확인합니다.
 * 서버가 실행되는 위치의 로컬 타임존이 아니라 항상 한국시간(KST) 날짜
 * 기준으로 계산합니다 (자정 근처 발급 건에서 하루 어긋나는 것을 방지).
 */
function isRewardExpired(issuedAt: string): boolean {
  const issuedDateKST = toKSTDateString(issuedAt);
  const expiryDateKST = addMonthsToDateString(issuedDateKST, REWARD_EXPIRY_MONTHS);
  return getTodayKST() >= expiryDateKST;
}

/**
 * 할인권 만료 여부를 판정합니다. expires_at이 명시적으로 지정된 할인권
 * (예: 생일축하 쿠폰의 30일 유효기간)은 그 값을 그대로 쓰고, 지정되지
 * 않은 기존 방식(방문 기준 할인권)은 issued_at + 6개월로 계산합니다.
 */
function isRewardExpiredAt(issuedAt: string, expiresAt: string | null): boolean {
  if (expiresAt) {
    return Date.now() >= new Date(expiresAt).getTime();
  }
  return isRewardExpired(issuedAt);
}

interface RegisterResult {
  customer: Customer;
  visitDate: string;
  isFirstVisit: boolean;
}

/**
 * 신규회원 가입 Server Action
 * - 회원 등록
 * - 개인정보 동의 기록
 * - 첫 방문 자동 등록
 */
export async function registerCustomer(
  formData: FormData
): Promise<ApiResponse<RegisterResult>> {
  try {
    if (!isWithinStoreHours()) {
      return { success: false, error: OUTSIDE_STORE_HOURS_ERROR };
    }

    const name = (formData.get('name') as string)?.trim();
    const rawPhone = (formData.get('phone') as string)?.trim();
    const birthDigits = (formData.get('birth_date_digits') as string)?.trim() || '';
    const marketingConsent = formData.get('marketing_consent') === 'true';
    const privacyConsent = formData.get('privacy_consent') === 'true';

    // ─── 유효성 검사 ─────────────────────────────
    if (!name) {
      return { success: false, error: '성함을 입력해 주세요.' };
    }

    if (!rawPhone) {
      return { success: false, error: '휴대전화 번호를 입력해 주세요.' };
    }

    if (!isValidPhone(rawPhone)) {
      return { success: false, error: '올바른 휴대전화 번호를 입력해 주세요.' };
    }

    const birthDate = birthDigitsToISODate(birthDigits);
    if (!birthDate) {
      return { success: false, error: '생년월일 6자리를 정확히 입력해 주세요.' };
    }

    if (!privacyConsent) {
      return { success: false, error: '개인정보 수집·이용에 동의해 주세요.' };
    }

    const storeId = await getVerifiedStoreId();
    if (!storeId) {
      return {
        success: false,
        error: '매장 방문 확인이 필요합니다.\nQR코드를 다시 스캔해 주세요.',
      };
    }

    const phone = normalizePhone(rawPhone);

    const supabase = createAdminClient();

    // ─── 위치 확인 (QR 부정 스캔 방지) ─────────────────
    const rawLat = formData.get('latitude') as string | null;
    const rawLng = formData.get('longitude') as string | null;
    const clientLat = rawLat ? Number(rawLat) : null;
    const clientLng = rawLng ? Number(rawLng) : null;
    const locationResult = await checkStoreLocation(supabase, storeId, clientLat, clientLng);

    if (locationResult.status === 'failed') {
      return { success: false, error: LOCATION_REJECTED_ERROR };
    }

    // ─── 중복 전화번호 확인 ─────────────────────────
    const { data: existing } = await supabase
      .from('customers')
      .select('id, name')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();

    if (existing) {
      return {
        success: false,
        error: `이미 가입된 번호입니다. '기존 전자여권 열기'를 이용해 주세요.`,
      };
    }

    // ─── 회원 등록 ─────────────────────────────
    const { data: customer, error: customerError } = await supabase
      .from('customers')
      .insert({
        customer_number: '', // 트리거가 자동 생성
        name,
        phone,
        birth_date: birthDate || null,
        marketing_consent: marketingConsent,
        signup_store_id: storeId,
      })
      .select()
      .single();

    if (customerError) {
      console.error('회원 등록 실패:', customerError);
      if (customerError.code === '23505') {
        return {
          success: false,
          error: '이미 가입된 번호입니다.',
        };
      }
      return { success: false, error: '회원 등록 중 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.' };
    }

    // ─── 개인정보 동의 기록 ─────────────────────────
    const consentRecords = [
      {
        customer_id: customer.id,
        consent_type: 'privacy',
        consented: true,
      },
    ];

    if (marketingConsent) {
      consentRecords.push({
        customer_id: customer.id,
        consent_type: 'marketing',
        consented: true,
      });
    }

    await supabase.from('consent_logs').insert(consentRecords);

    // ─── 첫 방문 자동 등록 ──────────────────────────
    const todayKST = getTodayKST();

    const { error: visitError } = await supabase.from('visits').insert({
      customer_id: customer.id,
      visit_date: todayKST,
      store_id: storeId,
      location_verified: locationResult.status,
      distance_meters: locationResult.distanceMeters,
    });

    if (visitError) {
      console.error('첫 방문 등록 실패:', visitError);
      // 회원은 이미 생성되었으므로, 방문 등록 실패는 경고만
    }

    // 최신 고객 정보 다시 조회 (visit_count 트리거 반영)
    const { data: updatedCustomer } = await supabase
      .from('customers')
      .select()
      .eq('id', customer.id)
      .single();

    const finalCustomer = updatedCustomer || customer;

    // 세션 설정
    await setSession({
      customerId: finalCustomer.id,
      name: finalCustomer.name,
      phone: finalCustomer.phone,
    });

    return {
      success: true,
      data: {
        customer: finalCustomer,
        visitDate: todayKST,
        isFirstVisit: true,
      },
      message: '해율 자연의 흐름 전자여권이 발급되었습니다.',
    };
  } catch (error) {
    console.error('registerCustomer 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.\n잠시 후 다시 시도해 주세요.' };
  }
}

/**
 * 기존회원 로그인 Server Action
 */
export async function loginCustomer(
  formData: FormData
): Promise<ApiResponse<Customer>> {
  try {
    const name = (formData.get('name') as string)?.trim();
    const rawPhone = (formData.get('phone') as string)?.trim();
    const birthDigits = (formData.get('birth_date_digits') as string)?.trim() || '';

    if (!name || !rawPhone) {
      return { success: false, error: '성함과 휴대전화 번호를 입력해 주세요.' };
    }

    if (!isValidPhone(rawPhone)) {
      return { success: false, error: '올바른 휴대전화 번호를 입력해 주세요.' };
    }

    const birthDate = birthDigitsToISODate(birthDigits);
    if (!birthDate) {
      return { success: false, error: '생년월일 6자리를 정확히 입력해 주세요.' };
    }

    const phone = normalizePhone(rawPhone);
    const supabase = createAdminClient();

    const { data: customer, error } = await supabase
      .from('customers')
      .select()
      .eq('phone', phone)
      .eq('name', name)
      .eq('is_active', true)
      .single();

    if (error || !customer) {
      return {
        success: false,
        error: '일치하는 회원 정보가 없습니다. 성함과 전화번호를 다시 확인해 주세요.',
      };
    }

    if (customer.birth_date) {
      // 이미 등록된 생년월일이 있으면 본인확인으로 대조합니다.
      if (customer.birth_date !== birthDate) {
        return { success: false, error: '생년월일이 일치하지 않습니다. 다시 확인해 주세요.' };
      }
    } else {
      // 처음 로그인 시 생년월일이 없던 기존 고객은 이번 입력값을 그대로 등록합니다.
      const { error: updateError } = await supabase
        .from('customers')
        .update({ birth_date: birthDate })
        .eq('id', customer.id);

      if (updateError) {
        console.error('생년월일 등록 실패:', updateError);
      } else {
        customer.birth_date = birthDate;
      }
    }

    // 세션 설정
    await setSession({
      customerId: customer.id,
      name: customer.name,
      phone: customer.phone,
    });

    return {
      success: true,
      data: customer,
    };
  } catch (error) {
    console.error('loginCustomer 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 세션 & 전자여권 데이터
// ============================================================

/**
 * 로그인 세션을 조회하고, 유효하면 만료시각을 60일로 다시 연장합니다(슬라이딩 세션).
 * 활동이 있을 때마다 갱신되므로, 60일 안에 한 번이라도 다시 방문하는 고객은
 * 로그인이 끊기지 않고 계속 유지됩니다.
 */
async function requireSession() {
  const session = await getSession();
  if (session) {
    await setSession(session);
  }
  return session;
}

/**
 * 로그아웃
 */
export async function logout() {
  await clearSession();
}

/**
 * 전자여권 홈 데이터 조회
 */
export interface StoreVisitCount {
  storeName: string;
  count: number;
}

export interface PassportData {
  customer: Customer;
  todayVisited: boolean;
  recentVisitDate: string | null;
  availableRewards: number;
  hasRewardToUse: boolean;
  tier: VisitTierInfo;
  qrVerified: boolean;
  /** QR로 확인된 현재 매장 이름. 확인 안 됐으면 null */
  storeName: string | null;
  rewardProgressMessage: string;
  /** 매장별 누적 방문 횟수 (한 번도 안 간 매장도 0회로 포함) */
  storeVisitBreakdown: StoreVisitCount[];
  /** 7일 이내 만료되는 보유 할인권 중 가장 임박한 것. 없으면 null */
  soonExpiringReward: { amount: number; daysLeft: number } | null;
}

/** 할인권 만료 알림 기준(일). 이 기간 이내로 남으면 홈 화면에 임박 알림을 띄웁니다. */
const REWARD_EXPIRY_WARNING_DAYS = 7;

/** customer_rewards 행의 실제 만료일('YYYY-MM-DD')을 계산합니다. expires_at이 없으면 발급일+6개월. */
function computeExpiryDateKST(issuedAt: string, expiresAt: string | null): string {
  if (expiresAt) {
    return toKSTDateString(expiresAt);
  }
  return addMonthsToDateString(toKSTDateString(issuedAt), REWARD_EXPIRY_MONTHS);
}

/**
 * 다음 할인권까지 남은 방문 횟수와 예정 금액 안내 문구를 계산합니다.
 * (실물 선물 대신 reward_rules 기반 금액형 할인권 — 008_coupon_rewards.sql 참고)
 */
async function getRewardProgressMessage(
  supabase: ReturnType<typeof createAdminClient>,
  visitCount: number,
  tier: VisitTierInfo
): Promise<string> {
  if (tier.isMaxTier) {
    return '가장 오랜 시간 자연을 함께한 해율푸드 VIP 입니다.';
  }

  const { data: rules } = await supabase
    .from('reward_rules')
    .select('id, threshold_visits, amount, is_repeating, repeat_interval')
    .eq('is_active', true)
    .eq('is_birthday', false);

  const ruleInputs: RewardRuleInput[] = (rules || []).map((r) => ({
    id: r.id,
    thresholdVisits: r.threshold_visits,
    amount: r.amount,
    isRepeating: r.is_repeating,
    repeatInterval: r.repeat_interval,
  }));

  const next = getNextCouponInfo(visitCount, ruleInputs);
  if (!next) return '';

  return `다음 할인권까지 ${next.visitsRemaining}회 남았습니다. (${next.amount.toLocaleString()}원)`;
}

export async function getPassportData(): Promise<ApiResponse<PassportData>> {
  try {
    const session = await requireSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const storeId = await getVerifiedStoreId();

    // 고객 정보
    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select()
      .eq('id', session.customerId)
      .eq('is_active', true)
      .single();

    if (custError || !customer) {
      return { success: false, error: '회원 정보를 찾을 수 없습니다.' };
    }

    // 오늘 방문 여부 (QR로 확인된 현재 매장 기준 — 다른 매장은 오늘 이미 방문했어도 별개)
    const todayKST = getTodayKST();
    let todayVisited = false;
    if (storeId) {
      const { data: todayVisit } = await supabase
        .from('visits')
        .select('id')
        .eq('customer_id', customer.id)
        .eq('visit_date', todayKST)
        .eq('store_id', storeId)
        .eq('is_cancelled', false)
        .single();
      todayVisited = !!todayVisit;
    }

    // QR로 확인된 현재 매장 이름
    let storeName: string | null = null;
    if (storeId) {
      const { data: store } = await supabase.from('stores').select('name').eq('id', storeId).single();
      storeName = store?.name ?? null;
    }

    // 최근 방문일
    const { data: recentVisit } = await supabase
      .from('visits')
      .select('visit_date')
      .eq('customer_id', customer.id)
      .eq('is_cancelled', false)
      .order('visit_date', { ascending: false })
      .limit(1)
      .single();

    // 사용 가능한 할인권 수 (아직 사용하지 않았고, 유효기간이 지나지 않은 할인권만 — 옛 실물 선물 기록은 제외)
    const { data: rewards } = await supabase
      .from('customer_rewards')
      .select('id, status, amount, issued_at, expires_at')
      .eq('customer_id', customer.id)
      .not('reward_rule_id', 'is', null)
      .neq('status', 'used');

    const unexpiredRewards = (rewards || []).filter((r) => !isRewardExpiredAt(r.issued_at, r.expires_at));
    const availableRewards = unexpiredRewards.length;

    // 만료까지 REWARD_EXPIRY_WARNING_DAYS일 이내로 남은 할인권 중 가장 임박한 것
    const todayForExpiry = getTodayKST();
    let soonExpiringReward: { amount: number; daysLeft: number } | null = null;
    for (const r of unexpiredRewards) {
      const expiryDateKST = computeExpiryDateKST(r.issued_at, r.expires_at);
      const daysLeft = daysBetweenDateStrings(todayForExpiry, expiryDateKST);
      if (daysLeft <= REWARD_EXPIRY_WARNING_DAYS && (!soonExpiringReward || daysLeft < soonExpiringReward.daysLeft)) {
        soonExpiringReward = { amount: r.amount ?? 0, daysLeft };
      }
    }

    const tier = getVisitTierInfo(customer.visit_count);

    // 매장별 누적 방문 횟수 (한 번도 안 간 매장도 0회로 포함)
    const { data: allStores } = await supabase
      .from('stores')
      .select('id, name')
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    const { data: visitRows } = await supabase
      .from('visits')
      .select('store_id')
      .eq('customer_id', customer.id)
      .eq('is_cancelled', false);

    const visitCountMap = new Map<string, number>();
    for (const v of visitRows || []) {
      visitCountMap.set(v.store_id, (visitCountMap.get(v.store_id) || 0) + 1);
    }
    const storeVisitBreakdown: StoreVisitCount[] = (allStores || [])
      .map((s) => ({
        storeName: s.name,
        count: visitCountMap.get(s.id) || 0,
      }))
      .sort((a, b) => b.count - a.count);

    return {
      success: true,
      data: {
        customer,
        todayVisited,
        recentVisitDate: recentVisit?.visit_date || null,
        availableRewards,
        hasRewardToUse: availableRewards > 0,
        tier,
        qrVerified: storeId !== null,
        storeName,
        rewardProgressMessage: await getRewardProgressMessage(supabase, customer.visit_count, tier),
        storeVisitBreakdown,
        soonExpiringReward,
      },
    };
  } catch (error) {
    console.error('getPassportData 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 방문 등록
// ============================================================

export interface VisitResult {
  visitCount: number;
  /** 이번 방문으로 새로 발급된 할인권 금액 목록(원) */
  newCouponAmounts: number[];
  tier: VisitTierInfo;
  /** 이번 방문으로 방문 등급이 올랐는지 여부 */
  tierUpgraded: boolean;
}

/**
 * 오늘의 방문 기록하기
 */
export async function registerVisit(
  latitude?: number | null,
  longitude?: number | null
): Promise<ApiResponse<VisitResult>> {
  try {
    const session = await requireSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    if (!isWithinStoreHours()) {
      return { success: false, error: OUTSIDE_STORE_HOURS_ERROR };
    }

    const storeId = await getVerifiedStoreId();
    if (!storeId) {
      return {
        success: false,
        error: '매장 방문 확인이 필요합니다.\nQR코드를 다시 스캔해 주세요.',
      };
    }

    const supabase = createAdminClient();
    const todayKST = getTodayKST();

    // ─── 위치 확인 (QR 부정 스캔 방지) ─────────────────
    const locationResult = await checkStoreLocation(supabase, storeId, latitude ?? null, longitude ?? null);
    if (locationResult.status === 'failed') {
      return { success: false, error: LOCATION_REJECTED_ERROR };
    }

    // 오늘 이 매장에 이미 방문했는지 확인 (다른 매장은 같은 날에도 별도로 방문 가능)
    const { data: existing } = await supabase
      .from('visits')
      .select('id')
      .eq('customer_id', session.customerId)
      .eq('visit_date', todayKST)
      .eq('store_id', storeId)
      .eq('is_cancelled', false)
      .single();

    if (existing) {
      return {
        success: false,
        error: '오늘의 방문은 이미 기록되었습니다.\n방문 기록은 하루에 한 번만 가능합니다.',
      };
    }

    // 방문 등록
    const { error: visitError } = await supabase.from('visits').insert({
      customer_id: session.customerId,
      visit_date: todayKST,
      store_id: storeId,
      location_verified: locationResult.status,
      distance_meters: locationResult.distanceMeters,
    });

    if (visitError) {
      console.error('방문 등록 실패:', visitError);
      if (visitError.code === '23505') {
        return {
          success: false,
          error: '오늘의 방문은 이미 기록되었습니다.',
        };
      }
      return { success: false, error: '방문 등록 중 오류가 발생했습니다.' };
    }

    // 갱신된 고객 정보 조회
    const { data: updatedCustomer } = await supabase
      .from('customers')
      .select('visit_count')
      .eq('id', session.customerId)
      .single();

    const visitCount = updatedCustomer?.visit_count || 0;

    // 이번 방문으로 방문 등급이 올랐는지 확인 (방문 1회당 visit_count가 정확히 1 증가하므로 -1이 방문 전 등급)
    const tierBefore = getVisitTierInfo(Math.max(0, visitCount - 1));
    const tierAfter = getVisitTierInfo(visitCount);
    const tierUpgraded = tierBefore.key !== tierAfter.key;

    // 방금 이 방문으로 새로 발급된 할인권 확인 (DB 트리거가 방문 횟수 임계값 달성 시 자동 발급)
    const recentThreshold = new Date(Date.now() - 10000).toISOString();
    const { data: justIssued } = await supabase
      .from('customer_rewards')
      .select('amount')
      .eq('customer_id', session.customerId)
      .not('reward_rule_id', 'is', null)
      .gte('issued_at', recentThreshold);

    const newCouponAmounts = (justIssued || [])
      .map((j) => j.amount ?? 0)
      .filter((amount) => amount > 0);

    return {
      success: true,
      data: { visitCount, newCouponAmounts, tier: tierAfter, tierUpgraded },
      message: '오늘도 자연의 흐름이 여권에 기록되었습니다.',
    };
  } catch (error) {
    console.error('registerVisit 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 방문 기록 조회
// ============================================================

export interface VisitHistoryData {
  totalVisits: number;
  firstVisitDate: string | null;
  recentVisitDate: string | null;
  visits: { visit_date: string; visit_time: string; storeName: string }[];
}

export async function getVisitHistory(): Promise<ApiResponse<VisitHistoryData>> {
  try {
    const session = await requireSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: visits, error } = await supabase
      .from('visits')
      .select('visit_date, visit_time, store_id')
      .eq('customer_id', session.customerId)
      .eq('is_cancelled', false)
      .order('visit_date', { ascending: false });

    if (error) {
      return { success: false, error: '방문 기록 조회 중 오류가 발생했습니다.' };
    }

    const visitList = visits || [];

    const { data: stores } = await supabase.from('stores').select('id, name');
    const storeMap = new Map((stores || []).map((s) => [s.id, s.name]));

    const visitsWithStore = visitList.map((v) => ({
      visit_date: v.visit_date,
      visit_time: v.visit_time,
      storeName: storeMap.get(v.store_id) || '-',
    }));

    return {
      success: true,
      data: {
        totalVisits: visitList.length,
        firstVisitDate: visitList.length > 0 ? visitList[visitList.length - 1].visit_date : null,
        recentVisitDate: visitList.length > 0 ? visitList[0].visit_date : null,
        visits: visitsWithStore,
      },
    };
  } catch (error) {
    console.error('getVisitHistory 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 선물함 (직원확인 즉시 사용 처리)
// ============================================================

export interface RewardItem {
  id: string;
  /** 할인 금액(원) */
  amount: number;
  /** 이 할인권이 해당하는 방문 횟수 기준. 생일·컴백 쿠폰이면 의미 없음(0) */
  thresholdVisits: number;
  /** 'visit'(방문 기준 할인권) | 'birthday'(생일축하 쿠폰) | 'comeback'(컴백 쿠폰) */
  source: 'visit' | 'birthday' | 'comeback';
  status: RewardStatus;
  issuedAt: string;
  usedAt: string | null;
  /** 발급된 매장 이름. 생일축하 쿠폰처럼 특정 매장 없이 발급된 경우 null */
  issuedStoreName: string | null;
  /** 사용된 매장 이름. 아직 미사용이면 null */
  usedStoreName: string | null;
  /** 더 이상 사용할 수 없는 할인권인지 여부 (방문 할인권은 6개월, 생일 쿠폰은 30일) */
  isExpired: boolean;
}

/**
 * 로그인된 고객의 선물함(할인권) 목록 조회.
 * 실물 선물 시절의 옛 기록(reward_id 기반)은 과거 데이터로 보존하되 화면에는 표시하지 않고,
 * 할인권(reward_rule_id 기반 — 방문 할인권과 생일축하 쿠폰 모두 포함)만 보여줍니다.
 */
export async function getRewards(): Promise<ApiResponse<RewardItem[]>> {
  try {
    const session = await requireSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: customerRewards, error } = await supabase
      .from('customer_rewards')
      .select('id, threshold_visits, amount, status, source, issued_at, expires_at, used_at, issued_store_id, used_store_id')
      .eq('customer_id', session.customerId)
      .not('reward_rule_id', 'is', null)
      .order('issued_at', { ascending: true });

    if (error) {
      return { success: false, error: '할인권함 조회 중 오류가 발생했습니다.' };
    }

    const list = customerRewards || [];
    const storeIds = [
      ...new Set([
        ...list.map((r) => r.issued_store_id),
        ...list.map((r) => r.used_store_id).filter((id): id is string => !!id),
      ]),
    ];

    let storeNameMap: Record<string, string> = {};
    if (storeIds.length > 0) {
      const { data: stores } = await supabase.from('stores').select('id, name').in('id', storeIds);
      storeNameMap = Object.fromEntries((stores || []).map((s) => [s.id, s.name]));
    }

    const result: RewardItem[] = list.map((cr) => ({
      id: cr.id,
      amount: cr.amount ?? 0,
      thresholdVisits: cr.threshold_visits ?? 0,
      source: (cr.source as 'visit' | 'birthday' | 'comeback') ?? 'visit',
      status: cr.status,
      issuedAt: cr.issued_at,
      usedAt: cr.used_at,
      issuedStoreName: cr.issued_store_id ? storeNameMap[cr.issued_store_id] || '-' : null,
      usedStoreName: cr.used_store_id ? storeNameMap[cr.used_store_id] || '-' : null,
      isExpired: cr.status !== 'used' && isRewardExpiredAt(cr.issued_at, cr.expires_at),
    }));

    return { success: true, data: result };
  } catch (error) {
    console.error('getRewards 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 할인권 사용 확인 — '사용 완료'로 즉시 처리합니다.
 * 별도의 직원 인증 없이, 매장에서 직원이 확인 버튼을 눌러주면 바로 처리됩니다.
 * 지금 QR로 확인된 매장을 used_store_id로 함께 기록합니다.
 */
export async function confirmRewardUse(
  customerRewardId: string
): Promise<ApiResponse<null>> {
  try {
    const session = await requireSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const storeId = await getVerifiedStoreId();
    if (!storeId) {
      return {
        success: false,
        error: '매장 방문 확인이 필요합니다.\nQR코드를 다시 스캔해 주세요.',
      };
    }

    const supabase = createAdminClient();

    const { data: cr } = await supabase
      .from('customer_rewards')
      .select('id, status, customer_id, issued_at, expires_at')
      .eq('id', customerRewardId)
      .single();

    if (!cr || cr.customer_id !== session.customerId) {
      return { success: false, error: '할인권 정보를 찾을 수 없습니다.' };
    }

    if (cr.status === 'used') {
      return { success: false, error: '이미 사용된 할인권입니다.' };
    }

    if (isRewardExpiredAt(cr.issued_at, cr.expires_at)) {
      return { success: false, error: '유효기간이 지난 할인권입니다.\n사용하실 수 없습니다.' };
    }

    const { data: updated, error } = await supabase
      .from('customer_rewards')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
        used_store_id: storeId,
      })
      .eq('id', customerRewardId)
      .neq('status', 'used')
      .select('id');

    if (error) {
      return { success: false, error: '처리 중 오류가 발생했습니다.' };
    }

    if (!updated || updated.length === 0) {
      // 이 요청이 처리되기 전에 다른 곳(다른 매장 등)에서 이미 사용 처리됨
      return { success: false, error: '이미 사용된 할인권입니다.' };
    }

    return { success: true };
  } catch (error) {
    console.error('confirmRewardUse 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 내 정보
// ============================================================

/**
 * 마케팅 수신 동의 변경
 */
export async function updateMarketingConsent(consent: boolean): Promise<ApiResponse<null>> {
  try {
    const session = await requireSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('customers')
      .update({ marketing_consent: consent })
      .eq('id', session.customerId);

    if (error) {
      return { success: false, error: '변경 중 오류가 발생했습니다.' };
    }

    await supabase.from('consent_logs').insert({
      customer_id: session.customerId,
      consent_type: 'marketing',
      consented: consent,
    });

    return { success: true };
  } catch (error) {
    console.error('updateMarketingConsent 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 로그인된 고객이 본인의 생년월일을 직접 수정합니다.
 * 성함·회원번호·전화번호는 본인 확인 절차가 없어 셀프 수정 대상에서 제외합니다.
 * 생년월일은 로그인 시 본인확인 수단으로도 쓰이기 때문에, 비워서(null로)
 * 저장하는 것은 허용하지 않습니다 — 값을 지울 수 있게 하면, 다음 로그인 때
 * "미등록 상태에서 처음 입력한 값을 그대로 등록"하는 로직이 악용되어 이름+
 * 전화번호만 아는 제3자가 생년월일을 새로 설정하고 로그인할 수 있게 됩니다.
 */
export async function updateBirthDate(birthDigits: string): Promise<ApiResponse<null>> {
  try {
    const session = await requireSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const birthDate = birthDigitsToISODate(birthDigits);
    if (!birthDate) {
      return { success: false, error: '생년월일 6자리를 정확히 입력해 주세요.' };
    }

    const supabase = createAdminClient();

    const { error } = await supabase
      .from('customers')
      .update({ birth_date: birthDate })
      .eq('id', session.customerId);

    if (error) {
      return { success: false, error: '변경 중 오류가 발생했습니다.' };
    }

    return { success: true };
  } catch (error) {
    console.error('updateBirthDate 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 회원 탈퇴 — 고객이 직접 요청하는 완전 삭제입니다.
 * 관리자의 deleteCustomer와 동일하게 방문기록·할인권·동의기록까지 CASCADE로
 * 함께 삭제되며(가입 시 안내한 "탈퇴 시까지 보관" 정책에 따른 것), 되돌릴 수
 * 없습니다. 탈퇴 사실 자체는 audit_logs에 admin_id 없이 남겨 추적할 수 있게 합니다.
 */
export async function withdrawCustomer(): Promise<ApiResponse<null>> {
  try {
    const session = await requireSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: before } = await supabase
      .from('customers')
      .select()
      .eq('id', session.customerId)
      .single();

    const { error } = await supabase.from('customers').delete().eq('id', session.customerId);

    if (error) {
      return { success: false, error: '탈퇴 처리 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: null,
      action: AUDIT_ACTION.CUSTOMER_WITHDRAW,
      target_type: 'customer',
      target_id: session.customerId,
      before_data: before ?? null,
      after_data: null,
    });

    await clearSession();

    return { success: true };
  } catch (error) {
    console.error('withdrawCustomer 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 여권 설명서 (로그인 불필요)
// ============================================================

export interface RewardRuleCatalogItem {
  thresholdVisits: number;
  amount: number;
  isRepeating: boolean;
  repeatInterval: number | null;
}

/**
 * 현재 운영 중인 할인권 지급 규칙 목록 (설명서 화면용, 로그인 불필요)
 */
export async function getRewardCatalog(): Promise<ApiResponse<RewardRuleCatalogItem[]>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('reward_rules')
      .select('threshold_visits, amount, is_repeating, repeat_interval')
      .eq('is_active', true)
      .eq('is_birthday', false)
      .order('threshold_visits', { ascending: true });

    if (error) {
      return { success: false, error: '할인권 정보를 불러올 수 없습니다.' };
    }

    return {
      success: true,
      data: (data || []).map((r) => ({
        thresholdVisits: r.threshold_visits,
        amount: r.amount,
        isRepeating: r.is_repeating,
        repeatInterval: r.repeat_interval,
      })),
    };
  } catch (error) {
    console.error('getRewardCatalog 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 매장 확인 (로그인 불필요)
// ============================================================

/**
 * QR 스캔으로 현재 확인된 매장의 이름을 반환합니다. 확인 안 됐으면 null.
 */
export async function getCurrentStoreName(): Promise<string | null> {
  const storeId = await getVerifiedStoreId();
  if (!storeId) return null;

  const supabase = createAdminClient();
  const { data } = await supabase.from('stores').select('name').eq('id', storeId).single();
  return data?.name ?? null;
}
