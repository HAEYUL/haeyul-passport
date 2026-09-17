import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'crypto';
import type { Customer, CustomerRow } from '@/types/database';

/**
 * 고객 개인정보(이름·전화번호·생년월일) 암호화
 * - AES-256-GCM으로 암호화해 저장하고, 화면/로직에서 필요할 때만 복호화합니다.
 * - 전화번호는 로그인·중복가입 확인을 위해 HMAC-SHA256 해시(hashPhoneForLookup)를
 *   별도 컬럼(phone_hash)에 함께 저장합니다 — 이 해시는 복호화가 불가능하므로
 *   암호화 키가 유출되어도 해시만으로는 원문 전화번호를 복원할 수 없습니다.
 */

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const VERSION = 'v1';

function getEncryptionKey(): Buffer {
  const raw = process.env.PII_ENCRYPTION_KEY;
  if (!raw) {
    throw new Error('PII_ENCRYPTION_KEY 환경변수가 설정되지 않았습니다.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) {
    throw new Error('PII_ENCRYPTION_KEY는 32바이트(base64 인코딩)여야 합니다.');
  }
  return key;
}

function getHashKey(): Buffer {
  const raw = process.env.PII_HASH_KEY;
  if (!raw) {
    throw new Error('PII_HASH_KEY 환경변수가 설정되지 않았습니다.');
  }
  return Buffer.from(raw, 'base64');
}

/** 이름·전화번호·생년월일 등 개인정보를 암호화합니다. */
export function encryptPII(plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VERSION}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

/** encryptPII로 암호화된 값을 원문으로 복호화합니다. */
export function decryptPII(ciphertext: string): string {
  const parts = ciphertext.split(':');
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error('암호화된 값의 형식이 올바르지 않습니다.');
  }
  const [, ivB64, authTagB64, dataB64] = parts;
  const decipher = createDecipheriv(ALGORITHM, getEncryptionKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagB64, 'base64'));
  const decrypted = Buffer.concat([decipher.update(Buffer.from(dataB64, 'base64')), decipher.final()]);
  return decrypted.toString('utf8');
}

/** null일 수 있는 값(생년월일 등)을 위한 복호화 헬퍼 */
export function decryptPIIOrNull(ciphertext: string | null): string | null {
  return ciphertext ? decryptPII(ciphertext) : null;
}

/**
 * 전화번호를 정확 일치 조회·중복가입 확인·UNIQUE 제약용 해시로 변환합니다.
 * normalizePhone()을 거친 값(예: '010-1234-5678')을 그대로 넣어야 로그인 시
 * 계산한 해시와 가입 시 저장한 해시가 항상 일치합니다.
 */
export function hashPhoneForLookup(normalizedPhone: string): string {
  return createHmac('sha256', getHashKey()).update(normalizedPhone).digest('hex');
}

/** DB에서 읽은 암호화된 원본 row를 화면/로직에서 쓰는 복호화된 Customer로 변환합니다. */
export function decryptCustomerRow(row: CustomerRow): Customer {
  return {
    id: row.id,
    customer_number: row.customer_number,
    name: decryptPII(row.name_enc),
    phone: decryptPII(row.phone_enc),
    birth_date: decryptPIIOrNull(row.birth_date_enc),
    marketing_consent: row.marketing_consent,
    visit_count: row.visit_count,
    is_active: row.is_active,
    admin_note: row.admin_note,
    signup_store_id: row.signup_store_id,
    referral_source: row.referral_source,
    referral_source_detail: row.referral_source_detail,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
