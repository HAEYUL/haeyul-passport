// 회원가입 테스트 결과 확인
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function verify() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  console.log('=== 2단계 테스트 결과 확인 ===\n');

  // 새로 가입된 고객 확인
  const { data: customers } = await supabase
    .from('customers')
    .select('customer_number, name, phone, visit_count, created_at')
    .order('created_at', { ascending: false })
    .limit(3);

  console.log('최근 고객 목록:');
  customers?.forEach(c => {
    console.log(`  ${c.customer_number} | ${c.name} | ${c.phone} | 방문 ${c.visit_count}회`);
  });

  // 동의 기록 확인
  const { data: consents } = await supabase
    .from('consent_logs')
    .select('consent_type, consented, consented_at')
    .order('consented_at', { ascending: false })
    .limit(3);

  console.log('\n최근 동의 기록:');
  consents?.forEach(c => {
    console.log(`  ${c.consent_type} | 동의: ${c.consented}`);
  });

  // 오늘 방문 기록 확인
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Seoul' });
  const { data: visits } = await supabase
    .from('visits')
    .select('visit_date, is_cancelled, customer_id')
    .eq('visit_date', today);

  console.log(`\n오늘(${today}) 방문 기록: ${visits?.length || 0}건`);

  // 중복가입 테스트
  console.log('\n--- 중복가입 방지 테스트 ---');
  const { error: dupError } = await supabase
    .from('customers')
    .insert({
      customer_number: '',
      name: '중복테스트',
      phone: '010-1111-0001', // 이미 존재하는 번호
    });
  
  if (dupError) {
    console.log('✅ 중복가입 차단됨:', dupError.message.includes('duplicate') ? '전화번호 중복' : dupError.message);
  } else {
    console.log('❌ 중복가입이 허용됨 (문제!)');
  }

  console.log('\n=== 테스트 완료 ===');
}

verify().catch(console.error);
