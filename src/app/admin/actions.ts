'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  getTodayKST,
  getTodayKSTRange,
  subtractDaysFromDateString,
  toKSTDateString,
  getDateBuckets,
  daysBetweenDateStrings,
  normalizePhone,
  isValidPhone,
  type StatsPeriod,
  type DateBucket,
} from '@/lib/utils';
import { AUDIT_ACTION } from '@/lib/constants';
import { getAllTiers, getVisitTierInfo, type VisitTierKey } from '@/lib/tiers';
import { getOrCreateQrSettings, reissueQrToken } from '@/lib/qrSettings';
import { sendSms } from '@/lib/sms';
import {
  setAdminSession,
  getAdminSession,
  clearAdminSession,
} from '@/lib/adminSession';
import type { ApiResponse, Customer, RewardStatus } from '@/types/database';

/**
 * 활성 고객의 "customer_id -> 최근 방문일(visit_date)" 맵을 만듭니다.
 * 대시보드의 장기 미방문 집계와 고객 목록 필터에서 함께 사용합니다.
 */
async function getLatestVisitDateMap(
  supabase: ReturnType<typeof createAdminClient>
): Promise<Map<string, string>> {
  const { data: visits } = await supabase
    .from('visits')
    .select('customer_id, visit_date')
    .eq('is_cancelled', false)
    .order('visit_date', { ascending: false });

  const map = new Map<string, string>();
  for (const v of visits || []) {
    if (!map.has(v.customer_id)) {
      map.set(v.customer_id, v.visit_date);
    }
  }
  return map;
}

// ============================================================
// 관리자 로그인 / 세션
// ============================================================

