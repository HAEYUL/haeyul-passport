// 기존 고객 데이터(name/phone/birth_date, 평문)를 읽어 암호화된 컬럼
// (name_enc/phone_enc/birth_date_enc/phone_hash)을 채우는 1회성 백필 스크립트.
//
// 실행 전 준비:
//   1) supabase/migrations/022_encrypt_customer_pii.sql 을 Supabase에 먼저 적용
//   2) .env.local 에 PII_ENCRYPTION_KEY, PII_HASH_KEY 를 설정
//      (README의 "개인정보 암호화 키 생성" 안내 참고)
//   3) NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY 가 .env.local 에 있어야 함
//
// 실행: node scripts/encrypt-existing-pii.mjs
//
// 이미 채워진 행(phone_enc가 있는 행)은 건너뛰므로 여러 번 실행해도 안전합니다
// (중간에 실패해도 다시 실행하면 이어서 진행됩니다).

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { createCipheriv, createHmac, randomBytes } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION = 'v1';
const BATCH_SIZE = 200;

function getEncryptionKey() {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) throw new Error('PII_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('PII_ENCRYPTION_KEY는 32바이트(base64)여야 합니다.');
  return key;
}

function getHashKey() {
  const raw = process.env.PII_HASH_KEY;
  if (!raw) throw new Error('PII_HASH_KEY 환경변수가 설정되지 않았습니다.');
  return Buffer.from(raw, 'base64');
}

function encryptPII(plaintext) {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

function hashPhoneForLookup(normalizedPhone) {
  return createHmac('sha256', getHashKey()).update(normalizedPhone).digest('hex');
}

function createAdminClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Supabase 환경변수가 설정되지 않았습니다. .env.local 파일을 확인하세요.');
  }
  return createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function main() {
  const supabase = createAdminClient();
  let totalDone = 0;
  let totalFailed = 0;

  for (;;) {
    const { data: rows, error } = await supabase
      .from('customers')
      .select('id, name, phone, birth_date')
      .is('phone_enc', null)
      .limit(BATCH_SIZE);

    if (error) {
      console.error('조회 실패:', error.message);
      process.exit(1);
    }

    if (!rows || rows.length === 0) break;

    for (const row of rows) {
      try {
        const { error: updateError } = await supabase
          .from('customers')
          .update({
            name_enc: encryptPII(row.name),
            phone_enc: encryptPII(row.phone),
            phone_hash: hashPhoneForLookup(row.phone),
            birth_date_enc: row.birth_date ? encryptPII(row.birth_date) : null,
          })
          .eq('id', row.id);

        if (updateError) {
          console.error(`고객 ${row.id} 업데이트 실패:`, updateError.message);
          totalFailed += 1;
        } else {
          totalDone += 1;
        }
      } catch (err) {
        console.error(`고객 ${row.id} 처리 중 오류:`, err instanceof Error ? err.message : err);
        totalFailed += 1;
      }
    }

    console.log(`진행 중... 누적 완료 ${totalDone}건, 실패 ${totalFailed}건`);
  }

  console.log(`\n백필 완료. 성공 ${totalDone}건, 실패 ${totalFailed}건.`);
  if (totalFailed > 0) {
    console.log('실패한 건이 있습니다. 이 스크립트를 다시 실행하면 실패한 건만 재시도합니다(단, 위 오류 원인을 먼저 확인하세요).');
    process.exit(1);
  }

  const { count } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .is('phone_enc', null);
  console.log(`검증: phone_enc가 비어있는 고객 수 = ${count ?? 0} (0이어야 정상입니다)`);
}

main().catch((err) => {
  console.error('백필 스크립트 실행 중 오류:', err);
  process.exit(1);
});
