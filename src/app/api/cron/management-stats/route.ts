import { createAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';

const MANAGEMENT_APP_ORIGINS = new Set([
  'https://ai-management-system-blush.vercel.app',
  'https://haeyul-ai-office.haeyul.chatgpt.site',
]);
const MANAGEMENT_AUTH_URL = 'https://qmdyemgxqlztdogtavxe.supabase.co';
const MANAGEMENT_AUTH_PUBLISHABLE_KEY = 'sb_publishable_Y7rzcvFCtThD8Mxp3SFawQ_mYiC127y';
const MANAGEMENT_OWNER_USER_ID = 'b98985f4-8e4f-45d5-9fc4-bf511558c135';

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
  return { today };
}

export async function GET(request: Request) {
  const headers = corsHeaders(request);
  if (!await isAuthorized(request)) {
    return Response.json({ error: 'Unauthorized' }, { status: 401, headers });
  }

  try {
    const supabase = createAdminClient();
    const { today } = getKstDateParts();

    // 전체 고객·방문·할인권을 가져와 세면 1,000건 제한에 걸려 숫자가 틀리므로
    // DB 함수(admin_management_stats)에서 바로 집계한 결과만 받아옵니다.
    const { data, error } = await supabase.rpc('admin_management_stats', { p_today: today });
    if (error) throw error;
    const stats = data as { summary: Record<string, number>; stores: unknown[] };

    return Response.json({
      generatedAt: new Date().toISOString(),
      summary: stats.summary,
      stores: stats.stores,
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