export async function adminLogin(
  username: string,
  password: string
): Promise<ApiResponse<null>> {
  try {
    if (!username || !password) {
      return { success: false, error: '아이디와 비밀번호를 입력해 주세요.' };
    }

    const supabase = createAdminClient();

    const { data: admin } = await supabase
      .from('admin_users')
      .select('id, username')
      .eq('username', username)
      .eq('is_active', true)
      .single();

    if (!admin) {
      return { success: false, error: '아이디 또는 비밀번호가 일치하지 않습니다.' };
    }

    const { data: verified } = await supabase.rpc('verify_admin_password', {
      p_admin_id: admin.id,
      p_password: password,
    });

    if (!verified) {
      return { success: false, error: '아이디 또는 비밀번호가 일치하지 않습니다.' };
    }

    await supabase
      .from('admin_users')
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', admin.id);

    await setAdminSession({ adminId: admin.id, username: admin.username });

    return { success: true };
  } catch (error) {
    console.error('adminLogin 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export async function adminLogout() {
  await clearAdminSession();
}

export interface AdminSessionInfo {
  adminId: string;
  username: string;
}

export async function getAdminSessionInfo(): Promise<AdminSessionInfo | null> {
  return getAdminSession();
}

// ============================================================
// 대시보드 통계
// ============================================================

// 장기 미방문 대시보드 카드의 기본 기준(일)
const DEFAULT_LONG_ABSENT_DAYS = 30;

export interface DashboardStats {
  totalCustomers: number;
  todayVisits: number;
  unclaimedRewards: number;
  newCustomersThisMonth: number;
  todayRewardsUsed: number;
  vipCount: number;
  longAbsentCount: number;
}

export async function getDashboardStats(): Promise<ApiResponse<DashboardStats>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const todayKST = getTodayKST();
    const monthStart = `${todayKST.slice(0, 7)}-01`;
    const { start: todayStart, end: todayEnd } = getTodayKSTRange();
    const vipMinVisits = getAllTiers().at(-1)?.minVisits ?? 30;

    const [
      { count: totalCustomers },
      { count: todayVisits },
      { count: unclaimedRewards },
      { count: newCustomersThisMonth },
      { count: todayRewardsUsed },
      { count: vipCount },
      { data: activeCustomers },
      latestVisitMap,
    ] = await Promise.all([
      supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true),
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('visit_date', todayKST)
        .eq('is_cancelled', false),
      supabase
        .from('customer_rewards')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'used'),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gte('created_at', monthStart),
      supabase
        .from('customer_rewards')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'used')
        .gte('used_at', todayStart)
        .lt('used_at', todayEnd),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gte('visit_count', vipMinVisits),
      supabase.from('customers').select('id').eq('is_active', true),
      getLatestVisitDateMap(supabase),
    ]);

    const activeIds = new Set((activeCustomers || []).map((c) => c.id));
    const cutoff = subtractDaysFromDateString(todayKST, DEFAULT_LONG_ABSENT_DAYS);
    let longAbsentCount = 0;
    for (const [customerId, lastVisitDate] of latestVisitMap) {
      if (activeIds.has(customerId) && lastVisitDate < cutoff) {
        longAbsentCount += 1;
      }
    }

    return {
      success: true,
      data: {
        totalCustomers: totalCustomers || 0,
        todayVisits: todayVisits || 0,
        unclaimedRewards: unclaimedRewards || 0,
        newCustomersThisMonth: newCustomersThisMonth || 0,
        todayRewardsUsed: todayRewardsUsed || 0,
        vipCount: vipCount || 0,
        longAbsentCount,
      },
    };
  } catch (error) {
    console.error('getDashboardStats 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 선물 발급/사용 집계
// ============================================================

export interface RewardStatItem {
  rewardId: string;
  rewardName: string;
  requiredVisits: number;
  totalIssued: number;
  totalUsed: number;
  totalUnused: number;
}

export async function getRewardStats(): Promise<ApiResponse<RewardStatItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: rewards, error: rewardsError } = await supabase
      .from('rewards')
      .select('id, name, required_visits')
      .eq('is_active', true)
      .order('required_visits', { ascending: true });

    if (rewardsError) {
      return { success: false, error: '선물 목록 조회 중 오류가 발생했습니다.' };
    }

    const { data: customerRewards, error: crError } = await supabase
      .from('customer_rewards')
      .select('reward_id, status');

    if (crError) {
      return { success: false, error: '선물 발급 현황 조회 중 오류가 발생했습니다.' };
    }

    const statsMap = new Map<string, RewardStatItem>(
      (rewards || []).map((r) => [
        r.id,
        {
          rewardId: r.id,
          rewardName: r.name,
          requiredVisits: r.required_visits,
          totalIssued: 0,
          totalUsed: 0,
          totalUnused: 0,
        },
      ])
    );

    for (const cr of customerRewards || []) {
      const stat = statsMap.get(cr.reward_id);
      if (!stat) continue;
      stat.totalIssued += 1;
      if (cr.status === 'used') {
        stat.totalUsed += 1;
      } else {
        stat.totalUnused += 1;
      }
    }

    return { success: true, data: Array.from(statsMap.values()) };
  } catch (error) {
    console.error('getRewardStats 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface RewardUsageItem {
  id: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  rewardName: string;
  requiredVisits: number;
  issuedAt: string;
  usedAt: string | null;
}

async function fetchRewardUsage(
  supabase: ReturnType<typeof createAdminClient>,
  statusFilter: 'available' | 'used'
): Promise<RewardUsageItem[]> {
  let request = supabase
    .from('customer_rewards')
    .select('id, customer_id, reward_id, issued_at, used_at, status')
    .order(statusFilter === 'used' ? 'used_at' : 'issued_at', { ascending: false })
    .limit(300);

  request = statusFilter === 'used' ? request.eq('status', 'used') : request.neq('status', 'used');

  const { data: crs, error } = await request;
  if (error || !crs || crs.length === 0) {
    return [];
  }

  const customerIds = [...new Set(crs.map((c) => c.customer_id))];
  const rewardIds = [...new Set(crs.map((c) => c.reward_id))];

  const [{ data: customers }, { data: rewards }] = await Promise.all([
    supabase.from('customers').select('id, name, customer_number').in('id', customerIds),
    supabase.from('rewards').select('id, name, required_visits').in('id', rewardIds),
  ]);

  const customerMap = new Map((customers || []).map((c) => [c.id, c]));
  const rewardMap = new Map((rewards || []).map((r) => [r.id, r]));

  return crs.map((cr) => {
    const c = customerMap.get(cr.customer_id);
    const r = rewardMap.get(cr.reward_id);
    return {
      id: cr.id,
      customerId: cr.customer_id,
      customerName: c?.name || '알 수 없음',
      customerNumber: c?.customer_number || '-',
      rewardName: r?.name || '알 수 없음',
      requiredVisits: r?.required_visits || 0,
      issuedAt: cr.issued_at,
      usedAt: cr.used_at,
    };
  });
}

/**
 * 아직 사용하지 않은(available/requested) 선물 목록
 */
export async function getAvailableRewards(): Promise<ApiResponse<RewardUsageItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const data = await fetchRewardUsage(supabase, 'available');
    return { success: true, data };
  } catch (error) {
    console.error('getAvailableRewards 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 사용 완료된 선물 목록
 */
export async function getUsedRewards(): Promise<ApiResponse<RewardUsageItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const data = await fetchRewardUsage(supabase, 'used');
    return { success: true, data };
  } catch (error) {
    console.error('getUsedRewards 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 잘못 사용 처리된 선물을 "사용 가능"으로 되돌립니다.
 */
export async function restoreReward(
  customerRewardId: string,
  reason: string
): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    if (!reason.trim()) {
      return { success: false, error: '복원 사유를 입력해 주세요.' };
    }

    const supabase = createAdminClient();

    const { data: before, error: fetchError } = await supabase
      .from('customer_rewards')
      .select('*')
      .eq('id', customerRewardId)
      .single();

    if (fetchError || !before) {
      return { success: false, error: '선물 정보를 찾을 수 없습니다.' };
    }

    if (before.status !== 'used') {
      return { success: false, error: '사용된 선물만 복원할 수 있습니다.' };
    }

    // customer_rewards에는 사용 완료된 선물의 일반 UPDATE를 막는 트리거가 있어,
    // 이를 우회하도록 만들어진 전용 RPC(restore_reward)를 통해서만 복원합니다.
    const { error: rpcError } = await supabase.rpc('restore_reward', {
      p_customer_reward_id: customerRewardId,
    });

    if (rpcError) {
      return { success: false, error: '복원 처리 중 오류가 발생했습니다.' };
    }

    const { data: after } = await supabase
      .from('customer_rewards')
      .select('*')
      .eq('id', customerRewardId)
      .single();

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.REWARD_RESTORE,
      target_type: 'customer_reward',
      target_id: customerRewardId,
      before_data: before,
      after_data: { ...after, reason: reason.trim() },
    });

    return { success: true };
  } catch (error) {
    console.error('restoreReward 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface RewardCatalogAdminItem {
  id: string;
  name: string;
  description: string | null;
  requiredVisits: number;
}

/**
 * 방문별 선물 기준(이름/설명) 관리 화면용 목록.
 * 방문 횟수 기준은 등급 체계(tiers.ts)와 별개로 관리되므로 여기서는 수정하지 않습니다.
 */
export async function getRewardCatalogForAdmin(): Promise<ApiResponse<RewardCatalogAdminItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('rewards')
      .select('id, name, description, required_visits')
      .eq('is_active', true)
      .order('required_visits', { ascending: true });

    if (error) {
      return { success: false, error: '선물 기준 조회 중 오류가 발생했습니다.' };
    }

    return {
      success: true,
      data: (data || []).map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        requiredVisits: r.required_visits,
      })),
    };
  } catch (error) {
    console.error('getRewardCatalogForAdmin 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface UpdateRewardCatalogInput {
  name: string;
  description: string;
}

/**
 * 선물명/설명만 수정합니다. (방문 횟수 기준은 고정)
 */
export async function updateRewardCatalogItem(
  rewardId: string,
  input: UpdateRewardCatalogInput
): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const name = input.name.trim();
    if (!name) {
      return { success: false, error: '선물명을 입력해 주세요.' };
    }

    const supabase = createAdminClient();

    const { data: before } = await supabase.from('rewards').select('*').eq('id', rewardId).single();
    if (!before) {
      return { success: false, error: '선물 정보를 찾을 수 없습니다.' };
    }

    const { data: after, error: updateError } = await supabase
      .from('rewards')
      .update({ name, description: input.description.trim() || null })
      .eq('id', rewardId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: '선물 정보 수정 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.REWARD_CATALOG_UPDATE,
      target_type: 'reward',
      target_id: rewardId,
      before_data: before,
      after_data: after,
    });

    return { success: true };
  } catch (error) {
    console.error('updateRewardCatalogItem 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 고객 목록 / 검색
// ============================================================

export interface CustomerListItem {
  id: string;
  customerNumber: string;
  name: string;
  phone: string;
  visitCount: number;
  createdAt: string;
  /** 최근 방문일 (방문 기록이 없으면 null) */
  recentVisitDate: string | null;
  /** 마케팅(광고성 문자 등) 수신동의 여부 */
  marketingConsent: boolean;
}

/**
 * 대시보드 통계 카드에서 넘어오는 고객 목록 필터.
 * - todayVisits: 오늘 방문한 고객
 * - newThisMonth: 이번 달 신규가입 고객
 * - unclaimedRewards: 미사용 선물을 보유한 고객
 * - todayRewardsUsed: 오늘 선물을 사용한 고객
 * - vip: 해율 VIP 등급(최고 등급) 고객
 * - longAbsent: 최근 방문일로부터 일정 기간 이상 방문이 없는 고객
 * - tier: 특정 방문 등급(tierKey)에 해당하는 고객
 * - birthdayThisMonth: 이번 달이 생일인 고객
 */
export type CustomerListFilter =
  | 'all'
  | 'todayVisits'
  | 'newThisMonth'
  | 'unclaimedRewards'
  | 'todayRewardsUsed'
  | 'vip'
  | 'longAbsent'
  | 'tier'
  | 'birthdayThisMonth';

export async function getCustomerList(
  query: string,
  filter: CustomerListFilter = 'all',
  longAbsentDays: number = DEFAULT_LONG_ABSENT_DAYS,
  tierKey?: VisitTierKey
): Promise<ApiResponse<CustomerListItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    // 최근 방문일은 모든 목록에서 공통으로 보여주므로 항상 먼저 구해둡니다.
    const latestVisitMap = await getLatestVisitDateMap(supabase);

    // 방문/선물/생일 기준 필터는 대상 고객 ID를 먼저 구한 뒤 customers 테이블에 적용합니다.
    let idFilter: string[] | null = null;

    if (filter === 'todayVisits') {
      const { data: visits } = await supabase
        .from('visits')
        .select('customer_id')
        .eq('visit_date', getTodayKST())
        .eq('is_cancelled', false);
      idFilter = [...new Set((visits || []).map((v) => v.customer_id))];
    } else if (filter === 'unclaimedRewards') {
      const { data: rewards } = await supabase
        .from('customer_rewards')
        .select('customer_id')
        .neq('status', 'used');
      idFilter = [...new Set((rewards || []).map((r) => r.customer_id))];
    } else if (filter === 'todayRewardsUsed') {
      const { start, end } = getTodayKSTRange();
      const { data: rewards } = await supabase
        .from('customer_rewards')
        .select('customer_id')
        .eq('status', 'used')
        .gte('used_at', start)
        .lt('used_at', end);
      idFilter = [...new Set((rewards || []).map((r) => r.customer_id))];
    } else if (filter === 'longAbsent') {
      const cutoff = subtractDaysFromDateString(getTodayKST(), longAbsentDays);
      idFilter = [...latestVisitMap.entries()]
        .filter(([, lastDate]) => lastDate < cutoff)
        .map(([customerId]) => customerId);
    } else if (filter === 'birthdayThisMonth') {
      const currentMonth = getTodayKST().slice(5, 7);
      const { data: customers } = await supabase
        .from('customers')
        .select('id, birth_date')
        .eq('is_active', true)
        .not('birth_date', 'is', null);
      idFilter = (customers || [])
        .filter((c) => c.birth_date && c.birth_date.slice(5, 7) === currentMonth)
        .map((c) => c.id);
    }

    if (idFilter && idFilter.length === 0) {
      return { success: true, data: [] };
    }

    let request = supabase
      .from('customers')
      .select('id, customer_number, name, phone, visit_count, created_at, marketing_consent')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(idFilter ? 1000 : 100);

    if (idFilter) {
      request = request.in('id', idFilter);
    }

    if (filter === 'newThisMonth') {
      const todayKST = getTodayKST();
      const monthStart = `${todayKST.slice(0, 7)}-01`;
      request = request.gte('created_at', monthStart);
    } else if (filter === 'vip') {
      const vipMinVisits = getAllTiers().at(-1)?.minVisits ?? 30;
      request = request.gte('visit_count', vipMinVisits);
    } else if (filter === 'tier' && tierKey) {
      const tiers = getAllTiers();
      const index = tiers.findIndex((t) => t.key === tierKey);
      if (index === -1) {
        return { success: true, data: [] };
      }
      request = request.gte('visit_count', tiers[index].minVisits);
      const next = tiers[index + 1];
      if (next) {
        request = request.lt('visit_count', next.minVisits);
      }
    }

    const trimmed = query.trim();
    if (trimmed) {
      // or() 필터 문법에서 구분자로 쓰이는 문자는 제거해 필터 인젝션을 방지합니다.
      const safe = trimmed.replace(/[,()]/g, '');
      request = request.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }

    const { data, error } = await request;

    if (error) {
      return { success: false, error: '고객 목록 조회 중 오류가 발생했습니다.' };
    }

    const result: CustomerListItem[] = (data || []).map((c) => ({
      id: c.id,
      customerNumber: c.customer_number,
      name: c.name,
      phone: c.phone,
      visitCount: c.visit_count,
      createdAt: c.created_at,
      recentVisitDate: latestVisitMap.get(c.id) ?? null,
      marketingConsent: c.marketing_consent,
    }));

    if (filter === 'longAbsent') {
      result.sort((a, b) => (a.recentVisitDate || '').localeCompare(b.recentVisitDate || ''));
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('getCustomerList 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface TierBreakdownItem {
  key: VisitTierKey;
  label: string;
  count: number;
}

/**
 * 등급별 고객 수 집계. "등급" 필터 화면에서 등급 목록을 보여줄 때 사용합니다.
 */
export async function getTierBreakdown(): Promise<ApiResponse<TierBreakdownItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const tiers = getAllTiers();

    const counts = await Promise.all(
      tiers.map((tier, i) => {
        const next = tiers[i + 1];
        let q = supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .gte('visit_count', tier.minVisits);
        if (next) {
          q = q.lt('visit_count', next.minVisits);
        }
        return q;
      })
    );

    return {
      success: true,
      data: tiers.map((tier, i) => ({
        key: tier.key,
        label: tier.label,
        count: counts[i].count || 0,
      })),
    };
  } catch (error) {
    console.error('getTierBreakdown 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 방문관리
// ============================================================

export interface VisitRecordItem {
  id: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  phone: string;
  visitDate: string;
  visitTime: string;
  isCancelled: boolean;
  cancelReason: string | null;
}

async function fetchVisitRecords(
  supabase: ReturnType<typeof createAdminClient>,
  opts: { dateFrom?: string; dateTo?: string; query?: string; onlyToday?: boolean; limit?: number }
): Promise<VisitRecordItem[]> {
  let idFilter: string[] | null = null;
  const trimmed = (opts.query || '').trim();
  if (trimmed) {
    const safe = trimmed.replace(/[,()]/g, '');
    const { data: matches } = await supabase
      .from('customers')
      .select('id')
      .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    idFilter = (matches || []).map((m) => m.id);
    if (idFilter.length === 0) return [];
  }

  let request = supabase
    .from('visits')
    .select('id, customer_id, visit_date, visit_time, is_cancelled, cancel_reason')
    .order('visit_date', { ascending: false })
    .order('visit_time', { ascending: false })
    .limit(opts.limit ?? 300);

  if (opts.onlyToday) {
    request = request.eq('visit_date', getTodayKST());
  }
  if (opts.dateFrom) {
    request = request.gte('visit_date', opts.dateFrom);
  }
  if (opts.dateTo) {
    request = request.lte('visit_date', opts.dateTo);
  }
  if (idFilter) {
    request = request.in('customer_id', idFilter);
  }

  const { data: visits, error } = await request;
  if (error || !visits || visits.length === 0) {
    return [];
  }

  const customerIds = [...new Set(visits.map((v) => v.customer_id))];
  const { data: customers } = await supabase
    .from('customers')
    .select('id, name, customer_number, phone')
    .in('id', customerIds);

  const customerMap = new Map((customers || []).map((c) => [c.id, c]));

  return visits.map((v) => {
    const c = customerMap.get(v.customer_id);
    return {
      id: v.id,
      customerId: v.customer_id,
      customerName: c?.name || '알 수 없음',
      customerNumber: c?.customer_number || '-',
      phone: c?.phone || '-',
      visitDate: v.visit_date,
      visitTime: v.visit_time,
      isCancelled: v.is_cancelled,
      cancelReason: v.cancel_reason,
    };
  });
}

/**
 * 오늘 방문한 고객의 방문 기록 목록
 */
export async function getTodayVisitors(): Promise<ApiResponse<VisitRecordItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const data = await fetchVisitRecords(supabase, { onlyToday: true, limit: 500 });
    return { success: true, data };
  } catch (error) {
    console.error('getTodayVisitors 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 전체 방문 기록 조회 (검색어/날짜 범위로 좁힐 수 있음)
 */
export async function getVisitRecords(
  query: string = '',
  dateFrom?: string,
  dateTo?: string
): Promise<ApiResponse<VisitRecordItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const data = await fetchVisitRecords(supabase, { query, dateFrom, dateTo, limit: 300 });
    return { success: true, data };
  } catch (error) {
    console.error('getVisitRecords 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface DuplicateVisitGroup {
  customerId: string;
  customerName: string;
  customerNumber: string;
  phone: string;
  visitDate: string;
  visits: { id: string; visitTime: string }[];
}

/**
 * 같은 고객이 같은 날짜에 취소되지 않은 방문 기록을 2건 이상 가진 경우를 찾습니다.
 * (DB 제약으로 원칙적으로 발생하지 않아야 하지만, 이상 여부를 점검하기 위한 화면)
 */
export async function getDuplicateVisits(): Promise<ApiResponse<DuplicateVisitGroup[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();

    const { data: visits, error } = await supabase
      .from('visits')
      .select('id, customer_id, visit_date, visit_time')
      .eq('is_cancelled', false);

    if (error) {
      return { success: false, error: '방문 기록 조회 중 오류가 발생했습니다.' };
    }

    const groups = new Map<
      string,
      { customerId: string; visitDate: string; visits: { id: string; visitTime: string }[] }
    >();
    for (const v of visits || []) {
      const key = `${v.customer_id}_${v.visit_date}`;
      if (!groups.has(key)) {
        groups.set(key, { customerId: v.customer_id, visitDate: v.visit_date, visits: [] });
      }
      groups.get(key)!.visits.push({ id: v.id, visitTime: v.visit_time });
    }

    const duplicates = [...groups.values()].filter((g) => g.visits.length > 1);
    if (duplicates.length === 0) {
      return { success: true, data: [] };
    }

    const customerIds = [...new Set(duplicates.map((d) => d.customerId))];
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, customer_number, phone')
      .in('id', customerIds);
    const customerMap = new Map((customers || []).map((c) => [c.id, c]));

    const result: DuplicateVisitGroup[] = duplicates
      .map((d) => {
        const c = customerMap.get(d.customerId);
        return {
          customerId: d.customerId,
          customerName: c?.name || '알 수 없음',
          customerNumber: c?.customer_number || '-',
          phone: c?.phone || '-',
          visitDate: d.visitDate,
          visits: d.visits.sort((a, b) => a.visitTime.localeCompare(b.visitTime)),
        };
      })
      .sort((a, b) => b.visitDate.localeCompare(a.visitDate));

    return { success: true, data: result };
  } catch (error) {
    console.error('getDuplicateVisits 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface VisitCountMismatchItem {
  customerId: string;
  customerName: string;
  customerNumber: string;
  phone: string;
  recordedVisitCount: number;
  actualVisitCount: number;
}

/**
 * customers.visit_count와 실제 visits 기록 수가 다른 고객을 찾습니다.
 * 일반 로그인 등으로 방문 횟수가 잘못 누적/누락된 비정상 케이스를 점검하는 용도입니다.
 */
export async function getVisitCountMismatches(): Promise<ApiResponse<VisitCountMismatchItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();

    const [{ data: customers, error: custError }, { data: visits, error: visitError }] = await Promise.all([
      supabase.from('customers').select('id, name, customer_number, phone, visit_count').eq('is_active', true),
      supabase.from('visits').select('customer_id').eq('is_cancelled', false),
    ]);

    if (custError || visitError) {
      return { success: false, error: '데이터 조회 중 오류가 발생했습니다.' };
    }

    const actualCounts = new Map<string, number>();
    for (const v of visits || []) {
      actualCounts.set(v.customer_id, (actualCounts.get(v.customer_id) || 0) + 1);
    }

    const mismatches: VisitCountMismatchItem[] = (customers || [])
      .filter((c) => c.visit_count !== (actualCounts.get(c.id) || 0))
      .map((c) => ({
        customerId: c.id,
        customerName: c.name,
        customerNumber: c.customer_number,
        phone: c.phone,
        recordedVisitCount: c.visit_count,
        actualVisitCount: actualCounts.get(c.id) || 0,
      }));

    return { success: true, data: mismatches };
  } catch (error) {
    console.error('getVisitCountMismatches 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 잘못 등록된 방문을 취소 처리합니다. (visit_count는 트리거로 자동 1 감소)
 */
export async function cancelVisit(visitId: string, reason: string): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    if (!reason.trim()) {
      return { success: false, error: '취소 사유를 입력해 주세요.' };
    }

    const supabase = createAdminClient();

    const { data: before, error: fetchError } = await supabase
      .from('visits')
      .select('*')
      .eq('id', visitId)
      .single();

    if (fetchError || !before) {
      return { success: false, error: '방문 기록을 찾을 수 없습니다.' };
    }

    if (before.is_cancelled) {
      return { success: false, error: '이미 취소된 방문입니다.' };
    }

    const { data: after, error: updateError } = await supabase
      .from('visits')
      .update({
        is_cancelled: true,
        cancelled_at: new Date().toISOString(),
        cancelled_by: admin.adminId,
        cancel_reason: reason.trim(),
      })
      .eq('id', visitId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: '방문 취소 처리 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.VISIT_CANCEL,
      target_type: 'visit',
      target_id: visitId,
      before_data: before,
      after_data: after,
    });

    return { success: true };
  } catch (error) {
    console.error('cancelVisit 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 관리자가 특정 고객의 방문을 수동으로 추가합니다. (visit_count는 트리거로 자동 1 증가)
 */
export async function addManualVisit(
  customerId: string,
  visitDate: string,
  reason: string
): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    if (!customerId) {
      return { success: false, error: '고객을 선택해 주세요.' };
    }
    if (!visitDate) {
      return { success: false, error: '방문 날짜를 입력해 주세요.' };
    }
    if (!reason.trim()) {
      return { success: false, error: '추가 사유를 입력해 주세요.' };
    }

    const supabase = createAdminClient();

    const { data: customer } = await supabase
      .from('customers')
      .select('id')
      .eq('id', customerId)
      .eq('is_active', true)
      .single();

    if (!customer) {
      return { success: false, error: '고객 정보를 찾을 수 없습니다.' };
    }

    const { data: existing } = await supabase
      .from('visits')
      .select('id')
      .eq('customer_id', customerId)
      .eq('visit_date', visitDate)
      .eq('is_cancelled', false)
      .single();

    if (existing) {
      return { success: false, error: '해당 날짜에 이미 방문 기록이 있습니다.' };
    }

    const { data: after, error: insertError } = await supabase
      .from('visits')
      .insert({ customer_id: customerId, visit_date: visitDate })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: '방문 추가 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.VISIT_ADD,
      target_type: 'visit',
      target_id: after.id,
      before_data: null,
      after_data: { ...after, reason: reason.trim() },
    });

    return { success: true };
  } catch (error) {
    console.error('addManualVisit 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// VIP관리
// ============================================================

export interface VipCustomerItem {
  id: string;
  name: string;
  customerNumber: string;
  phone: string;
  /** 해율 VIP 등급 선물이 발급된 시점 (VIP 달성일). 아직 발급되지 않았으면 null */
  vipAchievedAt: string | null;
  visitCount: number;
  recentVisitDate: string | null;
  giftUsed: boolean;
  adminNote: string | null;
}

/**
 * 해율 VIP(최고 등급) 고객 목록. VIP 달성일/감사 선물 사용 여부는
 * 최고 등급 선물(customer_rewards)의 발급일·상태를 그대로 사용합니다.
 */
export async function getVipCustomers(): Promise<ApiResponse<VipCustomerItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const vipMinVisits = getAllTiers().at(-1)?.minVisits ?? 30;

    const { data: customers, error: custError } = await supabase
      .from('customers')
      .select('id, name, customer_number, phone, visit_count, admin_note')
      .eq('is_active', true)
      .gte('visit_count', vipMinVisits)
      .order('visit_count', { ascending: false });

    if (custError) {
      return { success: false, error: '고객 목록 조회 중 오류가 발생했습니다.' };
    }
    if (!customers || customers.length === 0) {
      return { success: true, data: [] };
    }

    const { data: vipReward } = await supabase
      .from('rewards')
      .select('id')
      .eq('required_visits', vipMinVisits)
      .eq('is_active', true)
      .maybeSingle();

    const customerIds = customers.map((c) => c.id);
    const rewardMap = new Map<string, { issuedAt: string; status: string }>();

    if (vipReward) {
      const { data: crs } = await supabase
        .from('customer_rewards')
        .select('customer_id, issued_at, status')
        .eq('reward_id', vipReward.id)
        .in('customer_id', customerIds);

      for (const cr of crs || []) {
        rewardMap.set(cr.customer_id, { issuedAt: cr.issued_at, status: cr.status });
      }
    }

    const latestVisitMap = await getLatestVisitDateMap(supabase);

    const result: VipCustomerItem[] = customers.map((c) => {
      const rewardInfo = rewardMap.get(c.id);
      return {
        id: c.id,
        name: c.name,
        customerNumber: c.customer_number,
        phone: c.phone,
        vipAchievedAt: rewardInfo?.issuedAt || null,
        visitCount: c.visit_count,
        recentVisitDate: latestVisitMap.get(c.id) || null,
        giftUsed: rewardInfo?.status === 'used',
        adminNote: c.admin_note,
      };
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('getVipCustomers 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * VIP관리 화면에서 고객별 관리자 메모를 저장합니다.
 */
export async function updateCustomerAdminNote(
  customerId: string,
  note: string
): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const { error } = await supabase
      .from('customers')
      .update({ admin_note: note.trim() || null })
      .eq('id', customerId);

    if (error) {
      return { success: false, error: '메모 저장 중 오류가 발생했습니다.' };
    }

    return { success: true };
  } catch (error) {
    console.error('updateCustomerAdminNote 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface TodayVipVisitor {
  id: string;
  name: string;
  customerNumber: string;
}

/**
 * 오늘 방문한 고객 중 해율 VIP(최고 등급)인 고객 목록. 대시보드 알림에 사용합니다.
 */
export async function getTodayVipVisitors(): Promise<ApiResponse<TodayVipVisitor[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const vipMinVisits = getAllTiers().at(-1)?.minVisits ?? 30;

    const { data: visits } = await supabase
      .from('visits')
      .select('customer_id')
      .eq('visit_date', getTodayKST())
      .eq('is_cancelled', false);

    const customerIds = [...new Set((visits || []).map((v) => v.customer_id))];
    if (customerIds.length === 0) {
      return { success: true, data: [] };
    }

    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, name, customer_number, visit_count')
      .in('id', customerIds)
      .eq('is_active', true)
      .gte('visit_count', vipMinVisits);

    if (error) {
      return { success: false, error: 'VIP 방문자 조회 중 오류가 발생했습니다.' };
    }

    return {
      success: true,
      data: (customers || []).map((c) => ({
        id: c.id,
        name: c.name,
        customerNumber: c.customer_number,
      })),
    };
  } catch (error) {
    console.error('getTodayVipVisitors 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// QR관리
// ============================================================

export interface QrStatusInfo {
  token: string;
  createdAt: string;
  lastReissuedAt: string | null;
}

/**
 * 현재 활성 방문 QR 상태(토큰/생성일/최근 재발급일)를 조회합니다.
 */
export async function getQrStatus(): Promise<ApiResponse<QrStatusInfo>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const settings = await getOrCreateQrSettings();
    return {
      success: true,
      data: {
        token: settings.token,
        createdAt: settings.createdAt,
        lastReissuedAt: settings.lastReissuedAt,
      },
    };
  } catch (error) {
    console.error('getQrStatus 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * QR을 재발급합니다. 저장되는 즉시 기존 QR(토큰)은 무효화됩니다.
 */
export async function reissueQr(): Promise<ApiResponse<QrStatusInfo>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const { before, after } = await reissueQrToken(admin.adminId);

    const supabase = createAdminClient();
    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.QR_REISSUE,
      target_type: 'app_settings',
      target_id: after.id,
      before_data: { token: before.token, createdAt: before.createdAt, lastReissuedAt: before.lastReissuedAt },
      after_data: { token: after.token, createdAt: after.createdAt, lastReissuedAt: after.lastReissuedAt },
    });

    return {
      success: true,
      data: { token: after.token, createdAt: after.createdAt, lastReissuedAt: after.lastReissuedAt },
    };
  } catch (error) {
    console.error('reissueQr 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 고객 상세
// ============================================================

export interface CustomerVisitItem {
  visitDate: string;
}

export interface CustomerRewardItem {
  id: string;
  rewardName: string;
  status: RewardStatus;
  issuedAt: string;
  requestedAt: string | null;
  usedAt: string | null;
}

export interface CustomerDetail {
  customer: Customer;
  visits: CustomerVisitItem[];
  rewards: CustomerRewardItem[];
}

export async function getCustomerDetail(customerId: string): Promise<ApiResponse<CustomerDetail>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: customer, error: custError } = await supabase
      .from('customers')
      .select()
      .eq('id', customerId)
      .single();

    if (custError || !customer) {
      return { success: false, error: '고객 정보를 찾을 수 없습니다.' };
    }

    const { data: visits } = await supabase
      .from('visits')
      .select('visit_date')
      .eq('customer_id', customerId)
      .eq('is_cancelled', false)
      .order('visit_date', { ascending: false });

    const { data: customerRewards } = await supabase
      .from('customer_rewards')
      .select('id, reward_id, status, issued_at, requested_at, used_at')
      .eq('customer_id', customerId)
      .order('issued_at', { ascending: false });

    const rewardIds = [...new Set((customerRewards || []).map((r) => r.reward_id))];
    let rewardsMap: Record<string, string> = {};
    if (rewardIds.length > 0) {
      const { data: rewards } = await supabase.from('rewards').select('id, name').in('id', rewardIds);
      rewardsMap = Object.fromEntries((rewards || []).map((r) => [r.id, r.name]));
    }

    return {
      success: true,
      data: {
        customer,
        visits: (visits || []).map((v) => ({
          visitDate: v.visit_date,
        })),
        rewards: (customerRewards || []).map((r) => ({
          id: r.id,
          rewardName: rewardsMap[r.reward_id] || '선물',
          status: r.status,
          issuedAt: r.issued_at,
          requestedAt: r.requested_at,
          usedAt: r.used_at,
        })),
      },
    };
  } catch (error) {
    console.error('getCustomerDetail 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 고객 정보 수정 / 삭제
// ============================================================

export interface UpdateCustomerInput {
  name: string;
  phone: string;
  birthDate: string | null;
  marketingConsent: boolean;
  visitCount: number;
}

/**
 * 고객 정보 수정
 * visit_count를 바꾸면 DB 트리거가 자동으로 등급/선물 재계산을 처리합니다.
 */
export async function updateCustomer(
  customerId: string,
  input: UpdateCustomerInput
): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const name = input.name.trim();
    if (!name) {
      return { success: false, error: '성함을 입력해 주세요.' };
    }

    if (!isValidPhone(input.phone)) {
      return { success: false, error: '올바른 휴대전화 번호를 입력해 주세요.' };
    }
    const phone = normalizePhone(input.phone);

    if (!Number.isInteger(input.visitCount) || input.visitCount < 0) {
      return { success: false, error: '방문 횟수는 0 이상의 정수여야 합니다.' };
    }

    const supabase = createAdminClient();

    const { data: before, error: fetchError } = await supabase
      .from('customers')
      .select()
      .eq('id', customerId)
      .single();

    if (fetchError || !before) {
      return { success: false, error: '고객 정보를 찾을 수 없습니다.' };
    }

    const { data: updated, error } = await supabase
      .from('customers')
      .update({
        name,
        phone,
        birth_date: input.birthDate || null,
        marketing_consent: input.marketingConsent,
        visit_count: input.visitCount,
      })
      .eq('id', customerId)
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return { success: false, error: '이미 다른 회원이 사용 중인 전화번호입니다.' };
      }
      return { success: false, error: '수정 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.CUSTOMER_UPDATE,
      target_type: 'customer',
      target_id: customerId,
      before_data: before,
      after_data: updated,
    });

    return { success: true };
  } catch (error) {
    console.error('updateCustomer 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 고객 삭제 — 방문기록/선물/동의기록도 함께 삭제됩니다(CASCADE).
 */
export async function deleteCustomer(customerId: string): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: before, error: fetchError } = await supabase
      .from('customers')
      .select()
      .eq('id', customerId)
      .single();

    if (fetchError || !before) {
      return { success: false, error: '고객 정보를 찾을 수 없습니다.' };
    }

    const { error } = await supabase.from('customers').delete().eq('id', customerId);

    if (error) {
      return { success: false, error: '삭제 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.CUSTOMER_DELETE,
      target_type: 'customer',
      target_id: customerId,
      before_data: before,
      after_data: null,
    });

    return { success: true };
  } catch (error) {
    console.error('deleteCustomer 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 통계
// ============================================================

export interface TrendPoint {
  label: string;
  date: string;
  count: number;
}

export interface TrendResult {
  points: TrendPoint[];
  total: number;
  previousTotal: number;
  average: number;
}

/**
 * 선택된 기간(buckets)과, 그 직전의 같은 길이 기간의 시작/끝 날짜를 계산합니다.
 */
function getPreviousRange(buckets: DateBucket[]): { start: string; end: string } {
  const overallStart = buckets[0].start;
  const overallEnd = buckets[buckets.length - 1].end;
  const spanDays = daysBetweenDateStrings(overallStart, overallEnd) + 1;
  const prevEnd = subtractDaysFromDateString(overallStart, 1);
  const prevStart = subtractDaysFromDateString(prevEnd, spanDays - 1);
  return { start: prevStart, end: prevEnd };
}

function bucketizeDates(buckets: DateBucket[], dates: string[]): TrendPoint[] {
  return buckets.map((b) => ({
    label: b.label,
    date: b.start,
    count: dates.filter((d) => d >= b.start && d <= b.end).length,
  }));
}

/**
 * 일별/주별/월별 방문 수 추이. 방문 취소는 집계에서 제외합니다.
 */
export async function getVisitTrend(
  period: StatsPeriod,
  dateFrom?: string,
  dateTo?: string
): Promise<ApiResponse<TrendResult>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const buckets = getDateBuckets(period, dateFrom, dateTo);
    const overallStart = buckets[0].start;
    const overallEnd = buckets[buckets.length - 1].end;
    const prevRange = getPreviousRange(buckets);

    const [{ data: current }, { count: previousTotal }] = await Promise.all([
      supabase
        .from('visits')
        .select('visit_date')
        .eq('is_cancelled', false)
        .gte('visit_date', overallStart)
        .lte('visit_date', overallEnd),
      supabase
        .from('visits')
        .select('id', { count: 'exact', head: true })
        .eq('is_cancelled', false)
        .gte('visit_date', prevRange.start)
        .lte('visit_date', prevRange.end),
    ]);

    const dates = (current || []).map((v) => v.visit_date);
    const points = bucketizeDates(buckets, dates);
    const total = dates.length;

    return {
      success: true,
      data: {
        points,
        total,
        previousTotal: previousTotal || 0,
        average: buckets.length > 0 ? Math.round((total / buckets.length) * 10) / 10 : 0,
      },
    };
  } catch (error) {
    console.error('getVisitTrend 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 일별/주별/월별 신규가입자 수 추이. (customers.created_at 기준)
 */
export async function getSignupTrend(
  period: StatsPeriod,
  dateFrom?: string,
  dateTo?: string
): Promise<ApiResponse<TrendResult>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const buckets = getDateBuckets(period, dateFrom, dateTo);
    const overallStart = buckets[0].start;
    const overallEnd = buckets[buckets.length - 1].end;
    const prevRange = getPreviousRange(buckets);

    const overallStartTs = `${overallStart}T00:00:00+09:00`;
    const overallEndTs = `${overallEnd}T23:59:59.999+09:00`;
    const prevStartTs = `${prevRange.start}T00:00:00+09:00`;
    const prevEndTs = `${prevRange.end}T23:59:59.999+09:00`;

    const [{ data: current }, { count: previousTotal }] = await Promise.all([
      supabase
        .from('customers')
        .select('created_at')
        .eq('is_active', true)
        .gte('created_at', overallStartTs)
        .lte('created_at', overallEndTs),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gte('created_at', prevStartTs)
        .lte('created_at', prevEndTs),
    ]);

    const dates = (current || []).map((c) => toKSTDateString(c.created_at));
    const points = bucketizeDates(buckets, dates);
    const total = dates.length;

    return {
      success: true,
      data: {
        points,
        total,
        previousTotal: previousTotal || 0,
        average: buckets.length > 0 ? Math.round((total / buckets.length) * 10) / 10 : 0,
      },
    };
  } catch (error) {
    console.error('getSignupTrend 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface NewReturningPoint {
  label: string;
  date: string;
  newCount: number;
  returningCount: number;
}

/**
 * 선택된 기간에 방문한 고객을, 그 기간에 처음 방문한 고객(신규)과
 * 그 이전에도 방문 기록이 있던 고객(재방문)으로 나눠 집계합니다.
 */
export async function getNewVsReturningTrend(
  period: StatsPeriod,
  dateFrom?: string,
  dateTo?: string
): Promise<ApiResponse<NewReturningPoint[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const buckets = getDateBuckets(period, dateFrom, dateTo);
    const overallStart = buckets[0].start;
    const overallEnd = buckets[buckets.length - 1].end;

    const { data: rangeVisits, error } = await supabase
      .from('visits')
      .select('customer_id, visit_date')
      .eq('is_cancelled', false)
      .gte('visit_date', overallStart)
      .lte('visit_date', overallEnd);

    if (error) {
      return { success: false, error: '방문 기록 조회 중 오류가 발생했습니다.' };
    }

    const visits = rangeVisits || [];
    if (visits.length === 0) {
      return {
        success: true,
        data: buckets.map((b) => ({ label: b.label, date: b.start, newCount: 0, returningCount: 0 })),
      };
    }

    const customerIds = [...new Set(visits.map((v) => v.customer_id))];
    const { data: allVisits } = await supabase
      .from('visits')
      .select('customer_id, visit_date')
      .eq('is_cancelled', false)
      .in('customer_id', customerIds);

    const firstVisitMap = new Map<string, string>();
    for (const v of allVisits || []) {
      const cur = firstVisitMap.get(v.customer_id);
      if (!cur || v.visit_date < cur) {
        firstVisitMap.set(v.customer_id, v.visit_date);
      }
    }

    const result: NewReturningPoint[] = buckets.map((b) => {
      const customersInBucket = new Set(
        visits.filter((v) => v.visit_date >= b.start && v.visit_date <= b.end).map((v) => v.customer_id)
      );
      let newCount = 0;
      let returningCount = 0;
      for (const cid of customersInBucket) {
        const firstVisit = firstVisitMap.get(cid);
        if (firstVisit && firstVisit >= b.start && firstVisit <= b.end) {
          newCount += 1;
        } else {
          returningCount += 1;
        }
      }
      return { label: b.label, date: b.start, newCount, returningCount };
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('getNewVsReturningTrend 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface VipConversionResult extends TrendResult {
  totalVipCount: number;
}

/**
 * 일별/주별/월별 VIP 전환(해율 VIP 등급 선물 발급) 수 추이.
 */
export async function getVipConversionTrend(
  period: StatsPeriod,
  dateFrom?: string,
  dateTo?: string
): Promise<ApiResponse<VipConversionResult>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const vipMinVisits = getAllTiers().at(-1)?.minVisits ?? 30;

    const [{ data: vipReward }, { count: totalVipCount }] = await Promise.all([
      supabase
        .from('rewards')
        .select('id')
        .eq('required_visits', vipMinVisits)
        .eq('is_active', true)
        .maybeSingle(),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true)
        .gte('visit_count', vipMinVisits),
    ]);

    const buckets = getDateBuckets(period, dateFrom, dateTo);

    if (!vipReward) {
      return {
        success: true,
        data: {
          points: buckets.map((b) => ({ label: b.label, date: b.start, count: 0 })),
          total: 0,
          previousTotal: 0,
          average: 0,
          totalVipCount: totalVipCount || 0,
        },
      };
    }

    const overallStart = buckets[0].start;
    const overallEnd = buckets[buckets.length - 1].end;
    const prevRange = getPreviousRange(buckets);
    const overallStartTs = `${overallStart}T00:00:00+09:00`;
    const overallEndTs = `${overallEnd}T23:59:59.999+09:00`;
    const prevStartTs = `${prevRange.start}T00:00:00+09:00`;
    const prevEndTs = `${prevRange.end}T23:59:59.999+09:00`;

    const [{ data: current }, { count: previousTotal }] = await Promise.all([
      supabase
        .from('customer_rewards')
        .select('issued_at')
        .eq('reward_id', vipReward.id)
        .gte('issued_at', overallStartTs)
        .lte('issued_at', overallEndTs),
      supabase
        .from('customer_rewards')
        .select('id', { count: 'exact', head: true })
        .eq('reward_id', vipReward.id)
        .gte('issued_at', prevStartTs)
        .lte('issued_at', prevEndTs),
    ]);

    const dates = (current || []).map((r) => toKSTDateString(r.issued_at));
    const points = bucketizeDates(buckets, dates);
    const total = dates.length;

    return {
      success: true,
      data: {
        points,
        total,
        previousTotal: previousTotal || 0,
        average: buckets.length > 0 ? Math.round((total / buckets.length) * 10) / 10 : 0,
        totalVipCount: totalVipCount || 0,
      },
    };
  } catch (error) {
    console.error('getVipConversionTrend 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface LongAbsentBuckets {
  from30to59: number;
  from60to89: number;
  from90plus: number;
}

/**
 * 최근 방문일 기준 장기 미방문 고객을 30~59 / 60~89 / 90일 이상 구간으로 나눠 집계합니다.
 */
export async function getLongAbsentBuckets(): Promise<ApiResponse<LongAbsentBuckets>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const { data: activeCustomers } = await supabase.from('customers').select('id').eq('is_active', true);
    const activeIds = new Set((activeCustomers || []).map((c) => c.id));
    const latestVisitMap = await getLatestVisitDateMap(supabase);

    const todayKST = getTodayKST();
    const cutoff30 = subtractDaysFromDateString(todayKST, 30);
    const cutoff60 = subtractDaysFromDateString(todayKST, 60);
    const cutoff90 = subtractDaysFromDateString(todayKST, 90);

    const result: LongAbsentBuckets = { from30to59: 0, from60to89: 0, from90plus: 0 };

    for (const [customerId, lastVisitDate] of latestVisitMap) {
      if (!activeIds.has(customerId)) continue;
      if (lastVisitDate < cutoff90) {
        result.from90plus += 1;
      } else if (lastVisitDate < cutoff60) {
        result.from60to89 += 1;
      } else if (lastVisitDate < cutoff30) {
        result.from30to59 += 1;
      }
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('getLongAbsentBuckets 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export type LongAbsentBucketKey = 'from30to59' | 'from60to89' | 'from90plus';

export interface LongAbsentCustomerItem {
  customerId: string;
  name: string;
  tierLabel: string;
  visitCount: number;
  recentVisitDate: string | null;
  daysSinceVisit: number;
  availableRewards: number;
}

/**
 * 장기 미방문 구간별 고객 명단. (통계 화면의 드릴다운)
 */
export async function getLongAbsentCustomers(
  bucket: LongAbsentBucketKey
): Promise<ApiResponse<LongAbsentCustomerItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const todayKST = getTodayKST();
    const cutoff30 = subtractDaysFromDateString(todayKST, 30);
    const cutoff60 = subtractDaysFromDateString(todayKST, 60);
    const cutoff90 = subtractDaysFromDateString(todayKST, 90);

    const latestVisitMap = await getLatestVisitDateMap(supabase);

    const matchingIds = [...latestVisitMap.entries()]
      .filter(([, lastDate]) => {
        if (bucket === 'from90plus') return lastDate < cutoff90;
        if (bucket === 'from60to89') return lastDate < cutoff60 && lastDate >= cutoff90;
        return lastDate < cutoff30 && lastDate >= cutoff60;
      })
      .map(([customerId]) => customerId);

    if (matchingIds.length === 0) {
      return { success: true, data: [] };
    }

    const [{ data: customers }, { data: rewards }] = await Promise.all([
      supabase
        .from('customers')
        .select('id, name, visit_count')
        .eq('is_active', true)
        .in('id', matchingIds),
      supabase.from('customer_rewards').select('customer_id, status').in('customer_id', matchingIds).neq('status', 'used'),
    ]);

    const availableRewardsMap = new Map<string, number>();
    for (const r of rewards || []) {
      availableRewardsMap.set(r.customer_id, (availableRewardsMap.get(r.customer_id) || 0) + 1);
    }

    const result: LongAbsentCustomerItem[] = (customers || []).map((c) => {
      const lastVisit = latestVisitMap.get(c.id) || null;
      return {
        customerId: c.id,
        name: c.name,
        tierLabel: getVisitTierInfo(c.visit_count).label,
        visitCount: c.visit_count,
        recentVisitDate: lastVisit,
        daysSinceVisit: lastVisit ? daysBetweenDateStrings(lastVisit, todayKST) : 0,
        availableRewards: availableRewardsMap.get(c.id) || 0,
      };
    });

    result.sort((a, b) => b.daysSinceVisit - a.daysSinceVisit);

    return { success: true, data: result };
  } catch (error) {
    console.error('getLongAbsentCustomers 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 문자 발송
// ============================================================

export interface SmsSendResult {
  successCount: number;
  errorCount: number;
  /** 광고 발송 시 마케팅 수신동의를 하지 않아 대상에서 제외된 인원 수 */
  excludedCount: number;
}

/**
 * 선택한 고객들에게 문자를 발송합니다.
 * messageType이 'ad'(광고)이면 문구 앞에 "(광고)", 끝에 무료수신거부 안내를 자동으로 붙이고,
 * marketing_consent가 false인 고객은 발송 대상에서 자동 제외합니다.
 */
export async function sendSmsToCustomers(
  customerIds: string[],
  message: string,
  messageType: 'info' | 'ad'
): Promise<ApiResponse<SmsSendResult>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const trimmedMessage = message.trim();
    if (!trimmedMessage) {
      return { success: false, error: '문자 내용을 입력해 주세요.' };
    }
    if (!customerIds || customerIds.length === 0) {
      return { success: false, error: '받는 사람을 선택해 주세요.' };
    }
    if (customerIds.length > 1000) {
      return { success: false, error: '한 번에 최대 1,000명까지 발송할 수 있습니다.' };
    }

    const supabase = createAdminClient();
    const { data: customers, error } = await supabase
      .from('customers')
      .select('id, phone, marketing_consent')
      .in('id', customerIds)
      .eq('is_active', true);

    if (error || !customers) {
      return { success: false, error: '고객 정보를 불러올 수 없습니다.' };
    }

    let targets = customers;
    let excludedCount = 0;
    if (messageType === 'ad') {
      targets = customers.filter((c) => c.marketing_consent);
      excludedCount = customers.length - targets.length;
    }

    const validTargets = targets.filter((c) => isValidPhone(c.phone));
    if (validTargets.length === 0) {
      return {
        success: false,
        error:
          messageType === 'ad'
            ? '발송 가능한 대상이 없습니다. (마케팅 수신동의 고객이 없습니다)'
            : '발송 가능한 대상이 없습니다.',
      };
    }

    const finalMessage =
      messageType === 'ad'
        ? `(광고) ${trimmedMessage}\n무료수신거부 ${normalizePhone(process.env.ALIGO_SENDER || '')}`
        : trimmedMessage;

    const receivers = validTargets.map((c) => c.phone.replace(/\D/g, ''));

    let sendResult;
    try {
      sendResult = await sendSms({ receivers, message: finalMessage });
    } catch (smsError) {
      console.error('sendSms 오류:', smsError);
      return {
        success: false,
        error: smsError instanceof Error ? smsError.message : '문자 발송에 실패했습니다.',
      };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.SMS_SEND,
      target_type: 'customers',
      target_id: null,
      before_data: null,
      after_data: {
        messageType,
        requestedCount: customerIds.length,
        excludedCount,
        successCount: sendResult.successCount,
        errorCount: sendResult.errorCount,
        message: finalMessage,
      },
    });

    return {
      success: true,
      data: {
        successCount: sendResult.successCount,
        errorCount: sendResult.errorCount,
        excludedCount,
      },
    };
  } catch (error) {
    console.error('sendSmsToCustomers 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}
