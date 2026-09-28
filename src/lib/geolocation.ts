/**
 * 브라우저 Geolocation API 래퍼 (클라이언트 컴포넌트 전용).
 * 위치 정보를 가져오지 못하는 모든 경우(권한 거부/미지원/타임아웃/기타 오류)를
 * 하나의 실패로 취급합니다 — 서버에서는 좌표가 있는지 없는지만 구분하면 되기 때문입니다.
 */

export interface GeoCoords {
  latitude: number;
  longitude: number;
}

export interface GeoAttemptResult {
  coords: GeoCoords | null;
  /** 위치 권한 팝업 응답을 기다리다 상한 시간이 지나 포기했는지 */
  gaveUp?: boolean;
}

const DEFAULT_TIMEOUT_MS = 8000;
// 브라우저의 timeout은 손님이 위치 권한 팝업에 답한 뒤부터 세기 시작합니다.
// 팝업에 답하지 않고 두면 영원히 기다리게 되므로, 전체 대기 시간에 상한을 둡니다.
const PERMISSION_WAIT_LIMIT_MS = 30000;

export function getCurrentPosition(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<GeoAttemptResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve({ coords: null });
      return;
    }

    let settled = false;
    const finish = (result: GeoAttemptResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(limitTimer);
      resolve(result);
    };
    const limitTimer = setTimeout(() => finish({ coords: null, gaveUp: true }), PERMISSION_WAIT_LIMIT_MS);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        finish({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
      },
      () => {
        // 권한 거부, 위치 정보 사용 불가, 타임아웃 등 — 모두 "확인 안 됨"으로 처리
        finish({ coords: null });
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 0 }
    );
  });
}

/**
 * 첫 시도가 실패하면 한 번 더 시도합니다.
 * 사용자가 권한 팝업에 응답하기 전에 첫 시도가 타임아웃되는 경우가 흔한데,
 * 그사이 권한이 허용되었다면 재시도에서 곧바로 좌표를 받아올 수 있습니다.
 */
export async function getCurrentPositionWithRetry(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<GeoAttemptResult> {
  const first = await getCurrentPosition(timeoutMs);
  // 성공했거나, 팝업에 답이 없어 이미 오래 기다렸다면 다시 시도하지 않습니다.
  if (first.coords || first.gaveUp) return first;
  return getCurrentPosition(timeoutMs);
}
