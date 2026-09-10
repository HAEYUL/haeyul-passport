import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MANAGEMENT_APP_ORIGINS = new Set([
  'https://ai-management-system-blush.vercel.app',
  'https://haeyul-ai-office.haeyul.chatgpt.site',
]);
const MANAGEMENT_AUTH_URL = 'https://qmdyemgxqlztdogtavxe.supabase.co';
const MANAGEMENT_AUTH_PUBLISHABLE_KEY = 'sb_publishable_Y7rzcvFCtThD8Mxp3SFawQ_mYiC127y';
const MANAGEMENT_OWNER_USER_ID = 'b98985f4-8e4f-45d5-9fc4-bf511558c135';

type CustomerRow = {
  id: string;
  created_at: string;
  visit_count: number;
  signup_store_id: string | null;
};

type VisitRow = {
  customer_id: string;
  store_id: string;
  visit_date: string;
};

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get('origin');
  return origin && MANAGEMENT_APP_ORIGINS.has(origin)
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        Vary: 'Origin',
      }
    : {};
}

async function isAuthorized(request: Request) {
  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return false;

  const response = await fetch(`${MANAGEMENT_AUTH_URL}/auth/v1/user`, {
    headers: {
      apikey: MANAGEMENT_AUTH_PUBLISHABLE_KEY,
      authorization,
    },
    cache: 'no-store',
  });

  if (!response.ok) return false;
  const user = await response.json() as { id?: string };
  return user.id === MANAGEMENT_OWNER_USER_ID;
}

function getKstDateParts() {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const today = formatter.format(new Date());
  return { today, monthStart: `${today.slice(0, 7)}-01` };
}

function subtractDays(dateString: string, days: number) {
  const date = new Date(`${dateString}T00:00:00+09:00`);
  date.setUTCDate(date.getUTCDate() - days);
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export async function GET(request: Request) {
  const headers = corsHeaders(request);
  if (!await isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }

  try {
    const supabase = createAdminClient();
    const { today, monthStart } = getKstDateParts();

    const [storesResult, customersResult, visitsResult, rewardsResult] = await Promise.all([
      supabase.from('stores').select('id, name').order('name'),
      supabase
        .from('customers')
        .select('id, created_at, visit_count, signup_store_id')
        .eq('is_active', true),
      supabase
        .from('visits')
        .select('customer_id, store_id, visit_date')
        .eq('is_cancelled', false),
      supabase
        .from('customer_rewards')
        .select('status, issued_at, used_at, issued_store_id, used_store_id')
        .not('reward_rule_id', 'is', null),
    ]);

    const firstError = storesResult.error
      || customersResult.error
      || visitsResult.error
      || rewardsResult.error;
    if (firstError) throw firstError;

    const stores = storesResult.data ?? [];
    const customers = (customersResult.data ?? []) as CustomerRow[];
    const visits = (visitsResult.data ?? []) as VisitRow[];
    const rewards = rewardsResult.data ?? [];
    const lastVisitByCustomer = new Map<string, string>();

    for (const visit of visits) {
      const current = lastVisitByCustomer.get(visit.customer_id);
      if (!current || visit.visit_date > current) {
        lastVisitByCustomer.set(visit.customer_id, visit.visit_date);
      }
    }

    const longAbsentCount = (days: number) => {
      const cutoff = subtractDays(today, days);
      return customers.filter((customer) => {
        const lastVisit = lastVisitByCustomer.get(customer.id);
        return !lastVisit || lastVisit < cutoff;
      }).length;
    };

    const storeStats = stores.map((store) => ({
      id: store.id,
      name: store.name,
      todayVisits: visits.filter((visit) => visit.store_id === store.id && visit.visit_date === today).length,
      totalVisits: visits.filter((visit) => visit.store_id === store.id).length,
      newCustomersThisMonth: customers.filter((customer) => (
        customer.signup_store_id === store.id && customer.created_at.slice(0, 10) >= monthStart
      )).length,
    }));

    return Response.json({
      generatedAt: new Date().toISOString(),
      summary: {
        totalCustomers: customers.length,
        repeatCustomers: customers.filter((customer) => customer.visit_count >= 2).length,
        todayVisits: visits.filter((visit) => visit.visit_date === today).length,
        newCustomersThisMonth: customers.filter((customer) => customer.created_at.slice(0, 10) >= monthStart).length,
        vipCount: customers.filter((customer) => customer.visit_count >= 30).length,
        rewardsIssuedThisMonth: rewards.filter((reward) => reward.issued_at?.slice(0, 10) >= monthStart).length,
        rewardsUsedThisMonth: rewards.filter((reward) => reward.status === 'used' && reward.used_at?.slice(0, 10) >= monthStart).length,
        longAbsent30Days: longAbsentCount(30),
        longAbsent60Days: longAbsentCount(60),
        longAbsent90Days: longAbsentCount(90),
      },
      stores: storeStats,
    }, {
      headers: {
        ...headers,
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    console.error('management-stats 오류:', error);
    return Response.json({ error: '통계를 불러오지 못했습니다.' }, { status: 500, headers });
  }
}

export function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}
