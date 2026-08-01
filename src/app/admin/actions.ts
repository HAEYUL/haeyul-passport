'use server';

import { createAdminClient } from '@/lib/supabase/admin';
import { getTodayKST } from '@/lib/utils';
import {
  setAdminSession,
  getAdminSession,
  clearAdminSession,
} from '@/lib/adminSession';
import type { ApiResponse, Customer, RewardStatus } from '@/types/database';

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

export interface DashboardStats {
  totalCustomers: number;
  todayVisits: number;
  unclaimedRewards: number;
  newCustomersThisMonth: number;
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

    const [
      { count: totalCustomers },
      { count: todayVisits },
      { count: unclaimedRewards },
      { count: newCustomersThisMonth },
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
    ]);

    return {
      success: true,
      data: {
        totalCustomers: totalCustomers || 0,
        todayVisits: todayVisits || 0,
        unclaimedRewards: unclaimedRewards || 0,
        newCustomersThisMonth: newCustomersThisMonth || 0,
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
}

export async function getCustomerList(query: string): Promise<ApiResponse<CustomerListItem[]>> {
  try {
    const admin = await getAdminSession();
    if (!admin) {
      return { success: false, error: '관리자 로그인이 필요합니다.' };
    }

    const supabase = createAdminClient();

    let request = supabase
      .from('customers')
      .select('id, customer_number, name, phone, visit_count, created_at')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(100);

    const trimmed = query.trim();
    if (trimmed) {
      // or() 필터 문법에서 구분자로 쓰이는 문자는 제거해 필터 인젝션을 방지합니다.
      const safe = trimmed.replace(/[,()]/g, '');
      request = request.or(
        `name.ilike.%${safe}%,phone.ilike.%${safe}%,customer_number.ilike.%${safe}%`
      );
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
    }));

    return { success: true, data: result };
  } catch (error) {
    console.error('getCustomerList 오류:', error);
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
