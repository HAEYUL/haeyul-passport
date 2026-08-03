import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

const SETTINGS_KEY = 'visit_qr';

export interface QrSettings {
  id: string | null;
  token: string;
  createdAt: string;
  lastReissuedAt: string | null;
}

function generateToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * 현재 활성화된 방문 QR 토큰 정보를 가져옵니다. app_settings에 값이 없으면
 * (최초 실행) 새 토큰을 만들어 저장합니다.
 */
export async function getOrCreateQrSettings(): Promise<QrSettings> {
  const supabase = createAdminClient();

  const { data } = await supabase
    .from('app_settings')
    .select('id, value')
    .eq('key', SETTINGS_KEY)
    .maybeSingle();

  if (data) {
    try {
      const parsed = JSON.parse(data.value) as Omit<QrSettings, 'id'>;
      return { ...parsed, id: data.id };
    } catch {
      // 저장된 값이 손상된 경우 아래에서 새로 생성합니다.
    }
  }

  const fresh: Omit<QrSettings, 'id'> = {
    token: generateToken(),
    createdAt: new Date().toISOString(),
    lastReissuedAt: null,
  };

  const { data: inserted } = await supabase
    .from('app_settings')
    .upsert({ key: SETTINGS_KEY, value: JSON.stringify(fresh) }, { onConflict: 'key' })
    .select('id')
    .single();

  return { ...fresh, id: inserted?.id ?? null };
}

/**
 * QR 토큰을 새로 발급합니다. 저장되는 순간 기존 토큰은 즉시 무효화됩니다.
 */
export async function reissueQrToken(adminId: string): Promise<{ before: QrSettings; after: QrSettings }> {
  const supabase = createAdminClient();
  const before = await getOrCreateQrSettings();

  const after: Omit<QrSettings, 'id'> = {
    token: generateToken(),
    createdAt: before.createdAt,
    lastReissuedAt: new Date().toISOString(),
  };

  const { data: updated } = await supabase
    .from('app_settings')
    .upsert(
      { key: SETTINGS_KEY, value: JSON.stringify(after), updated_by: adminId },
      { onConflict: 'key' }
    )
    .select('id')
    .single();

  return { before, after: { ...after, id: updated?.id ?? before.id } };
}

/**
 * 현재 활성 토큰 값만 필요할 때 사용합니다. (proxy에서 방문객 요청마다 호출)
 */
export async function getActiveQrToken(): Promise<string> {
  const settings = await getOrCreateQrSettings();
  return settings.token;
}
