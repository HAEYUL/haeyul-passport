'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { normalizePhone, isValidPhone, getTodayKST } from '@/lib/utils';
import { setSession, getSession, clearSession } from '@/lib/session';
import { isQrVerified } from '@/lib/qrVerification';
import { getVisitTierInfo, type VisitTierInfo } from '@/lib/tiers';
import { REWARD_EXPIRY_MONTHS } from '@/lib/constants';
import type { ApiResponse, Customer, RewardStatus } from '@/types/database';

/**
 * 선물 발급일(issuedAt) 기준 유효기간(6개월)이 지났는지 확인합니다.
 */
function isRewardExpired(issuedAt: string): boolean {
  const expiry = new Date(issuedAt);
  expiry.setMonth(expiry.getMonth() + REWARD_EXPIRY_MONTHS);
  return Date.now() >= expiry.getTime();
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
    const name = (formData.get('name') as string)?.trim();
    const rawPhone = (formData.get('phone') as string)?.trim();
    const birthDate = (formData.get('birth_date') as string)?.trim() || null;
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

    if (!privacyConsent) {
      return { success: false, error: '개인정보 수집·이용에 동의해 주세요.' };
    }

    const phone = normalizePhone(rawPhone);

    const supabase = createAdminClient();

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
      return { success: false, error: '회원 등록 중 오류가 발생했습니다.' };
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
    return { success: false, error: '서버 오류가 발생했습니다.' };
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

    if (!name || !rawPhone) {
      return { success: false, error: '성함과 휴대전화 번호를 입력해 주세요.' };
    }

    if (!isValidPhone(rawPhone)) {
      return { success: false, error: '올바른 휴대전화 번호를 입력해 주세요.' };
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
 * 현재 로그인된 고객 세션 확인
 */
export async function getCurrentSession() {
  return getSession();
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
export interface PassportData {
  customer: Customer;
  todayVisited: boolean;
  recentVisitDate: string | null;
  availableRewards: number;
  hasRewardToUse: boolean;
  tier: VisitTierInfo;
  qrVerified: boolean;
  rewardProgressMessage: string;
}

/**
 * 다음 선물까지 남은 횟수 안내 문구를 계산합니다.
 * - 아직 선물을 한 번도 받지 못했으면 "첫 번째 선물까지"
 * - 마지막 선물(해율 VIP 승급 시점)까지 남았으면 "해율의 VIP까지는"
 * - 그 사이 구간이면 "다음 선물까지"
 * - 이미 해율 VIP면 축하 문구
 */
async function getRewardProgressMessage(
  supabase: ReturnType<typeof createAdminClient>,
  visitCount: number,
  tier: VisitTierInfo
): Promise<string> {
  if (tier.isMaxTier) {
    return '가장 오랜 시간 자연을 함께한 해율 VIP 입니다.';
  }

  const { data: rewards } = await supabase
    .from('rewards')
    .select('required_visits')
    .eq('is_active', true)
    .order('required_visits', { ascending: true });

  const thresholds = (rewards || []).map((r) => r.required_visits);
  const nextIndex = thresholds.findIndex((t) => t > visitCount);

  if (nextIndex === -1) {
    return '';
  }

  const remaining = thresholds[nextIndex] - visitCount;

  if (nextIndex === 0) {
    return `첫 번째 선물까지 ${remaining}회 남았습니다.`;
  }
  if (nextIndex === thresholds.length - 1) {
    return `해율의 VIP까지는 ${remaining}회 남았습니다.`;
  }
  return `다음 선물까지 ${remaining}회 남았습니다.`;
}

export async function getPassportData(): Promise<ApiResponse<PassportData>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

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

    // 오늘 방문 여부
    const todayKST = getTodayKST();
    const { data: todayVisit } = await supabase
      .from('visits')
      .select('id')
      .eq('customer_id', customer.id)
      .eq('visit_date', todayKST)
      .eq('is_cancelled', false)
      .single();

    // 최근 방문일
    const { data: recentVisit } = await supabase
      .from('visits')
      .select('visit_date')
      .eq('customer_id', customer.id)
      .eq('is_cancelled', false)
      .order('visit_date', { ascending: false })
      .limit(1)
      .single();

    // 사용 가능한 선물 수 (아직 사용하지 않았고, 유효기간이 지나지 않은 선물)
    const { data: rewards } = await supabase
      .from('customer_rewards')
      .select('id, status, issued_at')
      .eq('customer_id', customer.id)
      .neq('status', 'used');

    const availableRewards = (rewards || []).filter((r) => !isRewardExpired(r.issued_at)).length;
    const tier = getVisitTierInfo(customer.visit_count);

    return {
      success: true,
      data: {
        customer,
        todayVisited: !!todayVisit,
        recentVisitDate: recentVisit?.visit_date || null,
        availableRewards,
        hasRewardToUse: availableRewards > 0,
        tier,
        qrVerified: await isQrVerified(),
        rewardProgressMessage: await getRewardProgressMessage(supabase, customer.visit_count, tier),
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
  newRewardNames: string[];
  tier: VisitTierInfo;
}

/**
 * 오늘의 방문 기록하기
 */
export async function registerVisit(): Promise<ApiResponse<VisitResult>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    if (!(await isQrVerified())) {
      return {
        success: false,
        error: '매장 방문 확인이 필요합니다.\nQR코드를 다시 스캔해 주세요.',
      };
    }

    const supabase = createAdminClient();
    const todayKST = getTodayKST();

    // 오늘 이미 방문했는지 확인
    const { data: existing } = await supabase
      .from('visits')
      .select('id')
      .eq('customer_id', session.customerId)
      .eq('visit_date', todayKST)
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

    // 방금 이 방문으로 새로 발급된 선물 확인 (DB 트리거가 방문 횟수 임계값 달성 시 자동 발급)
    const recentThreshold = new Date(Date.now() - 10000).toISOString();
    const { data: justIssued } = await supabase
      .from('customer_rewards')
      .select('reward_id')
      .eq('customer_id', session.customerId)
      .gte('issued_at', recentThreshold);

    let newRewardNames: string[] = [];
    if (justIssued && justIssued.length > 0) {
      const rewardIds = justIssued.map((j) => j.reward_id);
      const { data: rewardRows } = await supabase
        .from('rewards')
        .select('id, name')
        .in('id', rewardIds);
      newRewardNames = (rewardRows || []).map((r) => r.name);
    }

    return {
      success: true,
      data: { visitCount, newRewardNames, tier: getVisitTierInfo(visitCount) },
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
  visits: { visit_date: string; visit_time: string }[];
}

export async function getVisitHistory(): Promise<ApiResponse<VisitHistoryData>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: visits, error } = await supabase
      .from('visits')
      .select('visit_date, visit_time')
      .eq('customer_id', session.customerId)
      .eq('is_cancelled', false)
      .order('visit_date', { ascending: false });

    if (error) {
      return { success: false, error: '방문 기록 조회 중 오류가 발생했습니다.' };
    }

    const visitList = visits || [];

    return {
      success: true,
      data: {
        totalVisits: visitList.length,
        firstVisitDate: visitList.length > 0 ? visitList[visitList.length - 1].visit_date : null,
        recentVisitDate: visitList.length > 0 ? visitList[0].visit_date : null,
        visits: visitList,
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
  rewardName: string;
  description: string | null;
  status: RewardStatus;
  issuedAt: string;
  requestedAt: string | null;
  usedAt: string | null;
  /** 미사용 상태로 발급일로부터 6개월이 지나 더 이상 사용할 수 없는 선물인지 여부 */
  isExpired: boolean;
}

/**
 * 로그인된 고객의 선물함 목록 조회
 */
export async function getRewards(): Promise<ApiResponse<RewardItem[]>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: customerRewards, error } = await supabase
      .from('customer_rewards')
      .select('id, reward_id, status, issued_at, requested_at, used_at')
      .eq('customer_id', session.customerId)
      .order('issued_at', { ascending: false });

    if (error) {
      return { success: false, error: '선물함 조회 중 오류가 발생했습니다.' };
    }

    const list = customerRewards || [];
    const rewardIds = [...new Set(list.map((r) => r.reward_id))];

    let rewardsMap: Record<string, { name: string; description: string | null }> = {};
    if (rewardIds.length > 0) {
      const { data: rewards } = await supabase
        .from('rewards')
        .select('id, name, description')
        .in('id', rewardIds);

      rewardsMap = Object.fromEntries(
        (rewards || []).map((r) => [r.id, { name: r.name, description: r.description }])
      );
    }

    const result: RewardItem[] = list.map((cr) => ({
      id: cr.id,
      rewardName: rewardsMap[cr.reward_id]?.name || '선물',
      description: rewardsMap[cr.reward_id]?.description ?? null,
      status: cr.status,
      issuedAt: cr.issued_at,
      requestedAt: cr.requested_at,
      usedAt: cr.used_at,
      isExpired: cr.status !== 'used' && isRewardExpired(cr.issued_at),
    }));

    return { success: true, data: result };
  } catch (error) {
    console.error('getRewards 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 선물 사용 확인 — '사용 완료'로 즉시 처리합니다.
 * 별도의 직원 인증 없이, 매장에서 직원이 확인 버튼을 눌러주면 바로 처리됩니다.
 */
export async function confirmRewardUse(
  customerRewardId: string
): Promise<ApiResponse<null>> {
  try {
    const session = await getSession();
    if (!session) {
      return { success: false, error: '로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: cr } = await supabase
      .from('customer_rewards')
      .select('id, status, customer_id, issued_at')
      .eq('id', customerRewardId)
      .single();

    if (!cr || cr.customer_id !== session.customerId) {
      return { success: false, error: '선물 정보를 찾을 수 없습니다.' };
    }

    if (cr.status === 'used') {
      return { success: false, error: '이미 사용된 선물입니다.' };
    }

    if (isRewardExpired(cr.issued_at)) {
      return { success: false, error: '유효기간이 지난 선물입니다.\n사용하실 수 없습니다.' };
    }

    const { error } = await supabase
      .from('customer_rewards')
      .update({
        status: 'used',
        used_at: new Date().toISOString(),
      })
      .eq('id', customerRewardId)
      .neq('status', 'used');

    if (error) {
      return { success: false, error: '처리 중 오류가 발생했습니다.' };
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
    const session = await getSession();
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

// ============================================================
// 여권 설명서 (로그인 불필요)
// ============================================================

export interface RewardCatalogItem {
  name: string;
  description: string | null;
  requiredVisits: number;
}

/**
 * 현재 운영 중인 방문 선물 목록 (설명서 화면용, 로그인 불필요)
 */
export async function getRewardCatalog(): Promise<ApiResponse<RewardCatalogItem[]>> {
  try {
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('rewards')
      .select('name, description, required_visits')
      .eq('is_active', true)
      .order('required_visits', { ascending: true });

    if (error) {
      return { success: false, error: '선물 정보를 불러올 수 없습니다.' };
    }

    return {
      success: true,
      data: (data || []).map((r) => ({
        name: r.name,
        description: r.description,
        requiredVisits: r.required_visits,
      })),
    };
  } catch (error) {
    console.error('getRewardCatalog 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}
