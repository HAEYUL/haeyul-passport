/**
 * 위치 확인(QR 부정 스캔 방지) 관련 순수 계산 유틸.
 * 서버 액션에서 최종 판정을 내릴 때 사용하며, 클라이언트 좌표는 참고값일 뿐
 * 실제 반경 판정은 항상 이 서버 측 계산으로 확정합니다.
 */

const EARTH_RADIUS_METERS = 6371000;

/** 두 좌표 사이의 거리를 하버사인 공식으로 계산합니다 (단위: 미터). */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

export type LocationVerifiedStatus = 'success' | 'failed' | 'unavailable';

export interface LocationVerificationResult {
  status: LocationVerifiedStatus;
  distanceMeters: number | null;
}

interface StoreLocation {
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
}

/**
 * 클라이언트가 보낸 좌표와 매장 좌표를 비교해 반경 이내인지 판정합니다.
 * 클라이언트 좌표가 없거나(권한 거부·미지원) 매장에 좌표가 설정되지 않은 경우
 * 등록을 막지 않도록 'unavailable'을 반환합니다.
 */
export function verifyLocation(
  clientLat: number | null,
  clientLng: number | null,
  store: StoreLocation
): LocationVerificationResult {
  if (clientLat == null || clientLng == null || Number.isNaN(clientLat) || Number.isNaN(clientLng)) {
    return { status: 'unavailable', distanceMeters: null };
  }
  if (store.latitude == null || store.longitude == null) {
    return { status: 'unavailable', distanceMeters: null };
  }

  const distanceMeters = Math.round(
    haversineDistanceMeters(clientLat, clientLng, store.latitude, store.longitude)
  );

  return {
    status: distanceMeters <= store.radius_meters ? 'success' : 'failed',
    distanceMeters,
  };
}
