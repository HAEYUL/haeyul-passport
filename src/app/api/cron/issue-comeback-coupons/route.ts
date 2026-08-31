import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/sms';
import { getTodayKST, subtractDaysFromDateString, toKSTDateString } from '@/lib/utils';
import { COMEBACK_ABSENCE_DAYS, COMEBACK_COUPON_AMOUNT, COMEBACK_COUPON_VALID_DAYS, AUDIT_ACTION } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * 매일 1회 실행되는 컴백(장기 미방문 복귀 유도) 쿠폰 자동 발급 배치.
 * vercel.json의 크론 설정이 매일 이 경로를 호출합니다.
 *
 * 마지막 방문일로부터 COMEBACK_ABSENCE_DAYS일이 지난 고객에게 1회 발급합니다.
 * 다시 방문해서 새 방문 기록이 생기면, 그 뒤로 또 그만큼 지나야 재발급됩니다
 * (이미 "마지막 방문 이후"에 컴백 쿠폰을 받았으면 건너뜁니다).
 *
 * CRON_SECRET 환경변수를 설정해두면 Vercel이 크론 요청의 Authorization 헤더에
 * 자동으로 그 값을 담아 보내므로, 여기서 대조해 외부의 무단 호출을 막습니다.
 */
export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  try {
    const supabase = createAdminClient();

    const { data: comebackRule } = await supabase
      .from('reward_rules')
      .select('id')
      .eq('is_comeback', true)
      .eq('is_active', true)
      .maybeSingle();

    if (!comebackRule) {
      return NextResponse.json({ issued: 0, message: '컴백 쿠폰 규칙이 없습니다.' });
    }

    const todayKST = getTodayKST();
    const cutoff = subtractDaysFromDateString(todayKST, COMEBACK_ABSENCE_DAYS);

    const { data: visits, error: visitsError } = await supabase
      .from('visits')
      .select('customer_id, visit_date')
      .eq('is_cancelled', false)
      .order('visit_date', { ascending: false });

    if (visitsError) {
      return NextResponse.json({ error: visitsError.message }, { status: 500 });
    }

    const lastVisitMap = new Map<string, string>();
    for (const v of visits || []) {
      if (!lastVisitMap.has(v.customer_id)) {
        lastVisitMap.set(v.customer_id, v.visit_date);
      }
    }

    const candidateIds = [...lastVisitMap.entries()]
      .filter(([, lastDate]) => lastDate <= cutoff)
      .map(([customerId]) => customerId);

    if (candidateIds.length === 0) {
      return NextResponse.json({ issued: 0 });
    }

    const { data: candidates, error: customersError } = await supabase
      .from('customers')
      .select('id, phone')
      .eq('is_active', true)
      .in('id', candidateIds);

    if (customersError) {
      return NextResponse.json({ error: customersError.message }, { status: 500 });
    }

    if (!candidates || candidates.length === 0) {
      return NextResponse.json({ issued: 0 });
    }

    const { data: existingComebackRewards } = await supabase
      .from('customer_rewards')
      .select('customer_id, issued_at')
      .eq('source', 'comeback')
      .in('customer_id', candidates.map((c) => c.id));

    const alreadyIssuedSinceLastVisit = new Set(
      (existingComebackRewards || [])
        .filter((r) => toKSTDateString(r.issued_at) > (lastVisitMap.get(r.customer_id) ?? ''))
        .map((r) => r.customer_id)
    );

    const toIssue = candidates.filter((c) => !alreadyIssuedSinceLastVisit.has(c.id));

    if (toIssue.length === 0) {
      return NextResponse.json({ issued: 0, skipped: candidates.length });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + COMEBACK_COUPON_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const rows = toIssue.map((c) => ({
      customer_id: c.id,
      reward_rule_id: comebackRule.id,
      amount: COMEBACK_COUPON_AMOUNT,
      status: 'available' as const,
      issued_at: now.toISOString(),
      expires_at: expiresAt,
      source: 'comeback' as const,
    }));

    const { error: insertError } = await supabase.from('customer_rewards').insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const receivers = toIssue.map((c) => (c.phone as string).replace(/\D/g, ''));
    const message = `[해율푸드] 그동안 뜸하셨네요! 다시 뵙고 싶은 마음을 담아 ${COMEBACK_COUPON_AMOUNT.toLocaleString()}원 컴백 쿠폰을 보내드렸어요. 전자여권 '내 할인권함'에서 확인해 주세요. (유효기간 ${COMEBACK_COUPON_VALID_DAYS}일)`;

    let smsSuccessCount: number | null = null;
    try {
      const smsResult = await sendSms({ receivers, message });
      smsSuccessCount = smsResult.successCount;
    } catch (smsError) {
      console.error('컴백 쿠폰 SMS 발송 실패:', smsError);
    }

    await supabase.from('audit_logs').insert({
      admin_id: null,
      action: AUDIT_ACTION.COMEBACK_COUPON_ISSUE,
      target_type: 'system',
      target_id: null,
      before_data: null,
      after_data: {
        issuedCount: toIssue.length,
        smsSuccessCount,
        customerIds: toIssue.map((c) => c.id),
        message,
      },
      reason: `${todayKST} 컴백 쿠폰 자동 발급 (마지막 방문 후 ${COMEBACK_ABSENCE_DAYS}일 이상 경과)`,
    });

    return NextResponse.json({ issued: toIssue.length, skipped: alreadyIssuedSinceLastVisit.size, smsSuccessCount });
  } catch (error) {
    console.error('issue-comeback-coupons 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
