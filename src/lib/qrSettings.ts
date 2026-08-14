import { randomBytes } from 'crypto';
import { createAdminClient } from '@/lib/supabase/admin';

export interface StoreQrSettings {
  id: string;
  storeId: string;
  token: string;
  /** 이 매장의 QR이 최초로 발급된 시각 */
  createdAt: string;
  /** 가장 최근 재발급 시각. 재발급한 적이 없으면 null */
  lastReissuedAt: string | null;
}

function generateToken(): string {
  return randomBytes(24).toString('hex');
}

/**
 * 특정 매장의 현재 활성 QR 토큰 정보를 가져옵니다. 없으면(그 매장 최초 발급) 새로 만듭니다.
 * store_qr_tokens는 재발급마다 새 행을 추가하고 이전 것은 is_active=false로 바꾸는 방식이라,
 * "생성일"은 그 매장의 가장 오래된 행 기준, "최근 재발급일"은 활성 행이 최초 행과 다를 때만 채웁니다.
 */
export async function getOrCreateStoreQrSettings(storeId: string): Promise<StoreQrSettings> {
  const supabase = createAdminClient();

  const { data: active } = await supabase
    .from('store_qr_tokens')
    .select('id, store_id, token, created_at')
    .eq('store_id', storeId)
    .eq('is_active', true)
    .maybeSingle();

  if (active) {
    const { data: oldest } = await supabase
      .from('store_qr_tokens')
      .select('created_at')
      .eq('store_id', storeId)
      .order('created_at', { ascending: true })
      .limit(1)
      .single();

    const createdAt = oldest?.created_at ?? active.created_at;
    const isReissued = createdAt !== active.created_at;

    return {
      id: active.id,
      storeId: active.store_id,
      token: active.token,
      createdAt,
      lastReissuedAt: isReissued ? active.created_at : null,
    };
  }

  const { data: inserted } = await supabase
    .from('store_qr_tokens')
    .insert({ store_id: storeId, token: generateToken(), is_active: true })
    .select('id, store_id, token, created_at')
    .single();

  return {
    id: inserted!.id,
    storeId: inserted!.store_id,
    token: inserted!.token,
    createdAt: inserted!.created_at,
    lastReissuedAt: null,
  };
}

/**
 * 특정 매장의 QR을 새로 발급합니다. 저장되는 순간 그 매장의 기존 QR은 즉시 무효화됩니다.
 */
export async function reissueStoreQrToken(
  storeId: string
): Promise<{ before: StoreQrSettings; after: StoreQrSettings }> {
  const supabase = createAdminClient();
  const before = await getOrCreateStoreQrSettings(storeId);

  await supabase
    .from('store_qr_tokens')
    .update({ is_active: false })
    .eq('store_id', storeId)
    .eq('is_active', true);

  const { data: inserted } = await supabase
    .from('store_qr_tokens')
    .insert({ store_id: storeId, token: generateToken(), is_active: true })
    .select('id, store_id, token, created_at')
    .single();

  const after: StoreQrSettings = {
    id: inserted!.id,
    storeId: inserted!.store_id,
    token: inserted!.token,
    createdAt: before.createdAt,
    lastReissuedAt: inserted!.created_at,
  };

  return { before, after };
}

/**
 * 토큰 값으로 매장을 식별합니다. (proxy에서 방문객 요청마다 호출)
 * 활성 토큰이 아니면(재발급되어 무효화된 옛 QR 등) null을 반환합니다.
 */
export async function getStoreIdByActiveToken(token: string): Promise<string | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from('store_qr_tokens')
    .select('store_id')
    .eq('token', token)
    .eq('is_active', true)
    .maybeSingle();

  return data?.store_id ?? null;
}
