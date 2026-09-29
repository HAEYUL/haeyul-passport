import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { sendSms } from '@/lib/sms';
import { getTodayKST, addMonthsClampedToDateString } from '@/lib/utils';
import { BIRTHDAY_COUPON_AMOUNT, BIRTHDAY_COUPON_VALID_MONTHS, AUDIT_ACTION } from '@/lib/constants';

export const dynamic = 'force-dynamic';

/**
 * 생일축하 쿠폰 자동 발급 배치.
 *
 * ※ 초기 운영에서는 발급 보류 중 — vercel.json 크론에서 빼 두어 자동 실행되지 않습니다.
 *   다시 시작할 때는 vercel.json crons에 아래 항목을 추가하세요 (00:00 UTC = 한국시간 09:00).
 *     { "path": "/api/cron/issue-birthday-coupons", "schedule": "0 0 * * *" }
 *   재개 전 확인할 것: 고객 조회 1,000건 제한(페이지 나눠 읽기 필요), 문자 발송 방식
 *   (현재 문자는 관리자가 엑셀 명단으로 알리고에서 직접 보냄), 손님 화면의 생일 혜택 안내 문구 복구,
 *   customer_rewards.issued_store_id가 NOT NULL이라 발급 매장(예: 가입 매장)을 함께 넣어야 저장됨.
 *
 * CRON_SECRET 환경변수를 설정해두면 Vercel이 크론 요청의 Authorization 헤더에
 * 자동으로 그 값을 담아 보내므로, 여기서 대조해 외부의 무단 호출을 막습니다.
 * (설정 방법: Vercel 프로젝트 환경변수에 CRON_SECRET을 추가하면 별도 코드
 * 변경 없이 바로 적용됩니다.)
 */
export async function GET(request: Request) {
  // CRON_SECRET이 설정돼 있고 일치할 때만 실행합니다. (설정이 없으면 누구도 실행할 수 없게 막습니다)
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
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
    const [yearStr, month, day] = todayKST.split('-');
    // 2월 29일생은 윤년이 아닌 해에는 2월 28일에 함께 발급합니다.
    const year = Number(yearStr);
    const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
    const includeFeb29 = month === '02' && day === '28' && !isLeapYear;

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
      return (m === month && d === day) || (includeFeb29 && m === '02' && d === '29');
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
    // 발급일(한국 날짜)로부터 1개월 되는 날의 밤 23:59:59(KST)까지 사용 가능
    // 예: 3월 5일 발급 → 4월 5일까지. 다음 달에 같은 날이 없으면 그 달 말일까지.
    const expiryDateKST = addMonthsClampedToDateString(getTodayKST(), BIRTHDAY_COUPON_VALID_MONTHS);
    const expiresAt = new Date(`${expiryDateKST}T23:59:59+09:00`).toISOString();
    const [, expiryMonth, expiryDay] = expiryDateKST.split('-').map(Number);

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
    const message = `[해율푸드] 생일을 진심으로 축하드립니다! 🎂 저희 마음을 담아 ${BIRTHDAY_COUPON_AMOUNT.toLocaleString()}원 생일 축하 선물을 준비했어요. 방문여권 '내 할인권함'에서 확인해 주세요. (${expiryMonth}월 ${expiryDay}일까지 사용 가능)`;

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
