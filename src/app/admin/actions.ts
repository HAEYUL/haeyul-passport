'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import {
  getTodayKST,
  getTodayKSTRange,
  subtractDaysFromDateString,
  getDateBuckets,
  daysBetweenDateStrings,
  normalizePhone,
  isValidPhone,
  type StatsPeriod,
  type DateBucket,
} from '@/lib/utils';
import { AUDIT_ACTION, SUSPICIOUS_ACTIVITY_TYPE_LABELS, ALL_STORES_CODES } from '@/lib/constants';
import { getAllTiers, getVisitTierInfo, type VisitTierKey } from '@/lib/tiers';
import { REFERRAL_SOURCE_OPTIONS, getReferralSourceLabel, type ReferralSourceKey } from '@/lib/referralSource';
import { getOrCreateStoreQrSettings, reissueStoreQrToken } from '@/lib/qrSettings';
import {
  setAdminSession,
  getAdminSession,
  clearAdminSession,
} from '@/lib/adminSession';
import type { ApiResponse, Customer, RewardStatus, RewardSource, Store, LocationVerifiedStatus, NoticeKind } from '@/types/database';

/**
 * Supabase(PostgREST)는 한 번 요청에 최대 1,000행까지만 돌려줍니다.
 * 행이 많아도 빠짐없이 읽도록 1,000행씩 나눠 끝까지 조회합니다.
 * makeQuery는 매번 새 쿼리를 만들어야 하며, 페이지가 어긋나지 않도록 고유한 정렬(order)을 포함해야 합니다.
 */
const DB_PAGE_SIZE = 1000;
/** 동시에 보내는 요청 수 (너무 많으면 DB에 부담, 너무 적으면 느림) */
const PARALLEL_REQUESTS = 6;
async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>
): Promise<T[]> {
  const all: T[] = [];
  for (let batchStart = 0; ; batchStart += DB_PAGE_SIZE * PARALLEL_REQUESTS) {
    const pages = await Promise.all(
      Array.from({ length: PARALLEL_REQUESTS }, (_, i) => {
        const from = batchStart + i * DB_PAGE_SIZE;
        return makeQuery(from, from + DB_PAGE_SIZE - 1);
      })
    );
    for (const { data, error } of pages) {
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < DB_PAGE_SIZE) return all;
    }
  }
}

/**
 * id 목록으로 in() 조회할 때 한 번에 넣는 개수.
 * 수천 개를 한 번에 넣으면 요청 주소가 너무 길어져 실패하므로 나눠서 조회합니다.
 */
const ID_CHUNK_SIZE = 200;
function chunkIds(ids: string[], size: number = ID_CHUNK_SIZE): string[][] {
  const chunks: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    chunks.push(ids.slice(i, i + size));
  }
  return chunks;
}

/**
 * id 목록을 나눠(기본 200개씩) 조회한 결과를 합칩니다. (id가 많아 요청 주소가 길어지는 문제 방지)
 * 한 id당 여러 행이 나올 수 있는 조회는 chunkSize를 줄여 한 번에 1,000행을 넘지 않게 합니다.
 */
async function fetchByIdChunks<T>(
  ids: string[],
  makeQuery: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: unknown }>,
  chunkSize: number = ID_CHUNK_SIZE
): Promise<T[]> {
  const all: T[] = [];
  const chunks = chunkIds([...new Set(ids)], chunkSize);
  for (let i = 0; i < chunks.length; i += PARALLEL_REQUESTS) {
    const results = await Promise.all(chunks.slice(i, i + PARALLEL_REQUESTS).map((chunk) => makeQuery(chunk)));
    for (const { data, error } of results) {
      if (error) throw error;
      all.push(...(data || []));
    }
  }
  return all;
}

/**
 * "customer_id -> 최근 방문일(visit_date)" 맵을 만듭니다. (DB 함수 admin_customer_last_visits에서 계산)
 * - customerIds: 이 고객들만 (없으면 전체)
 * - before / onOrAfter: 최근 방문일이 이 범위에 드는 고객만
 * 대시보드의 장기 미방문 집계와 고객 목록에서 함께 사용합니다.
 */
async function getLatestVisitDateMap(
  supabase: ReturnType<typeof createAdminClient>,
  customerIds?: string[],
  range: { before?: string; onOrAfter?: string } = {}
): Promise<Map<string, string>> {
  if (customerIds && customerIds.length === 0) return new Map();
  // 결과를 JSON 하나로 받아 1,000행 제한 없이 한 번에 가져옵니다.
  const { data, error } = await supabase.rpc('admin_customer_last_visits', {
    p_customer_ids: customerIds ?? null,
    p_before: range.before ?? null,
    p_on_or_after: range.onOrAfter ?? null,
  });
  if (error) throw error;
  return new Map(Object.entries((data as Record<string, string> | null) ?? {}));
}

interface AllStoresVisitInfo {
  /** 세 매장 완주 대상 매장 (ALL_STORES_CODES 순서) */
  stores: { id: string; name: string }[];
  /** 고객 ID → 취소되지 않은 방문으로 다녀간 대상 매장 ID 집합 */
  visitedByCustomer: Map<string, Set<string>>;
}

/** 세 매장 완주 대상 매장 (ALL_STORES_CODES 순서) */
async function getAllStoresTargets(
  supabase: ReturnType<typeof createAdminClient>
): Promise<{ id: string; name: string }[]> {
  const { data: storeRows } = await supabase
    .from('stores')
    .select('id, name, store_code')
    .in('store_code', [...ALL_STORES_CODES]);
  return ALL_STORES_CODES.flatMap((code) => {
    const row = (storeRows || []).find((st) => st.store_code === code);
    return row ? [{ id: row.id, name: row.name }] : [];
  });
}

/**
 * 세 매장 완주 여부 판단용 — 고객별로 다녀간 대상 매장을 모읍니다. (DB 함수 admin_customer_store_sets)
 * 발급·회수 기준(DB 트리거 sync_all_stores_coupon)과 같은 조건(취소되지 않은 방문)을 씁니다.
 */
async function getAllStoresVisitInfo(
  supabase: ReturnType<typeof createAdminClient>,
  customerIds?: string[]
): Promise<AllStoresVisitInfo> {
  const stores = await getAllStoresTargets(supabase);
  const visitedByCustomer = new Map<string, Set<string>>();
  if (stores.length === 0 || (customerIds && customerIds.length === 0)) {
    return { stores, visitedByCustomer };
  }

  // {고객ID: [매장 번호(1부터)]} JSON 하나로 받아 1,000행 제한 없이 한 번에 가져옵니다.
  const { data, error } = await supabase.rpc('admin_customer_store_sets', {
    p_store_ids: stores.map((st) => st.id),
    p_customer_ids: customerIds ?? null,
  });
  if (error) throw error;
  for (const [customerId, positions] of Object.entries((data as Record<string, number[]> | null) ?? {})) {
    visitedByCustomer.set(customerId, new Set(positions.map((pos) => stores[pos - 1].id)));
  }

  return { stores, visitedByCustomer };
}

/** 한 고객이 취소되지 않은 방문으로 다녀간 세 매장 완주 대상 매장 수 */
async function countVisitedAllStores(
  supabase: ReturnType<typeof createAdminClient>,
  customerId: string
): Promise<number> {
  const { visitedByCustomer } = await getAllStoresVisitInfo(supabase, [customerId]);
  return visitedByCustomer.get(customerId)?.size ?? 0;
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

/**
 * 관리자 비밀번호 변경 — 현재 비밀번호 확인 후에만 교체합니다.
 * 해시 생성은 DB(set_admin_password, pgcrypto)에서만 이뤄집니다.
 */
export async function changeAdminPassword(
  currentPassword: string,
  newPassword: string
): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    if (!currentPassword || !newPassword) {
      return { success: false, error: '현재 비밀번호와 새 비밀번호를 모두 입력해 주세요.' };
    }

    if (newPassword.length < 8) {
      return { success: false, error: '새 비밀번호는 8자 이상이어야 합니다.' };
    }

    const supabase = createAdminClient();

    const { data: changed, error } = await supabase.rpc('set_admin_password', {
      p_admin_id: admin.adminId,
      p_current_password: currentPassword,
      p_new_password: newPassword,
    });

    if (error) {
      console.error('changeAdminPassword 오류:', error);
      return { success: false, error: '서버 오류가 발생했습니다.' };
    }

    if (!changed) {
      return { success: false, error: '현재 비밀번호가 일치하지 않습니다.' };
    }

    return { success: true };
  } catch (error) {
    console.error('changeAdminPassword 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
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
  monthlyIssuedRewards: number;
  monthlyUsedRewards: number;
  /** 세 매장을 모두 방문한 고객 수 */
  allStoresCompletedCount: number;
  /** 세 매장 중 한 곳만 남은 고객 수 */
  oneStoreLeftCount: number;
}

export async function getDashboardStats(storeId?: string | null): Promise<ApiResponse<DashboardStats>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const todayKST = getTodayKST();
    // 이번 달 1일 0시(한국시간). 날짜만 쓰면 UTC 0시(한국 오전 9시)로 해석돼 1일 새벽 기록이 빠집니다.
    const monthStart = `${todayKST.slice(0, 7)}-01T00:00:00+09:00`;
    const { start: todayStart, end: todayEnd } = getTodayKSTRange();
    const vipMinVisits = getAllTiers().at(-1)?.minVisits ?? 30;

    let customersBase = supabase.from('customers').select('id', { count: 'exact', head: true }).eq('is_active', true);
    let visitsBase = supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('visit_date', todayKST)
      .eq('is_cancelled', false);
    // 실물 선물(구 방식, reward_rule_id가 NULL) 기록은 더 이상 발급되지 않으므로
    // 할인권(reward_rule 기반) 기록만 집계합니다 — 선물관리 화면과 집계 기준을 통일합니다.
    let unclaimedRewardsBase = supabase
      .from('customer_rewards')
      .select('id', { count: 'exact', head: true })
      .neq('status', 'used')
      .not('reward_rule_id', 'is', null);
    let newCustomersBase = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('created_at', monthStart);
    let todayRewardsUsedBase = supabase
      .from('customer_rewards')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'used')
      .not('reward_rule_id', 'is', null)
      .gte('used_at', todayStart)
      .lt('used_at', todayEnd);
    let vipCountBase = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('visit_count', vipMinVisits);
    let monthlyIssuedBase = supabase
      .from('customer_rewards')
      .select('id', { count: 'exact', head: true })
      .not('reward_rule_id', 'is', null)
      .gte('issued_at', monthStart);
    let monthlyUsedBase = supabase
      .from('customer_rewards')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'used')
      .not('reward_rule_id', 'is', null)
      .gte('used_at', monthStart);

    if (storeId) {
      customersBase = customersBase.eq('signup_store_id', storeId);
      visitsBase = visitsBase.eq('store_id', storeId);
      unclaimedRewardsBase = unclaimedRewardsBase.eq('issued_store_id', storeId);
      newCustomersBase = newCustomersBase.eq('signup_store_id', storeId);
      todayRewardsUsedBase = todayRewardsUsedBase.eq('used_store_id', storeId);
      vipCountBase = vipCountBase.eq('signup_store_id', storeId);
      monthlyIssuedBase = monthlyIssuedBase.eq('issued_store_id', storeId);
      monthlyUsedBase = monthlyUsedBase.eq('used_store_id', storeId);
    }

    const [
      { count: totalCustomers },
      { count: todayVisits },
      { count: unclaimedRewards },
      { count: newCustomersThisMonth },
      { count: todayRewardsUsed },
      { count: vipCount },
      { data: absentRows, error: absentError },
      { count: monthlyIssuedRewards },
      { count: monthlyUsedRewards },
      allStoresTargets,
    ] = await Promise.all([
      customersBase,
      visitsBase,
      unclaimedRewardsBase,
      newCustomersBase,
      todayRewardsUsedBase,
      vipCountBase,
      // 장기 미방문(기본 30일 이상) = 30~59 + 60~89 + 90일 이상 구간 합계
      supabase.rpc('admin_long_absent_counts', { p_today: todayKST, p_store_id: storeId ?? null }),
      monthlyIssuedBase,
      monthlyUsedBase,
      getAllStoresTargets(supabase),
    ]);
    if (absentError) throw absentError;
    const absent = (absentRows as { from30to59: number; from60to89: number; from90plus: number }[] | null)?.[0];
    // 구간이 30일부터 시작하므로 DEFAULT_LONG_ABSENT_DAYS(30일) 이상 미방문 인원과 같습니다.
    const longAbsentCount = absent
      ? Number(absent.from30to59) + Number(absent.from60to89) + Number(absent.from90plus)
      : 0;

    const { data: allStoresRows, error: allStoresError } = await supabase.rpc('admin_all_stores_counts', {
      p_store_ids: allStoresTargets.map((st) => st.id),
      p_store_id: storeId ?? null,
    });
    if (allStoresError) throw allStoresError;
    const allStoresCounts = (allStoresRows as { completed: number; one_left: number }[] | null)?.[0];
    const allStoresCompletedCount = Number(allStoresCounts?.completed ?? 0);
    const oneStoreLeftCount = Number(allStoresCounts?.one_left ?? 0);

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
        monthlyIssuedRewards: monthlyIssuedRewards || 0,
        monthlyUsedRewards: monthlyUsedRewards || 0,
        allStoresCompletedCount,
        oneStoreLeftCount,
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
  ruleId: string;
  thresholdVisits: number;
  amount: number;
  isRepeating: boolean;
  repeatInterval: number | null;
  totalIssued: number;
  totalUsed: number;
  totalUnused: number;
}

