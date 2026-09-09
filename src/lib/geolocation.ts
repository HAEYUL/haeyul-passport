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
}

const DEFAULT_TIMEOUT_MS = 8000;

export function getCurrentPosition(timeoutMs = DEFAULT_TIMEOUT_MS): Promise<GeoAttemptResult> {
  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !('geolocation' in navigator)) {
      resolve({ coords: null });
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
          },
        });
      },
      () => {
        // 권한 거부, 위치 정보 사용 불가, 타임아웃 등 — 모두 "확인 안 됨"으로 처리
        resolve({ coords: null });
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
  if (first.coords) return first;
  return getCurrentPosition(timeoutMs);
}
