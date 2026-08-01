// Supabase 연결 테스트 스크립트
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

async function test() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  console.log('=== Supabase 연결 테스트 ===');
  console.log('URL:', url ? url.substring(0, 30) + '...' : '❌ 없음');
  console.log('Key:', key ? '✅ 설정됨 (' + key.length + '자)' : '❌ 없음');

  if (!url || !key) {
    console.log('❌ 환경변수가 설정되지 않았습니다.');
    return;
  }

  const supabase = createClient(url, key);

  // 테이블 존재 확인
  const { data: tables, error: tableError } = await supabase
    .from('dining_tables')
    .select('*');

  if (tableError) {
    console.log('❌ dining_tables 조회 실패:', tableError.message);
    console.log('');
    console.log('👉 SQL Editor에서 마이그레이션 SQL을 아직 실행하지 않았다면,');
    console.log('   supabase/migrations/001_initial_schema.sql 내용을');
    console.log('   Supabase SQL Editor에 붙여넣고 Run을 클릭하세요.');
  } else {
    console.log('✅ dining_tables:', tables.length + '개 테이블');
    tables.forEach(t => console.log('   -', t.floor, t.table_name));
  }

  // 고객 확인
  const { data: customers, error: custError } = await supabase
    .from('customers')
    .select('name, phone, visit_count');

  if (custError) {
    console.log('❌ customers 조회 실패:', custError.message);
  } else {
    console.log('✅ customers:', customers.length + '명');
    customers.forEach(c => console.log('   -', c.name, c.phone, '방문', c.visit_count + '회'));
  }

  // 직원 확인
  const { data: employees, error: empError } = await supabase
    .from('employees')
    .select('name, is_active');

  if (empError) {
    console.log('❌ employees 조회 실패:', empError.message);
  } else {
    console.log('✅ employees:', employees.length + '명');
    employees.forEach(e => console.log('   -', e.name, e.is_active ? '활성' : '비활성'));
  }

  console.log('');
  console.log('=== 테스트 완료 ===');
}

test().catch(console.error);