/**
 * reward_rules(할인권 규칙)별 발급/사용 집계. 반복 규칙(예: 해율VIP 5회마다)은
 * 실제로 발급된 모든 회차(30회, 35회, 40회...)를 하나의 규칙 행으로 합산합니다.
 *
 * 규칙이 개편되어도(예: 기존 규칙 비활성화 + 새 규칙 추가) 이미 발급된 할인권이
 * 통계에서 빠지지 않도록, customer_rewards.reward_rule_id(발급 당시 연결된 규칙 행)가
 * 아니라 실제 달성한 방문 횟수(threshold_visits)를 지금의 활성 규칙과 매칭합니다.
 */
export async function getRewardStats(storeId?: string | null): Promise<ApiResponse<RewardStatItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: rules, error: rulesError } = await supabase
      .from('reward_rules')
      .select('id, threshold_visits, amount, is_repeating, repeat_interval')
      .eq('is_active', true)
      .eq('is_birthday', false)
      .eq('is_comeback', false)
      .eq('is_all_stores', false)
      .order('threshold_visits', { ascending: true });

    if (rulesError) {
      return { success: false, error: '할인권 규칙 조회 중 오류가 발생했습니다.' };
    }

    // 달성 횟수·상태별 건수만 DB에서 받아옵니다 (admin_reward_threshold_counts)
    const { data: customerRewards, error: crError } = await supabase.rpc('admin_reward_threshold_counts', {
      p_store_id: storeId ?? null,
    });

    if (crError) {
      return { success: false, error: '할인권 발급 현황 조회 중 오류가 발생했습니다.' };
    }

    const activeRules = rules || [];
    const statsMap = new Map<string, RewardStatItem>(
      activeRules.map((r) => [
        r.id,
        {
          ruleId: r.id,
          thresholdVisits: r.threshold_visits,
          amount: r.amount,
          isRepeating: r.is_repeating,
          repeatInterval: r.repeat_interval,
          totalIssued: 0,
          totalUsed: 0,
          totalUnused: 0,
        },
      ])
    );

    // 비반복 규칙은 방문 횟수가 정확히 일치할 때, 반복 규칙은 기준 횟수 이상이면서
    // 주기의 배수만큼 지났을 때 매칭됩니다.
    function findMatchingRule(thresholdVisits: number | null) {
      if (thresholdVisits == null) return undefined;
      const exact = activeRules.find((r) => !r.is_repeating && r.threshold_visits === thresholdVisits);
      if (exact) return exact;
      return activeRules.find(
        (r) =>
          r.is_repeating &&
          r.repeat_interval &&
          thresholdVisits >= r.threshold_visits &&
          (thresholdVisits - r.threshold_visits) % r.repeat_interval === 0
      );
    }

    for (const cr of (customerRewards || []) as { threshold_visits: number | null; status: string; cnt: number }[]) {
      const rule = findMatchingRule(cr.threshold_visits);
      const stat = rule ? statsMap.get(rule.id) : undefined;
      if (!stat) continue;
      const cnt = Number(cr.cnt);
      stat.totalIssued += cnt;
      if (cr.status === 'used') {
        stat.totalUsed += cnt;
      } else {
        stat.totalUnused += cnt;
      }
    }

    return { success: true, data: Array.from(statsMap.values()) };
  } catch (error) {
    console.error('getRewardStats 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface RewardAmountBreakdownItem {
  amount: number;
  source: RewardSource;
  count: number;
}

export interface RewardAmountByStoreItem {
  storeId: string;
  storeName: string;
  issuedAmount: number;
  issuedCount: number;
  usedAmount: number;
  usedCount: number;
  /** 사용된 할인권을 금액×종류별로 쪼갠 상세 (금액 오름차순) */
  usedBreakdown: RewardAmountBreakdownItem[];
}

/**
 * 매장별 할인권 발급/사용 금액 집계. 건수가 아니라 실제 나간/받은 금액이
 * 얼마인지가 매장 입장에서 더 중요한 지표라 별도로 제공합니다.
 * 생일축하 쿠폰은 특정 매장 없이 발급되므로 "생일쿠폰(매장무관)" 행으로
 * 따로 보여주고, 사용될 때는 실제로 사용된 매장의 사용 금액에 포함됩니다.
 */
export async function getRewardAmountByStore(
  dateFrom: string,
  dateTo: string
): Promise<ApiResponse<RewardAmountByStoreItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name')
      .eq('is_active', true);

    if (storesError) {
      return { success: false, error: '매장 목록 조회 중 오류가 발생했습니다.' };
    }

    const fromISO = `${dateFrom}T00:00:00+09:00`;
    const toISO = `${dateTo}T23:59:59+09:00`;

    // 매장·종류(·금액)별 합계만 DB에서 받아옵니다
    const issuedQuery = supabase.rpc('admin_reward_issued_summary', { p_from: fromISO, p_to: toISO });
    const usedQuery = supabase.rpc('admin_reward_used_summary', { p_from: fromISO, p_to: toISO, p_store_id: null });

    const [{ data: issuedRows, error: issuedError }, { data: usedRows, error: usedError }] = await Promise.all([
      issuedQuery,
      usedQuery,
    ]);

    if (issuedError || usedError) {
      return { success: false, error: '집계 중 오류가 발생했습니다.' };
    }

    const issuedMap = new Map<string, { amount: number; count: number }>();
    // 생일·컴백 쿠폰은 특정 매장 없이 발급되므로 source별로 따로 집계합니다.
    const noStoreIssuedMap = new Map<string, { amount: number; count: number }>();
    type IssuedRow = { issued_store_id: string | null; source: string | null; amount_sum: number; cnt: number };
    for (const r of (issuedRows || []) as IssuedRow[]) {
      const target = r.issued_store_id ? issuedMap : noStoreIssuedMap;
      const key = r.issued_store_id ?? r.source ?? 'birthday';
      const cur = target.get(key) || { amount: 0, count: 0 };
      cur.amount += Number(r.amount_sum);
      cur.count += Number(r.cnt);
      target.set(key, cur);
    }

    const usedMap = new Map<string, { amount: number; count: number }>();
    const usedBreakdownMap = new Map<string, Map<string, RewardAmountBreakdownItem>>();
    type UsedRow = { used_store_id: string; amount: number; source: string | null; cnt: number };
    for (const r of (usedRows || []) as UsedRow[]) {
      const amount = Number(r.amount);
      const cnt = Number(r.cnt);
      const cur = usedMap.get(r.used_store_id) || { amount: 0, count: 0 };
      cur.amount += amount * cnt;
      cur.count += cnt;
      usedMap.set(r.used_store_id, cur);

      const source = (r.source as RewardSource) ?? 'visit';
      const breakdownKey = `${amount}_${source}`;
      const storeBreakdown = usedBreakdownMap.get(r.used_store_id) || new Map();
      const item = storeBreakdown.get(breakdownKey) || { amount, source, count: 0 };
      item.count += cnt;
      storeBreakdown.set(breakdownKey, item);
      usedBreakdownMap.set(r.used_store_id, storeBreakdown);
    }

    const result: RewardAmountByStoreItem[] = (stores || []).map((s) => ({
      storeId: s.id,
      storeName: s.name,
      issuedAmount: issuedMap.get(s.id)?.amount ?? 0,
      issuedCount: issuedMap.get(s.id)?.count ?? 0,
      usedAmount: usedMap.get(s.id)?.amount ?? 0,
      usedCount: usedMap.get(s.id)?.count ?? 0,
      usedBreakdown: [...(usedBreakdownMap.get(s.id)?.values() ?? [])].sort((a, b) => a.amount - b.amount),
    }));

    const noStoreLabels: Record<string, string> = {
      birthday: '생일쿠폰(매장무관 발급)',
      comeback: '컴백쿠폰(매장무관 발급)',
    };
    for (const [source, agg] of noStoreIssuedMap) {
      result.push({
        storeId: source,
        storeName: noStoreLabels[source] ?? `${source}(매장무관 발급)`,
        issuedAmount: agg.amount,
        issuedCount: agg.count,
        usedAmount: 0,
        usedCount: 0,
        usedBreakdown: [],
      });
    }

    return { success: true, data: result };
  } catch (error) {
    console.error('getRewardAmountByStore 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface RewardUsageAmountRow {
  amount: number;
  count: number;
}

export interface StoreRewardUsageSummary {
  storeId: string;
  storeName: string;
  totalCount: number;
  totalAmount: number;
  /** amounts와 같은 순서로 정렬된 금액별 사용 수량 (POS 매장별 대사용) */
  byAmount: RewardUsageAmountRow[];
}

export interface RewardUsageByPeriodResult {
  /** 선택된 기간·매장 범위 안에서 실제로 사용된 금액대 목록 (오름차순) */
  amounts: number[];
  stores: StoreRewardUsageSummary[];
}

/**
 * 매장 POS의 할인 기록과 대조하기 위한 "기간별·매장별·금액별 할인권 사용 수량" 집계.
 * 발급종류(방문/생일/컴백) 구분 없이 금액 기준으로 합산하고, 발급일이 아니라
 * 실제로 손님이 할인받은 "사용일(used_at)" 기준으로 기간을 필터링합니다
 * — POS에는 사용 시점 기준으로만 기록이 남기 때문입니다.
 */
export async function getRewardUsageByPeriod(
  dateFrom: string,
  dateTo: string,
  storeId?: string | null
): Promise<ApiResponse<RewardUsageByPeriodResult>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: stores, error: storesError } = await supabase
      .from('stores')
      .select('id, name')
      .eq('is_active', true);

    if (storesError) {
      return { success: false, error: '매장 목록 조회 중 오류가 발생했습니다.' };
    }

    const fromISO = `${dateFrom}T00:00:00+09:00`;
    const toISO = `${dateTo}T23:59:59.999+09:00`;

    // 매장·금액별 사용 건수만 DB에서 받아옵니다 (종류 구분 없이 금액 기준으로 합산)
    const { data: usedRows, error: usedError } = await supabase.rpc('admin_reward_used_summary', {
      p_from: fromISO,
      p_to: toISO,
      p_store_id: storeId ?? null,
    });

    if (usedError) {
      return { success: false, error: '집계 중 오류가 발생했습니다.' };
    }

    const byStoreAmount = new Map<string, Map<number, number>>();
    const amountSet = new Set<number>();
    for (const r of (usedRows || []) as { used_store_id: string; amount: number; cnt: number }[]) {
      const amount = Number(r.amount);
      amountSet.add(amount);
      const storeMap = byStoreAmount.get(r.used_store_id) || new Map<number, number>();
      storeMap.set(amount, (storeMap.get(amount) || 0) + Number(r.cnt));
      byStoreAmount.set(r.used_store_id, storeMap);
    }

    const amounts = [...amountSet].sort((a, b) => a - b);
    const relevantStores = storeId ? (stores || []).filter((s) => s.id === storeId) : stores || [];

    const storeSummaries: StoreRewardUsageSummary[] = relevantStores.map((s) => {
      const storeMap = byStoreAmount.get(s.id) || new Map<number, number>();
      const byAmount = amounts.map((amount) => ({ amount, count: storeMap.get(amount) || 0 }));
      const totalCount = byAmount.reduce((sum, r) => sum + r.count, 0);
      const totalAmount = byAmount.reduce((sum, r) => sum + r.amount * r.count, 0);
      return { storeId: s.id, storeName: s.name, totalCount, totalAmount, byAmount };
    });

    return { success: true, data: { amounts, stores: storeSummaries } };
  } catch (error) {
    console.error('getRewardUsageByPeriod 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface RewardUsageItem {
  id: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  amount: number;
  thresholdVisits: number;
  source: RewardSource;
  issuedAt: string;
  usedAt: string | null;
  issuedStoreName: string;
  usedStoreName: string | null;
}

export interface RewardCustomerItem {
  id: string;
  customerId: string;
  customerName: string;
  customerNumber: string;
  phone: string;
  amount: number;
  thresholdVisits: number;
  status: RewardStatus;
  issuedAt: string;
  usedAt: string | null;
  issuedStoreName: string;
  usedStoreName: string | null;
}

export async function getRewardCustomerList({
  kind,
  storeId,
  ruleThresholdVisits,
  amount,
  isRepeating,
  repeatInterval,
}: {
  kind: 'issued' | 'used' | 'unused';
  storeId?: string | null;
  ruleThresholdVisits?: number;
  amount?: number;
  isRepeating?: boolean;
  repeatInterval?: number | null;
}): Promise<ApiResponse<RewardCustomerItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    let request = supabase
      .from('customer_rewards')
      .select('id, customer_id, amount, threshold_visits, status, issued_at, used_at, issued_store_id, used_store_id')
      .not('reward_rule_id', 'is', null)
      .order('issued_at', { ascending: false })
      .limit(300);

    if (kind === 'used') {
      request = request.eq('status', 'used');
    } else if (kind === 'unused') {
      request = request.neq('status', 'used');
    }

    if (storeId) {
      request = request.eq('issued_store_id', storeId);
    }

    if (ruleThresholdVisits != null) {
      if (isRepeating && repeatInterval) {
        request = request.gte('threshold_visits', ruleThresholdVisits);
      } else {
        request = request.eq('threshold_visits', ruleThresholdVisits);
      }
    }

    if (amount != null) {
      request = request.eq('amount', amount);
    }

    const { data: rewards, error } = await request;
    if (error || !rewards || rewards.length === 0) {
      return { success: true, data: [] };
    }

    const customerIds = [...new Set(rewards.map((r) => r.customer_id))];
    const storeIds = [
      ...new Set([
        ...rewards.map((r) => r.issued_store_id),
        ...rewards.map((r) => r.used_store_id).filter((id): id is string => !!id),
      ]),
    ];

    const [customers, { data: stores }] = await Promise.all([
      fetchByIdChunks<{ id: string; name: string; customer_number: string; phone: string }>(customerIds, (ids) =>
        supabase.from('customers').select('id, name, customer_number, phone').in('id', ids)
      ),
      supabase.from('stores').select('id, name').in('id', storeIds),
    ]);

    const customerMap = new Map((customers || []).map((c) => [c.id, c]));
    const storeMap = new Map((stores || []).map((s) => [s.id, s.name]));

    return {
      success: true,
      data: rewards.map((reward) => {
        const customer = customerMap.get(reward.customer_id);
        return {
          id: reward.id,
          customerId: reward.customer_id,
          customerName: customer?.name || '알 수 없음',
          customerNumber: customer?.customer_number || '-',
          phone: customer?.phone || '-',
          amount: reward.amount ?? 0,
          thresholdVisits: reward.threshold_visits ?? 0,
          status: reward.status,
          issuedAt: reward.issued_at,
          usedAt: reward.used_at,
          issuedStoreName: storeMap.get(reward.issued_store_id) || '-',
          usedStoreName: reward.used_store_id ? storeMap.get(reward.used_store_id) || '-' : null,
        };
      }),
    };
  } catch (error) {
    console.error('getRewardCustomerList 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

async function fetchRewardUsage(
  supabase: ReturnType<typeof createAdminClient>,
  statusFilter: 'available' | 'used',
  storeId?: string | null
): Promise<RewardUsageItem[]> {
  let request = supabase
    .from('customer_rewards')
    .select('id, customer_id, threshold_visits, amount, source, issued_at, used_at, status, issued_store_id, used_store_id')
    .not('reward_rule_id', 'is', null)
    .order(statusFilter === 'used' ? 'used_at' : 'issued_at', { ascending: false })
    .limit(300);

  request = statusFilter === 'used' ? request.eq('status', 'used') : request.neq('status', 'used');
  if (storeId) {
    request = request.eq('issued_store_id', storeId);
  }

  const { data: crs, error } = await request;
  if (error || !crs || crs.length === 0) {
    return [];
  }

  const customerIds = [...new Set(crs.map((c) => c.customer_id))];
  const storeIds = [
    ...new Set([
      ...crs.map((c) => c.issued_store_id),
      ...crs.map((c) => c.used_store_id).filter((id): id is string => !!id),
    ]),
  ];

  const [customers, { data: stores }] = await Promise.all([
    fetchByIdChunks<{ id: string; name: string; customer_number: string }>(customerIds, (ids) =>
      supabase.from('customers').select('id, name, customer_number').in('id', ids)
    ),
    supabase.from('stores').select('id, name').in('id', storeIds),
  ]);

  const customerMap = new Map((customers || []).map((c) => [c.id, c]));
  const storeMap = new Map((stores || []).map((s) => [s.id, s.name]));

  return crs.map((cr) => {
    const c = customerMap.get(cr.customer_id);
    return {
      id: cr.id,
      customerId: cr.customer_id,
      customerName: c?.name || '알 수 없음',
      customerNumber: c?.customer_number || '-',
      amount: cr.amount ?? 0,
      thresholdVisits: cr.threshold_visits ?? 0,
      source: (cr.source as RewardSource) ?? 'visit',
      issuedAt: cr.issued_at,
      usedAt: cr.used_at,
      issuedStoreName: storeMap.get(cr.issued_store_id) || '-',
      usedStoreName: cr.used_store_id ? storeMap.get(cr.used_store_id) || '-' : null,
    };
  });
}

/**
 * 아직 사용하지 않은(available/requested) 할인권 목록
 */
export async function getAvailableRewards(storeId?: string | null): Promise<ApiResponse<RewardUsageItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const data = await fetchRewardUsage(supabase, 'available', storeId);
    return { success: true, data };
  } catch (error) {
    console.error('getAvailableRewards 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 사용 완료된 할인권 목록
 */
export async function getUsedRewards(storeId?: string | null): Promise<ApiResponse<RewardUsageItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const data = await fetchRewardUsage(supabase, 'used', storeId);
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
      return { success: false, error: '할인권 정보를 찾을 수 없습니다.' };
    }

    if (before.status !== 'used') {
      return { success: false, error: '사용된 할인권만 복원할 수 있습니다.' };
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

export interface RewardRuleAdminItem {
  id: string;
  thresholdVisits: number;
  amount: number;
  isRepeating: boolean;
  repeatInterval: number | null;
  isActive: boolean;
}

/**
 * 할인권 규칙(방문 횟수 → 금액) 관리 화면용 목록. 비활성(삭제)된 규칙도 포함합니다.
 */
export async function getRewardRules(): Promise<ApiResponse<RewardRuleAdminItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('reward_rules')
      .select('id, threshold_visits, amount, is_repeating, repeat_interval, is_active')
      .eq('is_birthday', false)
      .eq('is_comeback', false)
      .eq('is_all_stores', false)
      .order('threshold_visits', { ascending: true });

    if (error) {
      return { success: false, error: '할인권 규칙 조회 중 오류가 발생했습니다.' };
    }

    return {
      success: true,
      data: (data || []).map((r) => ({
        id: r.id,
        thresholdVisits: r.threshold_visits,
        amount: r.amount,
        isRepeating: r.is_repeating,
        repeatInterval: r.repeat_interval,
        isActive: r.is_active,
      })),
    };
  } catch (error) {
    console.error('getRewardRules 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface RewardRuleInput {
  thresholdVisits: number;
  amount: number;
  isRepeating: boolean;
  repeatInterval: number | null;
}

function validateRewardRuleInput(input: RewardRuleInput): string | null {
  if (!Number.isInteger(input.thresholdVisits) || input.thresholdVisits <= 0) {
    return '기준 방문 횟수를 올바르게 입력해 주세요.';
  }
  if (!Number.isInteger(input.amount) || input.amount <= 0) {
    return '할인 금액을 올바르게 입력해 주세요.';
  }
  if (input.isRepeating && (!Number.isInteger(input.repeatInterval) || (input.repeatInterval ?? 0) <= 0)) {
    return '반복 주기를 올바르게 입력해 주세요.';
  }
  return null;
}

/**
 * 새 할인권 규칙을 추가합니다.
 */
export async function createRewardRule(input: RewardRuleInput): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const validationError = validateRewardRuleInput(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const supabase = createAdminClient();

    const { data: after, error: insertError } = await supabase
      .from('reward_rules')
      .insert({
        threshold_visits: input.thresholdVisits,
        amount: input.amount,
        is_repeating: input.isRepeating,
        repeat_interval: input.isRepeating ? input.repeatInterval : null,
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: '할인권 규칙 추가 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.REWARD_RULE_CREATE,
      target_type: 'reward_rule',
      target_id: after.id,
      before_data: null,
      after_data: after,
    });

    return { success: true };
  } catch (error) {
    console.error('createRewardRule 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 기존 할인권 규칙을 수정합니다.
 */
export async function updateRewardRule(
  ruleId: string,
  input: RewardRuleInput
): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const validationError = validateRewardRuleInput(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const supabase = createAdminClient();

    const { data: before } = await supabase.from('reward_rules').select('*').eq('id', ruleId).single();
    if (!before) {
      return { success: false, error: '할인권 규칙을 찾을 수 없습니다.' };
    }

    const { data: after, error: updateError } = await supabase
      .from('reward_rules')
      .update({
        threshold_visits: input.thresholdVisits,
        amount: input.amount,
        is_repeating: input.isRepeating,
        repeat_interval: input.isRepeating ? input.repeatInterval : null,
      })
      .eq('id', ruleId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: '할인권 규칙 수정 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.REWARD_RULE_UPDATE,
      target_type: 'reward_rule',
      target_id: ruleId,
      before_data: before,
      after_data: after,
    });

    return { success: true };
  } catch (error) {
    console.error('updateRewardRule 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 할인권 규칙을 삭제(비활성화)합니다. 이미 발급된 할인권과의 외래키 제약 때문에
 * 실제 DELETE 대신 is_active=false로 처리합니다.
 */
export async function deleteRewardRule(ruleId: string): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: before } = await supabase.from('reward_rules').select('*').eq('id', ruleId).single();
    if (!before) {
      return { success: false, error: '할인권 규칙을 찾을 수 없습니다.' };
    }

    const { data: after, error: updateError } = await supabase
      .from('reward_rules')
      .update({ is_active: false })
      .eq('id', ruleId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: '할인권 규칙 삭제 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.REWARD_RULE_DELETE,
      target_type: 'reward_rule',
      target_id: ruleId,
      before_data: before,
      after_data: after,
    });

    return { success: true };
  } catch (error) {
    console.error('deleteRewardRule 오류:', error);
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
  /** 가입 매장명 */
  signupStoreName: string;
  /** 관리자 메모 */
  adminNote: string | null;
  /** 해율푸드 VIP 등급 선물이 발급된 시점(VIP 달성일). filter='vip'가 아니면 undefined */
  vipAchievedAt?: string | null;
  /** VIP 등급 선물(감사 할인권) 사용 여부. filter='vip'가 아니면 undefined */
  giftUsed?: boolean;
  /** 세 매장 완주 선물 발급일(완주일). filter='allStoresCompleted'가 아니면 undefined */
  allStoresCompletedAt?: string | null;
  /** 세 매장 완주 선물 사용 여부. filter='allStoresCompleted'가 아니면 undefined */
  allStoresGiftUsed?: boolean;
  /** 아직 방문하지 않은 마지막 한 매장 이름. filter='oneStoreLeft'가 아니면 undefined */
  missingStoreName?: string;
}

/**
 * 대시보드 통계 카드에서 넘어오는 고객 목록 필터.
 * - todayVisits: 오늘 방문한 고객
 * - newThisMonth: 이번 달 신규가입 고객
 * - unclaimedRewards: 미사용 선물을 보유한 고객
 * - todayRewardsUsed: 오늘 선물을 사용한 고객
 * - vip: 해율푸드 VIP 등급(최고 등급) 고객
 * - longAbsent: 최근 방문일로부터 일정 기간 이상 방문이 없는 고객
 * - tier: 특정 방문 등급(tierKey)에 해당하는 고객
 * - birthdayThisMonth: 이번 달이 생일인 고객
 * - visitedStore: storeId 매장을 한 번이라도 방문한 고객 (가입 매장과 무관 — 신메뉴 안내 등
 *   특정 매장 방문객 전체에게 안내할 때 사용. storeId가 없으면 빈 목록)
 * - missingBirthDate: 생년월일을 등록하지 않은 고객 (생일쿠폰을 받을 수 없는 고객 — 등록 유도 안내용)
 * - tierUpThisMonth: 이번 달에 등급이 승급(5·10·20·30회 등급 축하 할인권 발급)된 고객
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
  | 'birthdayThisMonth'
  | 'visitedStore'
  | 'missingBirthDate'
  | 'tierUpThisMonth'
  | 'allStoresCompleted'
  | 'oneStoreLeft';

interface CustomerListParams {
  query: string;
  filter: CustomerListFilter;
  longAbsentDays: number;
  tierKey?: VisitTierKey;
  storeId?: string | null;
  marketingConsent?: boolean | null;
}

type CustomerRow = {
  id: string;
  customer_number: string;
  name: string;
  phone: string;
  visit_count: number;
  created_at: string;
  marketing_consent: boolean;
  signup_store_id: string;
  admin_note: string | null;
};

const CUSTOMER_LIST_COLUMNS =
  'id, customer_number, name, phone, visit_count, created_at, marketing_consent, signup_store_id, admin_note';

/**
 * 고객 목록 조건에 맞는 고객을 모읍니다.
 * limit을 주면 화면 표시용으로 그 수만큼만, null이면(엑셀 저장) 조건에 맞는 전체를 돌려줍니다.
 * totalCount는 항상 조건에 맞는 전체 인원입니다.
 */
async function buildCustomerList(
  supabase: ReturnType<typeof createAdminClient>,
  { query, filter, longAbsentDays, tierKey, storeId, marketingConsent }: CustomerListParams,
  limit: number | null
): Promise<{ items: CustomerListItem[]; totalCount: number }> {
  // 장기 미방문 필터는 전체 고객의 최근 방문일이 필요하므로 먼저 구합니다.
  let latestVisitMap: Map<string, string> | null = null;

  // 방문/선물/생일 기준 필터는 대상 고객 ID를 먼저 구한 뒤 customers 테이블에 적용합니다.
  let idFilter: string[] | null = null;
  // 세 매장 완주 관련 필터에서 목록 표시에 다시 쓰기 위해 보관합니다.
  let allStoresInfo: AllStoresVisitInfo | null = null;
  const uniqueIds = (rows: { customer_id: string }[]) => [...new Set(rows.map((r) => r.customer_id))];

  if (filter === 'todayVisits') {
    const today = getTodayKST();
    idFilter = uniqueIds(
      await fetchAllRows<{ customer_id: string }>((from, to) =>
        supabase
          .from('visits')
          .select('customer_id')
          .eq('visit_date', today)
          .eq('is_cancelled', false)
          .order('id', { ascending: true })
          .range(from, to)
      )
    );
  } else if (filter === 'unclaimedRewards') {
    const { data, error } = await supabase.rpc('admin_customers_with_unused_rewards');
    if (error) throw error;
    idFilter = (data as string[] | null) ?? [];
  } else if (filter === 'todayRewardsUsed') {
    const { start, end } = getTodayKSTRange();
    idFilter = uniqueIds(
      await fetchAllRows<{ customer_id: string }>((from, to) =>
        supabase
          .from('customer_rewards')
          .select('customer_id')
          .eq('status', 'used')
          .gte('used_at', start)
          .lt('used_at', end)
          .order('id', { ascending: true })
          .range(from, to)
      )
    );
  } else if (filter === 'longAbsent') {
    const cutoff = subtractDaysFromDateString(getTodayKST(), longAbsentDays);
    latestVisitMap = await getLatestVisitDateMap(supabase, undefined, { before: cutoff });
    idFilter = [...latestVisitMap.keys()];
  } else if (filter === 'birthdayThisMonth') {
    const currentMonth = getTodayKST().slice(5, 7);
    const customers = await fetchAllRows<{ id: string; birth_date: string | null }>((from, to) =>
      supabase
        .from('customers')
        .select('id, birth_date')
        .eq('is_active', true)
        .not('birth_date', 'is', null)
        .order('id', { ascending: true })
        .range(from, to)
    );
    idFilter = customers
      .filter((c) => c.birth_date && c.birth_date.slice(5, 7) === currentMonth)
      .map((c) => c.id);
  } else if (filter === 'visitedStore') {
    if (!storeId) {
      idFilter = [];
    } else {
      // 그 매장을 한 번이라도 방문한 고객 (DB에서 고객별로 묶어서 받아옵니다)
      const { data, error } = await supabase.rpc('admin_customer_store_sets', {
        p_store_ids: [storeId],
        p_customer_ids: null,
      });
      if (error) throw error;
      idFilter = Object.keys((data as Record<string, number[]> | null) ?? {});
    }
  } else if (filter === 'tierUpThisMonth') {
    const monthStart = `${getTodayKST().slice(0, 7)}-01T00:00:00+09:00`;
    const tierUpThresholds = getAllTiers()
      .filter((t) => t.minVisits > 1)
      .map((t) => t.minVisits);
    idFilter = uniqueIds(
      await fetchAllRows<{ customer_id: string }>((from, to) =>
        supabase
          .from('customer_rewards')
          .select('customer_id')
          .in('threshold_visits', tierUpThresholds)
          .not('reward_rule_id', 'is', null)
          .gte('issued_at', monthStart)
          .order('id', { ascending: true })
          .range(from, to)
      )
    );
  } else if (filter === 'allStoresCompleted' || filter === 'oneStoreLeft') {
    const info = await getAllStoresVisitInfo(supabase);
    allStoresInfo = info;
    const totalStores = info.stores.length;
    idFilter = [...info.visitedByCustomer.entries()]
      .filter(([, visited]) => {
        if (filter === 'allStoresCompleted') {
          return totalStores > 0 && visited.size >= totalStores;
        }
        if (visited.size !== totalStores - 1) return false;
        // "한 곳만 남은 고객"에서 매장을 고르면, 그 매장만 남은 고객으로 좁힙니다.
        return !storeId || !visited.has(storeId);
      })
      .map(([customerId]) => customerId);
  }

  if (idFilter && idFilter.length === 0) {
    return { items: [], totalCount: 0 };
  }

  // 등급 필터의 방문 횟수 범위 (알 수 없는 등급이면 빈 목록)
  let tierRange: { min: number; max: number | null } | null = null;
  if (filter === 'tier' && tierKey) {
    const tiers = getAllTiers();
    const index = tiers.findIndex((t) => t.key === tierKey);
    if (index === -1) return { items: [], totalCount: 0 };
    tierRange = { min: tiers[index].minVisits, max: tiers[index + 1]?.minVisits ?? null };
  }

  // idFilter 외의 공통 조건(매장·수신동의·신규·등급·검색어)을 붙인 customers 조회를 만듭니다.
  function customersQuery(withCount = false) {
    let r = supabase
      .from('customers')
      .select(CUSTOMER_LIST_COLUMNS, withCount ? { count: 'exact' } : undefined)
      .eq('is_active', true);
    if (storeId && filter !== 'visitedStore' && filter !== 'oneStoreLeft') {
      r = r.eq('signup_store_id', storeId);
    }
    if (marketingConsent != null) {
      r = r.eq('marketing_consent', marketingConsent);
    }
    if (filter === 'newThisMonth') {
      r = r.gte('created_at', `${getTodayKST().slice(0, 7)}-01T00:00:00+09:00`);
    } else if (filter === 'missingBirthDate') {
      r = r.is('birth_date', null);
    } else if (filter === 'vip') {
      r = r.gte('visit_count', getAllTiers().at(-1)?.minVisits ?? 30);
    } else if (tierRange) {
      r = r.gte('visit_count', tierRange.min);
      if (tierRange.max != null) r = r.lt('visit_count', tierRange.max);
    }
    const trimmed = query.trim();
    if (trimmed) {
      // or() 필터 문법에서 구분자로 쓰이는 문자는 제거해 필터 인젝션을 방지합니다.
      const safe = trimmed.replace(/[,()]/g, '');
      r = r.or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`);
    }
    return r;
  }

  let rows: CustomerRow[] = [];
  let totalCount = 0;

  if (idFilter) {
    // 대상 ID를 200개씩 나눠 조건에 맞는 고객을 모두 모은 뒤 가입일 최신순으로 정렬합니다.
    rows = (await fetchByIdChunks(idFilter, (ids) => customersQuery().in('id', ids))) as CustomerRow[];
    rows.sort((x, y) => y.created_at.localeCompare(x.created_at));
    totalCount = rows.length;
  } else {
    const orderColumn = filter === 'vip' ? 'visit_count' : 'created_at';
    if (limit != null) {
      const { data, error, count } = await customersQuery(true)
        .order(orderColumn, { ascending: false })
        .order('id', { ascending: true })
        .limit(limit);
      if (error) throw error;
      rows = (data || []) as CustomerRow[];
      totalCount = count ?? rows.length;
    } else {
      rows = await fetchAllRows<CustomerRow>((from, to) =>
        customersQuery()
          .order(orderColumn, { ascending: false })
          .order('id', { ascending: true })
          .range(from, to)
      );
      totalCount = rows.length;
    }
  }

  const { data: storeRows } = await supabase.from('stores').select('id, name');
  const storeMap = new Map((storeRows || []).map((s) => [s.id, s.name]));

  // 고객이 많을 때는 id 목록을 보내는 대신(요청이 너무 커짐) 전체 최근 방문일을 한 번에 받습니다.
  const visitMap =
    latestVisitMap ??
    (await getLatestVisitDateMap(supabase, rows.length <= 1000 ? rows.map((c) => c.id) : undefined));

  let result: CustomerListItem[] = rows.map((c) => ({
    id: c.id,
    customerNumber: c.customer_number,
    name: c.name,
    phone: c.phone,
    visitCount: c.visit_count,
    createdAt: c.created_at,
    recentVisitDate: visitMap.get(c.id) ?? null,
    marketingConsent: c.marketing_consent,
    signupStoreName: storeMap.get(c.signup_store_id) || '-',
    adminNote: c.admin_note,
  }));

  if (filter === 'longAbsent') {
    result.sort((x, y) => (x.recentVisitDate || '').localeCompare(y.recentVisitDate || ''));
  }

  if (filter === 'vip' && result.length > 0) {
    // 20회부터 5회마다 반복 발급되는 규칙이라 reward_rules에는 threshold_visits=30인
    // 행이 따로 없습니다. customer_rewards에 실제 발급된 회차(threshold_visits) 기준으로 찾습니다.
    const vipMinVisits = getAllTiers().at(-1)?.minVisits ?? 30;
    const rewardMap = new Map<string, { issuedAt: string; status: string }>();
    const crs = await fetchByIdChunks<{ customer_id: string; issued_at: string; status: string }>(
      result.map((r) => r.id),
      (ids) =>
        supabase
          .from('customer_rewards')
          .select('customer_id, issued_at, status')
          .eq('threshold_visits', vipMinVisits)
          .not('reward_rule_id', 'is', null)
          .in('customer_id', ids)
    );
    for (const cr of crs) {
      rewardMap.set(cr.customer_id, { issuedAt: cr.issued_at, status: cr.status });
    }
    for (const item of result) {
      const rewardInfo = rewardMap.get(item.id);
      item.vipAchievedAt = rewardInfo?.issuedAt || null;
      item.giftUsed = rewardInfo?.status === 'used';
    }
    result.sort((x, y) => y.visitCount - x.visitCount);
  }

  if (filter === 'allStoresCompleted' && result.length > 0) {
    const gifts = await fetchByIdChunks<{ customer_id: string; issued_at: string; status: string }>(
      result.map((r) => r.id),
      (ids) =>
        supabase
          .from('customer_rewards')
          .select('customer_id, issued_at, status')
          .eq('source', 'all_stores')
          .in('customer_id', ids)
    );
    const giftMap = new Map(gifts.map((g) => [g.customer_id, g]));
    for (const item of result) {
      const gift = giftMap.get(item.id);
      item.allStoresCompletedAt = gift?.issued_at ?? null;
      item.allStoresGiftUsed = gift?.status === 'used';
    }
    result.sort((x, y) => (y.allStoresCompletedAt || '').localeCompare(x.allStoresCompletedAt || ''));
  }

  if (filter === 'oneStoreLeft' && allStoresInfo) {
    const { stores, visitedByCustomer } = allStoresInfo;
    for (const item of result) {
      const visited = visitedByCustomer.get(item.id);
      item.missingStoreName = stores.find((st) => !visited?.has(st.id))?.name ?? '-';
    }
    result.sort((x, y) => (y.recentVisitDate || '').localeCompare(x.recentVisitDate || ''));
  }

  if (limit != null) {
    result = result.slice(0, limit);
  }
  return { items: result, totalCount };
}

/** 고객 목록 화면에 한 번에 보여주는 최대 인원 (엑셀 저장은 인원 제한 없이 전체) */
const CUSTOMER_LIST_DISPLAY_LIMIT = 100;

export interface CustomerListPage {
  items: CustomerListItem[];
  /** 조건에 맞는 전체 인원 (화면에는 최대 CUSTOMER_LIST_DISPLAY_LIMIT명만 표시) */
  totalCount: number;
}

export async function getCustomerListPage(
  query: string,
  filter: CustomerListFilter = 'all',
  longAbsentDays: number = DEFAULT_LONG_ABSENT_DAYS,
  tierKey?: VisitTierKey,
  storeId?: string | null,
  marketingConsent?: boolean | null
): Promise<ApiResponse<CustomerListPage>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const data = await buildCustomerList(
      supabase,
      { query, filter, longAbsentDays, tierKey, storeId, marketingConsent },
      CUSTOMER_LIST_DISPLAY_LIMIT
    );
    return { success: true, data };
  } catch (error) {
    console.error('getCustomerListPage 오류:', error);
    return { success: false, error: '고객 목록 조회 중 오류가 발생했습니다.' };
  }
}

/** 고객 검색 등 간단한 목록용 — 최대 100명 */
export async function getCustomerList(
  query: string,
  filter: CustomerListFilter = 'all',
  longAbsentDays: number = DEFAULT_LONG_ABSENT_DAYS,
  tierKey?: VisitTierKey,
  storeId?: string | null,
  marketingConsent?: boolean | null
): Promise<ApiResponse<CustomerListItem[]>> {
  const result = await getCustomerListPage(query, filter, longAbsentDays, tierKey, storeId, marketingConsent);
  return result.success && result.data
    ? { success: true, data: result.data.items }
    : { success: false, error: result.error };
}

/**
 * 엑셀 저장용 — 조건에 맞는 고객 전체 (인원 제한 없음).
 * 문자는 이 명단을 내려받아 알리고에서 직접 발송합니다.
 */
export async function exportCustomerList(
  query: string,
  filter: CustomerListFilter = 'all',
  longAbsentDays: number = DEFAULT_LONG_ABSENT_DAYS,
  tierKey?: VisitTierKey,
  storeId?: string | null,
  marketingConsent?: boolean | null
): Promise<ApiResponse<CustomerListItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const { items } = await buildCustomerList(
      supabase,
      { query, filter, longAbsentDays, tierKey, storeId, marketingConsent },
      null
    );
    return { success: true, data: items };
  } catch (error) {
    console.error('exportCustomerList 오류:', error);
    return { success: false, error: '엑셀 명단을 만드는 중 오류가 발생했습니다.' };
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
export async function getTierBreakdown(storeId?: string | null): Promise<ApiResponse<TierBreakdownItem[]>> {
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
        if (storeId) {
          q = q.eq('signup_store_id', storeId);
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

export interface ReferralSourceBreakdownItem {
  key: string;
  label: string;
  count: number;
}

/**
 * 유입 경로별 고객 수 집계. 가입 시 응답하지 않은 고객은 "미응답"으로 별도 집계합니다.
 */
export async function getReferralSourceBreakdown(
  storeId?: string | null
): Promise<ApiResponse<ReferralSourceBreakdownItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const counts = await Promise.all(
      REFERRAL_SOURCE_OPTIONS.map((option) => {
        let q = supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('is_active', true)
          .eq('referral_source', option.key);
        if (storeId) {
          q = q.eq('signup_store_id', storeId);
        }
        return q;
      })
    );

    let unansweredQuery = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .is('referral_source', null);
    if (storeId) {
      unansweredQuery = unansweredQuery.eq('signup_store_id', storeId);
    }
    const unanswered = await unansweredQuery;

    return {
      success: true,
      data: [
        ...REFERRAL_SOURCE_OPTIONS.map((option, i) => ({
          key: option.key,
          label: option.label,
          count: counts[i].count || 0,
        })),
        { key: 'unanswered', label: '미응답', count: unanswered.count || 0 },
      ],
    };
  } catch (error) {
    console.error('getReferralSourceBreakdown 오류:', error);
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
  storeId: string;
  storeName: string;
  visitDate: string;
  visitTime: string;
  visitCount: number;
  isCancelled: boolean;
  cancelReason: string | null;
  locationVerified: LocationVerifiedStatus;
  distanceMeters: number | null;
}

async function fetchVisitRecords(
  supabase: ReturnType<typeof createAdminClient>,
  opts: { dateFrom?: string; dateTo?: string; query?: string; onlyToday?: boolean; limit?: number; storeId?: string | null }
): Promise<VisitRecordItem[]> {
  let idFilter: string[] | null = null;
  const trimmed = (opts.query || '').trim();
  if (trimmed) {
    const safe = trimmed.replace(/[,()]/g, '');
    // 검색어에 맞는 고객이 아주 많으면(예: "010") 앞 200명까지만 방문 기록을 찾습니다.
    const { data: matches } = await supabase
      .from('customers')
      .select('id')
      .or(`name.ilike.%${safe}%,phone.ilike.%${safe}%`)
      .order('created_at', { ascending: false })
      .limit(ID_CHUNK_SIZE);
    idFilter = (matches || []).map((m) => m.id);
    if (idFilter.length === 0) return [];
  }

  let request = supabase
    .from('visits')
    .select('id, customer_id, store_id, visit_date, visit_time, is_cancelled, cancel_reason, location_verified, distance_meters')
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
  if (opts.storeId) {
    request = request.eq('store_id', opts.storeId);
  }
  if (idFilter) {
    request = request.in('customer_id', idFilter);
  }

  const { data: visits, error } = await request;
  if (error || !visits || visits.length === 0) {
    return [];
  }

  const customerIds = [...new Set(visits.map((v) => v.customer_id))];
  const [customers, { data: stores }] = await Promise.all([
    fetchByIdChunks<{ id: string; name: string; customer_number: string; phone: string; visit_count: number }>(
      customerIds,
      (ids) => supabase.from('customers').select('id, name, customer_number, phone, visit_count').in('id', ids)
    ),
    supabase.from('stores').select('id, name'),
  ]);

  const customerMap = new Map((customers || []).map((c) => [c.id, c]));
  const storeMap = new Map((stores || []).map((s) => [s.id, s.name]));

  return visits.map((v) => {
    const c = customerMap.get(v.customer_id);
    return {
      id: v.id,
      customerId: v.customer_id,
      customerName: c?.name || '알 수 없음',
      customerNumber: c?.customer_number || '-',
      phone: c?.phone || '-',
      storeId: v.store_id,
      storeName: storeMap.get(v.store_id) || '알 수 없음',
      visitDate: v.visit_date,
      visitTime: v.visit_time,
      visitCount: c?.visit_count ?? 0,
      isCancelled: v.is_cancelled,
      cancelReason: v.cancel_reason,
      locationVerified: v.location_verified,
      distanceMeters: v.distance_meters,
    };
  });
}

/**
 * 오늘 방문한 고객의 방문 기록 목록
 */
export async function getTodayVisitors(storeId?: string | null): Promise<ApiResponse<VisitRecordItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const data = await fetchVisitRecords(supabase, { onlyToday: true, limit: 500, storeId });
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
  dateTo?: string,
  storeId?: string | null
): Promise<ApiResponse<VisitRecordItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();
    const data = await fetchVisitRecords(supabase, { query, dateFrom, dateTo, limit: 300, storeId });
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
  storeName: string;
  visits: { id: string; visitTime: string }[];
}

/**
 * 같은 고객이 같은 날짜에 같은 매장에서 취소되지 않은 방문 기록을 2건 이상 가진
 * 경우를 찾습니다. (DB 제약으로 원칙적으로 발생하지 않아야 하지만, 이상 여부를
 * 점검하기 위한 화면)
 *
 * 매장 구분 없이 "같은 날짜"만 봤다면, 3매장을 오가는 정상적인 통합 이용
 * (예: 점심 A매장, 저녁 B매장)까지 전부 중복으로 잘못 잡히기 때문에 반드시
 * store_id까지 함께 묶어야 합니다.
 */
export async function getDuplicateVisits(): Promise<ApiResponse<DuplicateVisitGroup[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();

    // 중복 묶음에 속한 방문 기록만 DB에서 받아옵니다 (admin_duplicate_visits)
    const [{ data: visits, error }, { data: stores }] = await Promise.all([
      supabase.rpc('admin_duplicate_visits'),
      supabase.from('stores').select('id, name'),
    ]);

    if (error) {
      return { success: false, error: '방문 기록 조회 중 오류가 발생했습니다.' };
    }

    const storeMap = new Map((stores || []).map((s) => [s.id, s.name]));

    const groups = new Map<
      string,
      { customerId: string; visitDate: string; storeId: string; visits: { id: string; visitTime: string }[] }
    >();
    type DuplicateRow = { id: string; customer_id: string; store_id: string; visit_date: string; visit_time: string };
    for (const v of (visits || []) as DuplicateRow[]) {
      const key = `${v.customer_id}_${v.visit_date}_${v.store_id}`;
      if (!groups.has(key)) {
        groups.set(key, { customerId: v.customer_id, visitDate: v.visit_date, storeId: v.store_id, visits: [] });
      }
      groups.get(key)!.visits.push({ id: v.id, visitTime: v.visit_time });
    }

    const duplicates = [...groups.values()].filter((g) => g.visits.length > 1);
    if (duplicates.length === 0) {
      return { success: true, data: [] };
    }

    const customers = await fetchByIdChunks<{ id: string; name: string; customer_number: string; phone: string }>(
      duplicates.map((d) => d.customerId),
      (ids) => supabase.from('customers').select('id, name, customer_number, phone').in('id', ids)
    );
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const result: DuplicateVisitGroup[] = duplicates
      .map((d) => {
        const c = customerMap.get(d.customerId);
        return {
          customerId: d.customerId,
          customerName: c?.name || '알 수 없음',
          customerNumber: c?.customer_number || '-',
          phone: c?.phone || '-',
          visitDate: d.visitDate,
          storeName: storeMap.get(d.storeId) || '알 수 없음',
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

    // 기록 수와 방문 횟수가 다른 고객만 DB에서 받아옵니다 (admin_visit_count_mismatches)
    const { data: rows, error } = await supabase.rpc('admin_visit_count_mismatches');
    if (error) {
      return { success: false, error: '데이터 조회 중 오류가 발생했습니다.' };
    }
    const mismatchRows = (rows || []) as { customer_id: string; recorded_count: number; actual_count: number }[];
    const customers = await fetchByIdChunks<{ id: string; name: string; customer_number: string; phone: string }>(
      mismatchRows.map((r) => r.customer_id),
      (ids) => supabase.from('customers').select('id, name, customer_number, phone').in('id', ids)
    );
    const customerMap = new Map(customers.map((c) => [c.id, c]));

    const mismatches: VisitCountMismatchItem[] = mismatchRows.map((r) => {
      const c = customerMap.get(r.customer_id);
      return {
        customerId: r.customer_id,
        customerName: c?.name || '알 수 없음',
        customerNumber: c?.customer_number || '-',
        phone: c?.phone || '-',
        recordedVisitCount: Number(r.recorded_count),
        actualVisitCount: Number(r.actual_count),
      };
    });

    return { success: true, data: mismatches };
  } catch (error) {
    console.error('getVisitCountMismatches 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface SuspiciousActivityItem {
  id: string;
  activityType: string;
  activityLabel: string;
  description: string | null;
  customerId: string | null;
  customerName: string | null;
  customerNumber: string | null;
  phone: string | null;
  createdAt: string;
}

/**
 * 위치 확인 반복 실패(QR 사진 + 위치 권한 거부 반복 패턴) 등으로 차단된
 * 의심 활동 기록을 최신순으로 조회합니다.
 */
export async function getSuspiciousActivities(): Promise<ApiResponse<SuspiciousActivityItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('suspicious_activities')
      .select('id, activity_type, description, customer_id, created_at')
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      return { success: false, error: '의심 활동 기록을 불러올 수 없습니다.' };
    }

    const customerIds = [...new Set((data || []).map((d) => d.customer_id).filter((id): id is string => !!id))];
    const { data: customers } =
      customerIds.length > 0
        ? await supabase.from('customers').select('id, name, customer_number, phone').in('id', customerIds)
        : { data: [] };
    const customerMap = new Map((customers || []).map((c) => [c.id, c]));

    const result: SuspiciousActivityItem[] = (data || []).map((d) => {
      const c = d.customer_id ? customerMap.get(d.customer_id) : undefined;
      return {
        id: d.id,
        activityType: d.activity_type,
        activityLabel: SUSPICIOUS_ACTIVITY_TYPE_LABELS[d.activity_type] ?? d.activity_type,
        description: d.description,
        customerId: d.customer_id,
        customerName: c?.name ?? null,
        customerNumber: c?.customer_number ?? null,
        phone: c?.phone ?? null,
        createdAt: d.created_at,
      };
    });

    return { success: true, data: result };
  } catch (error) {
    console.error('getSuspiciousActivities 오류:', error);
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

    // 세 매장 완주 선물은 DB 트리거(sync_all_stores_coupon)가 취소 즉시 조건을 다시
    // 확인해, 조건이 깨지면 미사용 선물을 회수합니다. 무엇이 회수됐는지 기록·안내하기
    // 위해 취소 전 상태를 먼저 읽어 둡니다.
    const { data: allStoresGiftBefore } = await supabase
      .from('customer_rewards')
      .select('id, status, amount')
      .eq('customer_id', before.customer_id)
      .eq('source', 'all_stores')
      .maybeSingle();

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

    // ─── 이 취소로 더 이상 자격이 안 되는 할인권 정리 ─────────────────
    // visit_count는 update_visit_count 트리거에서 이미 감소했으므로,
    // 다시 조회하면 감소분이 반영된 최신 값을 얻습니다. 아직 안 쓴
    // 할인권은 애초에 못 받았어야 하니 그대로 회수(삭제)하고, 이미 쓴
    // 할인권은 되돌릴 수 없으니 삭제하지 않고 관리자에게 알리기만 합니다.
    const { data: customerAfter } = await supabase
      .from('customers')
      .select('visit_count')
      .eq('id', before.customer_id)
      .single();

    const newVisitCount = customerAfter?.visit_count ?? 0;

    const { data: overissuedRewards } = await supabase
      .from('customer_rewards')
      .select('id, status, threshold_visits, amount')
      .eq('customer_id', before.customer_id)
      .not('reward_rule_id', 'is', null)
      .gt('threshold_visits', newVisitCount);

    const revokedRewardIds = (overissuedRewards || [])
      .filter((r) => r.status === 'available')
      .map((r) => r.id);
    const usedRewardsNowInvalid: { id: string; amount: number; threshold_visits: number | null }[] = (
      overissuedRewards || []
    ).filter((r) => r.status === 'used');

    if (allStoresGiftBefore) {
      const visitedStoreCount = await countVisitedAllStores(supabase, before.customer_id);
      if (visitedStoreCount < ALL_STORES_CODES.length) {
        if (allStoresGiftBefore.status === 'used') {
          usedRewardsNowInvalid.push({ id: allStoresGiftBefore.id, amount: allStoresGiftBefore.amount ?? 0, threshold_visits: null });
        } else {
          // 트리거가 이미 삭제했습니다. 감사 기록에만 남깁니다.
          revokedRewardIds.push(allStoresGiftBefore.id);
        }
      }
    }

    if (revokedRewardIds.length > 0) {
      await supabase.from('customer_rewards').delete().in('id', revokedRewardIds);
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.VISIT_CANCEL,
      target_type: 'visit',
      target_id: visitId,
      before_data: before,
      after_data: {
        ...after,
        revokedRewardIds,
        usedRewardsNowInvalid: usedRewardsNowInvalid.map((r) => ({
          id: r.id,
          amount: r.amount,
          thresholdVisits: r.threshold_visits,
        })),
      },
    });

    if (usedRewardsNowInvalid.length > 0) {
      const totalAmount = usedRewardsNowInvalid.reduce((sum, r) => sum + r.amount, 0);
      return {
        success: true,
        message: `주의: 이 취소로 이미 사용된 할인권 ${usedRewardsNowInvalid.length}건(총 ${totalAmount.toLocaleString()}원)이 자격 기준에 맞지 않게 되었습니다. 자동으로 회수되지 않으니 별도 확인이 필요합니다.`,
      };
    }

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
  reason: string,
  storeId: string
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
    if (!storeId) {
      return { success: false, error: '매장을 선택해 주세요.' };
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
      .eq('store_id', storeId)
      .eq('is_cancelled', false)
      .single();

    if (existing) {
      return { success: false, error: '해당 날짜에 이미 해당 매장 방문 기록이 있습니다.' };
    }

    const { data: after, error: insertError } = await supabase
      .from('visits')
      .insert({ customer_id: customerId, visit_date: visitDate, store_id: storeId })
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
// 고객 관리자 메모
// ============================================================

/**
 * 고객별 관리자 메모를 저장합니다.
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
 * 오늘 방문한 고객 중 해율푸드 VIP(최고 등급)인 고객 목록. 대시보드 알림에 사용합니다.
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
// 매장
// ============================================================

/**
 * 활성 매장 목록을 조회합니다. (QR 관리, 관리자 화면 매장 필터 등에서 공용으로 사용)
 */
export async function getStores(): Promise<ApiResponse<Store[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('stores')
      .select('*')
      .eq('is_active', true)
      .order('created_at', { ascending: true });

    if (error) {
      return { success: false, error: '매장 목록을 불러올 수 없습니다.' };
    }

    return { success: true, data: data || [] };
  } catch (error) {
    console.error('getStores 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface StoreLocationInput {
  latitude: number;
  longitude: number;
  radiusMeters: number;
}

/**
 * 매장 위치 좌표와 허용 반경을 수정합니다. (QR 부정 스캔 방지용 위치 확인 기능에서 사용)
 */
export async function updateStoreLocation(
  storeId: string,
  input: StoreLocationInput
): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    if (
      !Number.isFinite(input.latitude) ||
      input.latitude < -90 ||
      input.latitude > 90
    ) {
      return { success: false, error: '위도 값이 올바르지 않습니다.' };
    }
    if (
      !Number.isFinite(input.longitude) ||
      input.longitude < -180 ||
      input.longitude > 180
    ) {
      return { success: false, error: '경도 값이 올바르지 않습니다.' };
    }
    if (!Number.isInteger(input.radiusMeters) || input.radiusMeters <= 0) {
      return { success: false, error: '허용 반경은 0보다 큰 정수여야 합니다.' };
    }

    const supabase = createAdminClient();

    const { data: before } = await supabase.from('stores').select('*').eq('id', storeId).single();
    if (!before) {
      return { success: false, error: '매장 정보를 찾을 수 없습니다.' };
    }

    const { data: after, error: updateError } = await supabase
      .from('stores')
      .update({
        latitude: input.latitude,
        longitude: input.longitude,
        radius_meters: input.radiusMeters,
      })
      .eq('id', storeId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: '매장 위치 저장 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.STORE_LOCATION_UPDATE,
      target_type: 'store',
      target_id: storeId,
      before_data: before,
      after_data: after,
    });

    return { success: true };
  } catch (error) {
    console.error('updateStoreLocation 오류:', error);
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
 * 특정 매장의 현재 활성 방문 QR 상태(토큰/생성일/최근 재발급일)를 조회합니다.
 */
export async function getQrStatus(storeId: string): Promise<ApiResponse<QrStatusInfo>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const settings = await getOrCreateStoreQrSettings(storeId);
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
 * 특정 매장의 QR을 재발급합니다. 저장되는 즉시 그 매장의 기존 QR(토큰)은 무효화됩니다.
 */
export async function reissueQr(storeId: string): Promise<ApiResponse<QrStatusInfo>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const { before, after } = await reissueStoreQrToken(storeId);

    const supabase = createAdminClient();
    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.QR_REISSUE,
      target_type: 'store_qr_tokens',
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
  storeName: string;
}

export interface CustomerRewardItem {
  id: string;
  amount: number;
  thresholdVisits: number;
  source: RewardSource;
  status: RewardStatus;
  issuedAt: string;
  requestedAt: string | null;
  usedAt: string | null;
  issuedStoreName: string | null;
  usedStoreName: string | null;
}

export interface StoreVisitBreakdown {
  storeId: string;
  storeName: string;
  count: number;
}

export interface CustomerDetail {
  customer: Customer;
  signupStoreName: string | null;
  storeVisitBreakdown: StoreVisitBreakdown[];
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

    const [{ data: visits }, { data: customerRewards }, { data: stores }] = await Promise.all([
      supabase
        .from('visits')
        .select('visit_date, store_id')
        .eq('customer_id', customerId)
        .eq('is_cancelled', false)
        .order('visit_date', { ascending: false }),
      supabase
        .from('customer_rewards')
        .select(
          'id, threshold_visits, amount, status, source, issued_at, requested_at, used_at, issued_store_id, used_store_id'
        )
        .eq('customer_id', customerId)
        .not('reward_rule_id', 'is', null)
        .order('issued_at', { ascending: false }),
      supabase.from('stores').select('id, name').eq('is_active', true),
    ]);

    const storeMap = new Map((stores || []).map((s) => [s.id, s.name]));

    const storeVisitBreakdown: StoreVisitBreakdown[] = (stores || []).map((s) => ({
      storeId: s.id,
      storeName: s.name,
      count: (visits || []).filter((v) => v.store_id === s.id).length,
    }));

    return {
      success: true,
      data: {
        customer,
        signupStoreName: customer.signup_store_id ? storeMap.get(customer.signup_store_id) || null : null,
        storeVisitBreakdown,
        visits: (visits || []).map((v) => ({
          visitDate: v.visit_date,
          storeName: storeMap.get(v.store_id) || '-',
        })),
        rewards: (customerRewards || []).map((r) => ({
          id: r.id,
          amount: r.amount ?? 0,
          thresholdVisits: r.threshold_visits ?? 0,
          source: (r.source as RewardSource) ?? 'visit',
          status: r.status,
          issuedAt: r.issued_at,
          requestedAt: r.requested_at,
          usedAt: r.used_at,
          issuedStoreName: r.issued_store_id ? storeMap.get(r.issued_store_id) || '-' : null,
          usedStoreName: r.used_store_id ? storeMap.get(r.used_store_id) || '-' : null,
        })),
      },
    };
  } catch (error) {
    console.error('getCustomerDetail 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface CustomerAuditHistoryItem {
  id: string;
  action: string;
  adminUsername: string | null;
  reason: string | null;
  createdAt: string;
}

/**
 * 이 고객의 정보 변경 이력 (수정/삭제/탈퇴 등, target_type='customer' 기준).
 */
export async function getCustomerAuditHistory(customerId: string): Promise<ApiResponse<CustomerAuditHistoryItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase
      .from('audit_logs')
      .select('id, admin_id, action, reason, created_at')
      .eq('target_type', 'customer')
      .eq('target_id', customerId)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return { success: false, error: '변경 이력을 불러올 수 없습니다.' };
    }

    const adminIds = [...new Set((data || []).map((l) => l.admin_id).filter((id): id is string => !!id))];
    const adminUsernameMap = new Map<string, string>();
    if (adminIds.length > 0) {
      const { data: admins } = await supabase.from('admin_users').select('id, username').in('id', adminIds);
      (admins || []).forEach((a) => adminUsernameMap.set(a.id, a.username));
    }

    const result: CustomerAuditHistoryItem[] = (data || []).map((l) => ({
      id: l.id,
      action: l.action,
      adminUsername: l.admin_id ? adminUsernameMap.get(l.admin_id) ?? null : null,
      reason: l.reason,
      createdAt: l.created_at,
    }));

    return { success: true, data: result };
  } catch (error) {
    console.error('getCustomerAuditHistory 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 관리자 수동 회원가입 (매장 밖에서 만난 단골손님용 — QR/위치 확인 없음)
// ============================================================

export interface AdminRegisterCustomerInput {
  name: string;
  phone: string;
  /** 'YYYY-MM-DD' */
  birthDate: string;
  storeId: string;
  marketingConsent: boolean;
}

/**
 * 관리자가 매장 밖에서 만난 단골손님을 대신 등록합니다. QR 스캔·위치 확인을
 * 거치지 않으므로(관리자 로그인 자체가 신뢰의 근거), 실제 매장 방문이 아니라서
 * 첫 방문 기록은 만들지 않습니다 — 이후 실제로 매장에 와서 QR을 찍을 때부터
 * 방문횟수가 쌓입니다.
 */
export async function adminRegisterCustomer(
  input: AdminRegisterCustomerInput
): Promise<ApiResponse<{ customerId: string; customerNumber: string }>> {
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

    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) {
      return { success: false, error: '생년월일을 정확히 입력해 주세요.' };
    }

    if (!input.storeId) {
      return { success: false, error: '가입 매장을 선택해 주세요.' };
    }

    const supabase = createAdminClient();

    const { data: existing } = await supabase
      .from('customers')
      .select('id')
      .eq('phone', phone)
      .eq('is_active', true)
      .single();

    if (existing) {
      return { success: false, error: '이미 가입된 번호입니다.' };
    }

    const { data: customer, error: insertError } = await supabase
      .from('customers')
      .insert({
        customer_number: '', // 트리거가 자동 생성
        name,
        phone,
        birth_date: input.birthDate,
        marketing_consent: input.marketingConsent,
        signup_store_id: input.storeId,
      })
      .select('id, customer_number')
      .single();

    if (insertError || !customer) {
      if (insertError?.code === '23505') {
        return { success: false, error: '이미 가입된 번호입니다.' };
      }
      return { success: false, error: '등록 중 오류가 발생했습니다.' };
    }

    await supabase.from('consent_logs').insert([
      { customer_id: customer.id, consent_type: 'privacy', consented: true },
      ...(input.marketingConsent
        ? [{ customer_id: customer.id, consent_type: 'marketing', consented: true }]
        : []),
    ]);

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.CUSTOMER_MANUAL_REGISTER,
      target_type: 'customer',
      target_id: customer.id,
      before_data: null,
      after_data: { name, phone, birthDate: input.birthDate, storeId: input.storeId },
    });

    return { success: true, data: { customerId: customer.id, customerNumber: customer.customer_number } };
  } catch (error) {
    console.error('adminRegisterCustomer 오류:', error);
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

/** DB에서 받은 날짜별 건수(day, cnt)를 일/주/월 구간으로 합칩니다. */
function bucketizeDailyCounts(
  buckets: DateBucket[],
  rows: { day: string; cnt: number }[] | null
): { points: TrendPoint[]; total: number } {
  const daily = (rows || []).map((r) => ({ day: r.day, cnt: Number(r.cnt) }));
  const points = buckets.map((b) => ({
    label: b.label,
    date: b.start,
    count: daily.filter((d) => d.day >= b.start && d.day <= b.end).reduce((sum, d) => sum + d.cnt, 0),
  }));
  return { points, total: points.reduce((sum, p) => sum + p.count, 0) };
}

/**
 * 일별/주별/월별 방문 수 추이. 방문 취소는 집계에서 제외합니다.
 */
export async function getVisitTrend(
  period: StatsPeriod,
  dateFrom?: string,
  dateTo?: string,
  storeId?: string | null
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

    const currentQuery = supabase.rpc('admin_daily_visit_counts', {
      p_from: overallStart,
      p_to: overallEnd,
      p_store_id: storeId ?? null,
    });
    let previousQuery = supabase
      .from('visits')
      .select('id', { count: 'exact', head: true })
      .eq('is_cancelled', false)
      .gte('visit_date', prevRange.start)
      .lte('visit_date', prevRange.end);
    if (storeId) {
      previousQuery = previousQuery.eq('store_id', storeId);
    }

    const [{ data: current, error: currentError }, { count: previousTotal }] = await Promise.all([
      currentQuery,
      previousQuery,
    ]);
    if (currentError) throw currentError;

    const { points, total } = bucketizeDailyCounts(buckets, current as { day: string; cnt: number }[] | null);

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
  dateTo?: string,
  storeId?: string | null
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

    const prevStartTs = `${prevRange.start}T00:00:00+09:00`;
    const prevEndTs = `${prevRange.end}T23:59:59.999+09:00`;

    const currentQuery = supabase.rpc('admin_daily_signup_counts', {
      p_from: overallStart,
      p_to: overallEnd,
      p_store_id: storeId ?? null,
    });
    let previousQuery = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('created_at', prevStartTs)
      .lte('created_at', prevEndTs);
    if (storeId) {
      previousQuery = previousQuery.eq('signup_store_id', storeId);
    }

    const [{ data: current, error: currentError }, { count: previousTotal }] = await Promise.all([
      currentQuery,
      previousQuery,
    ]);
    if (currentError) throw currentError;

    const { points, total } = bucketizeDailyCounts(buckets, current as { day: string; cnt: number }[] | null);

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
  dateTo?: string,
  storeId?: string | null
): Promise<ApiResponse<NewReturningPoint[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const buckets = getDateBuckets(period, dateFrom, dateTo);

    // 구간별 신규/재방문 인원을 DB에서 바로 셉니다 (admin_new_returning_counts)
    const { data: rows, error } = await supabase.rpc('admin_new_returning_counts', {
      p_starts: buckets.map((b) => b.start),
      p_ends: buckets.map((b) => b.end),
      p_store_id: storeId ?? null,
    });

    if (error) {
      return { success: false, error: '방문 기록 조회 중 오류가 발생했습니다.' };
    }

    const byIndex = new Map(
      ((rows || []) as { bucket_index: number; new_count: number; returning_count: number }[]).map((r) => [
        Number(r.bucket_index),
        r,
      ])
    );
    const result: NewReturningPoint[] = buckets.map((b, i) => {
      const r = byIndex.get(i + 1);
      return {
        label: b.label,
        date: b.start,
        newCount: Number(r?.new_count ?? 0),
        returningCount: Number(r?.returning_count ?? 0),
      };
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
 * 일별/주별/월별 VIP 전환(해율푸드 VIP 등급 선물 발급) 수 추이.
 */
export async function getVipConversionTrend(
  period: StatsPeriod,
  dateFrom?: string,
  dateTo?: string,
  storeId?: string | null
): Promise<ApiResponse<VipConversionResult>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const vipMinVisits = getAllTiers().at(-1)?.minVisits ?? 30;

    let vipCountQuery = supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .eq('is_active', true)
      .gte('visit_count', vipMinVisits);
    if (storeId) {
      vipCountQuery = vipCountQuery.eq('signup_store_id', storeId);
    }

    const { count: totalVipCount } = await vipCountQuery;

    const buckets = getDateBuckets(period, dateFrom, dateTo);
    const overallStart = buckets[0].start;
    const overallEnd = buckets[buckets.length - 1].end;
    const prevRange = getPreviousRange(buckets);
    const prevStartTs = `${prevRange.start}T00:00:00+09:00`;
    const prevEndTs = `${prevRange.end}T23:59:59.999+09:00`;

    // 20회부터 5회마다 반복 발급되는 규칙이라 reward_rules에는 threshold_visits=30인
    // 행이 따로 없습니다. customer_rewards에 실제 발급된 회차(threshold_visits) 기준으로 찾습니다.
    const currentQuery = supabase.rpc('admin_daily_vip_counts', {
      p_from: overallStart,
      p_to: overallEnd,
      p_threshold: vipMinVisits,
      p_store_id: storeId ?? null,
    });
    let previousQuery = supabase
      .from('customer_rewards')
      .select('id', { count: 'exact', head: true })
      .eq('threshold_visits', vipMinVisits)
      .not('reward_rule_id', 'is', null)
      .gte('issued_at', prevStartTs)
      .lte('issued_at', prevEndTs);
    if (storeId) {
      previousQuery = previousQuery.eq('issued_store_id', storeId);
    }

    const [{ data: current, error: currentError }, { count: previousTotal }] = await Promise.all([
      currentQuery,
      previousQuery,
    ]);
    if (currentError) throw currentError;

    const { points, total } = bucketizeDailyCounts(buckets, current as { day: string; cnt: number }[] | null);

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
export async function getLongAbsentBuckets(storeId?: string | null): Promise<ApiResponse<LongAbsentBuckets>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();
    const { data, error } = await supabase.rpc('admin_long_absent_counts', {
      p_today: getTodayKST(),
      p_store_id: storeId ?? null,
    });
    if (error) throw error;
    const row = (data as LongAbsentBuckets[] | null)?.[0];
    const result: LongAbsentBuckets = {
      from30to59: Number(row?.from30to59 ?? 0),
      from60to89: Number(row?.from60to89 ?? 0),
      from90plus: Number(row?.from90plus ?? 0),
    };

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
  bucket: LongAbsentBucketKey,
  storeId?: string | null
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

    const range =
      bucket === 'from90plus'
        ? { before: cutoff90 }
        : bucket === 'from60to89'
          ? { before: cutoff60, onOrAfter: cutoff90 }
          : { before: cutoff30, onOrAfter: cutoff60 };
    const latestVisitMap = await getLatestVisitDateMap(supabase, undefined, range);
    const matchingIds = [...latestVisitMap.keys()];

    if (matchingIds.length === 0) {
      return { success: true, data: [] };
    }

    const [customers, rewards] = await Promise.all([
      fetchByIdChunks<{ id: string; name: string; visit_count: number }>(matchingIds, (ids) => {
        let customersQuery = supabase
          .from('customers')
          .select('id, name, visit_count')
          .eq('is_active', true)
          .in('id', ids);
        if (storeId) {
          customersQuery = customersQuery.eq('signup_store_id', storeId);
        }
        return customersQuery;
      }),
      // 고객 한 명이 할인권을 여러 장 가질 수 있어 50명씩 나눠 조회합니다.
      fetchByIdChunks<{ customer_id: string; status: string }>(
        matchingIds,
        (ids) =>
          supabase.from('customer_rewards').select('customer_id, status').in('customer_id', ids).neq('status', 'used'),
        50
      ),
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
// 활동 이력 (감사 로그)
// ============================================================

export interface AuditLogItem {
  id: string;
  adminUsername: string | null;
  action: string;
  targetType: string;
  targetId: string | null;
  reason: string | null;
  createdAt: string;
}

/**
 * 최근 관리자/시스템 활동 이력을 조회합니다.
 * 방문취소·할인권복구·고객삭제·회원탈퇴·QR재발행·SMS발송 등은 각 처리 시점에
 * 이미 audit_logs에 기록되고 있으며, 이 함수는 그 기록을 읽어오기만 합니다.
 */
export interface AuditLogFilters {
  /** AUDIT_ACTION 값 중 하나. 생략하면 전체 */
  action?: string;
  /** 'YYYY-MM-DD', 이 날짜(한국시간) 자정부터 */
  dateFrom?: string;
  /** 'YYYY-MM-DD', 이 날짜(한국시간) 끝까지 */
  dateTo?: string;
  /** 고객명·사유 등 자유 검색어. before_data/after_data/reason 안에서 찾습니다 */
  query?: string;
}

/**
 * 최근 활동 이력을 조회합니다. 기간·작업종류로 DB에서 먼저 걸러내고,
 * 자유 검색어는 조회된 최근 `limit`건 안에서 JSON 내용까지 훑어봅니다
 * (전체 이력을 대상으로 한 전문 검색은 아니며, 최근 활동 위주의 검색입니다).
 */
export async function getAuditLogs(
  filters: AuditLogFilters = {},
  limit = 300
): Promise<ApiResponse<AuditLogItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    let logsQuery = supabase
      .from('audit_logs')
      .select('id, admin_id, action, target_type, target_id, reason, before_data, after_data, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (filters.action) {
      logsQuery = logsQuery.eq('action', filters.action);
    }
    if (filters.dateFrom) {
      logsQuery = logsQuery.gte('created_at', `${filters.dateFrom}T00:00:00+09:00`);
    }
    if (filters.dateTo) {
      logsQuery = logsQuery.lte('created_at', `${filters.dateTo}T23:59:59+09:00`);
    }

    const { data: logs, error } = await logsQuery;

    if (error) {
      return { success: false, error: '활동 이력을 불러올 수 없습니다.' };
    }

    let filteredLogs = logs || [];
    const keyword = filters.query?.trim().toLowerCase();
    if (keyword) {
      filteredLogs = filteredLogs.filter((l) => {
        const haystack = `${l.reason ?? ''} ${JSON.stringify(l.before_data ?? '')} ${JSON.stringify(l.after_data ?? '')}`.toLowerCase();
        return haystack.includes(keyword);
      });
    }

    const adminIds = [...new Set(filteredLogs.map((l) => l.admin_id).filter((id): id is string => !!id))];
    const adminUsernameMap = new Map<string, string>();
    if (adminIds.length > 0) {
      const { data: admins } = await supabase.from('admin_users').select('id, username').in('id', adminIds);
      (admins || []).forEach((a) => adminUsernameMap.set(a.id, a.username));
    }

    const result: AuditLogItem[] = filteredLogs.map((l) => ({
      id: l.id,
      adminUsername: l.admin_id ? adminUsernameMap.get(l.admin_id) ?? null : null,
      action: l.action,
      targetType: l.target_type,
      targetId: l.target_id,
      reason: l.reason,
      createdAt: l.created_at,
    }));

    return { success: true, data: result };
  } catch (error) {
    console.error('getAuditLogs 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 알림/이벤트 관리 (고객 홈 화면에 노출)
// ============================================================

export interface NoticeAdminItem {
  id: string;
  kind: NoticeKind;
  title: string;
  body: string;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  createdByUsername: string | null;
  createdAt: string;
  updatedAt: string;
}

/**
 * 지금까지 작성된 알림/이벤트를 전부 조회합니다(비활성·종료된 것 포함).
 * 삭제하지 않고 계속 쌓이는 구조라 이 목록 자체가 작성 이력입니다.
 */
export async function getNotices(): Promise<ApiResponse<NoticeAdminItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }
    const supabase = createAdminClient();

    const { data, error } = await supabase
      .from('notices')
      .select('id, kind, title, body, starts_at, ends_at, is_active, created_by, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      return { success: false, error: '알림/이벤트 목록 조회 중 오류가 발생했습니다.' };
    }

    const creatorIds = [...new Set((data || []).map((n) => n.created_by).filter((id): id is string => !!id))];
    const creatorUsernameMap = new Map<string, string>();
    if (creatorIds.length > 0) {
      const { data: admins } = await supabase.from('admin_users').select('id, username').in('id', creatorIds);
      (admins || []).forEach((a) => creatorUsernameMap.set(a.id, a.username));
    }

    return {
      success: true,
      data: (data || []).map((n) => ({
        id: n.id,
        kind: n.kind,
        title: n.title,
        body: n.body,
        startsAt: n.starts_at,
        endsAt: n.ends_at,
        isActive: n.is_active,
        createdByUsername: n.created_by ? creatorUsernameMap.get(n.created_by) ?? null : null,
        createdAt: n.created_at,
        updatedAt: n.updated_at,
      })),
    };
  } catch (error) {
    console.error('getNotices 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

export interface NoticeInput {
  kind: NoticeKind;
  title: string;
  body: string;
  /** 'YYYY-MM-DD' (한국시간 기준 이 날짜 00:00부터 노출) */
  startDate: string;
  /** 'YYYY-MM-DD' (한국시간 기준 이 날짜 23:59:59까지 노출) */
  endDate: string;
}

function validateNoticeInput(input: NoticeInput): string | null {
  if (input.kind !== 'notice' && input.kind !== 'event') {
    return '알림/이벤트 구분을 선택해 주세요.';
  }
  if (!input.title.trim()) {
    return '제목을 입력해 주세요.';
  }
  if (!input.body.trim()) {
    return '내용을 입력해 주세요.';
  }
  if (!input.startDate || !input.endDate) {
    return '게시 시작일과 종료일을 모두 선택해 주세요.';
  }
  if (input.endDate < input.startDate) {
    return '종료일은 시작일보다 빠를 수 없습니다.';
  }
  return null;
}

/**
 * 새 알림/이벤트를 등록합니다. 기존 글은 건드리지 않고 새 행으로 쌓이며,
 * 고객 화면에는 게시기간 안에 있는 것 중 가장 최근 글 1건만 노출됩니다.
 */
export async function createNotice(input: NoticeInput): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const validationError = validateNoticeInput(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const supabase = createAdminClient();

    const { data: after, error: insertError } = await supabase
      .from('notices')
      .insert({
        kind: input.kind,
        title: input.title.trim(),
        body: input.body.trim(),
        starts_at: `${input.startDate}T00:00:00+09:00`,
        ends_at: `${input.endDate}T23:59:59+09:00`,
        is_active: true,
        created_by: admin.adminId,
      })
      .select()
      .single();

    if (insertError) {
      return { success: false, error: '알림/이벤트 등록 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.NOTICE_CREATE,
      target_type: 'notice',
      target_id: after.id,
      before_data: null,
      after_data: after,
    });

    return { success: true };
  } catch (error) {
    console.error('createNotice 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 기존 알림/이벤트 내용을 수정합니다(오타 정정, 기간 연장 등).
 */
export async function updateNotice(noticeId: string, input: NoticeInput): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const validationError = validateNoticeInput(input);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const supabase = createAdminClient();

    const { data: before } = await supabase.from('notices').select('*').eq('id', noticeId).single();
    if (!before) {
      return { success: false, error: '알림/이벤트를 찾을 수 없습니다.' };
    }

    const { data: after, error: updateError } = await supabase
      .from('notices')
      .update({
        kind: input.kind,
        title: input.title.trim(),
        body: input.body.trim(),
        starts_at: `${input.startDate}T00:00:00+09:00`,
        ends_at: `${input.endDate}T23:59:59+09:00`,
      })
      .eq('id', noticeId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: '알림/이벤트 수정 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.NOTICE_UPDATE,
      target_type: 'notice',
      target_id: noticeId,
      before_data: before,
      after_data: after,
    });

    return { success: true };
  } catch (error) {
    console.error('updateNotice 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

/**
 * 게시기간이 남아 있어도 지금 바로 고객 화면에서 내리고 싶을 때 사용합니다.
 * 행 자체는 지우지 않아 이력에는 계속 남습니다.
 */
export async function endNoticeNow(noticeId: string): Promise<ApiResponse<null>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    const { data: before } = await supabase.from('notices').select('*').eq('id', noticeId).single();
    if (!before) {
      return { success: false, error: '알림/이벤트를 찾을 수 없습니다.' };
    }

    const { data: after, error: updateError } = await supabase
      .from('notices')
      .update({ is_active: false })
      .eq('id', noticeId)
      .select()
      .single();

    if (updateError) {
      return { success: false, error: '중단 처리 중 오류가 발생했습니다.' };
    }

    await supabase.from('audit_logs').insert({
      admin_id: admin.adminId,
      action: AUDIT_ACTION.NOTICE_END,
      target_type: 'notice',
      target_id: noticeId,
      before_data: before,
      after_data: after,
    });

    return { success: true };
  } catch (error) {
    console.error('endNoticeNow 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}

// ============================================================
// 데이터 백업
// ============================================================

export interface BackupCustomerRow {
  customerNumber: string;
  name: string;
  phone: string;
  birthDate: string | null;
  visitCount: number;
  marketingConsent: boolean;
  signupStoreName: string | null;
  referralSource: string | null;
  isActive: boolean;
  createdAt: string;
}

export interface BackupRewardRow {
  customerNumber: string;
  customerName: string;
  phone: string;
  amount: number;
  thresholdVisits: number;
  source: RewardSource;
  status: RewardStatus;
  issuedAt: string;
  expiresAt: string | null;
  usedAt: string | null;
}

export interface BackupData {
  customers: BackupCustomerRow[];
  rewards: BackupRewardRow[];
}

/**
 * 관리자가 직접 내려받는 백업용 원자료.
 * 해율여권 시스템 자체에 문제가 생겨도 다른 곳에서 재사용할 수 있도록,
 * 내부 고유번호(UUID) 대신 회원번호/전화번호를 기준으로 두 표를 연결해서 반환합니다.
 */
export async function getBackupData(): Promise<ApiResponse<BackupData>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    // 고객·할인권이 1,000건을 넘어도 백업에서 빠지지 않도록 끝까지 나눠 읽습니다.
    let customers;
    let rewards;
    try {
      [customers, rewards] = await Promise.all([
        fetchAllRows<{
          id: string;
          customer_number: string;
          name: string;
          phone: string;
          birth_date: string | null;
          visit_count: number;
          marketing_consent: boolean;
          signup_store_id: string | null;
          referral_source: string | null;
          is_active: boolean;
          created_at: string;
        }>((from, to) =>
          supabase
            .from('customers')
            .select(
              'id, customer_number, name, phone, birth_date, visit_count, marketing_consent, signup_store_id, referral_source, is_active, created_at'
            )
            .order('created_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        ),
        fetchAllRows<{
          customer_id: string;
          amount: number;
          threshold_visits: number | null;
          source: string;
          status: RewardStatus;
          issued_at: string;
          expires_at: string | null;
          used_at: string | null;
        }>((from, to) =>
          supabase
            .from('customer_rewards')
            .select('customer_id, amount, threshold_visits, source, status, issued_at, expires_at, used_at')
            .not('reward_rule_id', 'is', null)
            .order('issued_at', { ascending: true })
            .order('id', { ascending: true })
            .range(from, to)
        ),
      ]);
    } catch {
      return { success: false, error: '백업 데이터 조회 중 오류가 발생했습니다.' };
    }
    const { data: stores } = await supabase.from('stores').select('id, name');

    const storeMap = new Map((stores || []).map((s) => [s.id, s.name]));
    const customerMap = new Map((customers || []).map((c) => [c.id, c]));

    const backupCustomers: BackupCustomerRow[] = (customers || []).map((c) => ({
      customerNumber: c.customer_number,
      name: c.name,
      phone: c.phone,
      birthDate: c.birth_date,
      visitCount: c.visit_count,
      marketingConsent: c.marketing_consent,
      signupStoreName: c.signup_store_id ? storeMap.get(c.signup_store_id) || null : null,
      referralSource: getReferralSourceLabel(c.referral_source as ReferralSourceKey | null),
      isActive: c.is_active,
      createdAt: c.created_at,
    }));

    const backupRewards: BackupRewardRow[] = (rewards || [])
      .map((r) => {
        const c = customerMap.get(r.customer_id);
        if (!c) return null;
        const row: BackupRewardRow = {
          customerNumber: c.customer_number,
          customerName: c.name,
          phone: c.phone,
          amount: r.amount ?? 0,
          thresholdVisits: r.threshold_visits ?? 0,
          source: (r.source as RewardSource) ?? 'visit',
          status: r.status,
          issuedAt: r.issued_at,
          expiresAt: r.expires_at,
          usedAt: r.used_at,
        };
        return row;
      })
      .filter((r): r is BackupRewardRow => r !== null);

    return { success: true, data: { customers: backupCustomers, rewards: backupRewards } };
  } catch (error) {
    console.error('getBackupData 오류:', error);
    return { success: false, error: '서버 오류가 발생했습니다.' };
  }
}
