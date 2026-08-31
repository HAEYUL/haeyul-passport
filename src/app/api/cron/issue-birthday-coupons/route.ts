import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/sms';
import { getTodayKST } from '@/lib/utils';
import { BIRTHDAY_COUPON_AMOUNT, BIRTHDAY_COUPON_VALID_DAYS, AUDIT_ACTION } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * 매일 1회 실행되는 생일축하 쿠폰 자동 발급 배치.
 * vercel.json의 크론 설정이 매일 00:00 UTC(=한국시간 09:00)에 이 경로를 호출합니다.
 *
 * CRON_SECRET 환경변수를 설정해두면 Vercel이 크론 요청의 Authorization 헤더에
 * 자동으로 그 값을 담아 보내므로, 여기서 대조해 외부의 무단 호출을 막습니다.
 * (설정 방법: Vercel 프로젝트 환경변수에 CRON_SECRET을 추가하면 별도 코드
 * 변경 없이 바로 적용됩니다.)
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

    const { data: birthdayRule } = await supabase
      .from('reward_rules')
      .select('id')
      .eq('is_birthday', true)
      .eq('is_active', true)
      .maybeSingle();

    if (!birthdayRule) {
      return NextResponse.json({ issued: 0, message: '생일축하 쿠폰 규칙이 없습니다.' });
    }

    const todayKST = getTodayKST();
    const [, month, day] = todayKST.split('-');

    const { data: candidates, error: candidatesError } = await supabase
      .from('customers')
      .select('id, phone, birth_date')
      .eq('is_active', true)
      .not('birth_date', 'is', null);

    if (candidatesError) {
      return NextResponse.json({ error: candidatesError.message }, { status: 500 });
    }

    const todaysBirthdayCustomers = (candidates || []).filter((c) => {
      const [, m, d] = (c.birth_date as string).split('-');
      return m === month && d === day;
    });

    if (todaysBirthdayCustomers.length === 0) {
      return NextResponse.json({ issued: 0 });
    }

    const currentYear = new Date().getFullYear();
    const customerIds = todaysBirthdayCustomers.map((c) => c.id);

    const { data: alreadyIssued } = await supabase
      .from('customer_rewards')
      .select('customer_id')
      .eq('source', 'birthday')
      .eq('birthday_year', currentYear)
      .in('customer_id', customerIds);

    const alreadyIssuedIds = new Set((alreadyIssued || []).map((r) => r.customer_id));
    const toIssue = todaysBirthdayCustomers.filter((c) => !alreadyIssuedIds.has(c.id));

    if (toIssue.length === 0) {
      return NextResponse.json({ issued: 0, skipped: todaysBirthdayCustomers.length });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + BIRTHDAY_COUPON_VALID_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const rows = toIssue.map((c) => ({
      customer_id: c.id,
      reward_rule_id: birthdayRule.id,
      amount: BIRTHDAY_COUPON_AMOUNT,
      status: 'available' as const,
      issued_at: now.toISOString(),
      expires_at: expiresAt,
      source: 'birthday' as const,
      birthday_year: currentYear,
    }));

    const { error: insertError } = await supabase.from('customer_rewards').insert(rows);
    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const receivers = toIssue.map((c) => (c.phone as string).replace(/\D/g, ''));
    const message = `[해율푸드] 생일을 진심으로 축하드립니다! 🎂 저희 마음을 담아 ${BIRTHDAY_COUPON_AMOUNT.toLocaleString()}원 생일 축하 선물을 준비했어요. 전자여권 '내 할인권함'에서 확인해 주세요. (유효기간 ${BIRTHDAY_COUPON_VALID_DAYS}일)`;

    let smsSuccessCount: number | null = null;
    try {
      const smsResult = await sendSms({ receivers, message });
      smsSuccessCount = smsResult.successCount;
    } catch (smsError) {
      console.error('생일축하 쿠폰 SMS 발송 실패:', smsError);
    }

    await supabase.from('audit_logs').insert({
      admin_id: null,
      action: AUDIT_ACTION.BIRTHDAY_COUPON_ISSUE,
      target_type: 'system',
      target_id: null,
      before_data: null,
      after_data: {
        issuedCount: toIssue.length,
        smsSuccessCount,
        customerIds: toIssue.map((c) => c.id),
        message,
      },
      reason: `${todayKST} 생일축하 쿠폰 자동 발급`,
    });

    return NextResponse.json({ issued: toIssue.length, skipped: alreadyIssuedIds.size, smsSuccessCount });
  } catch (error) {
    console.error('issue-birthday-coupons 오류:', error);
    return NextResponse.json({ error: '서버 오류가 발생했습니다.' }, { status: 500 });
  }
}
