/**
 * 관리자 화면 전용 매장별 색상 매핑입니다.
 * 고객용 화면(STORE_ACCENTS, PassportHome.tsx)과는 별개의 색상 배정입니다.
 */
export interface StoreColorSet {
  /** 좌측 강조선, 선택된 필터 버튼 배경, 매장명 텍스트 등에 쓰는 진한 색 */
  border: string;
  /** 카드/배지 옅은 배경색 */
  bg: string;
  /** 옅은 배경 위에 올리는 진한 텍스트 색 (border와 동일하게 써도 AA 대비 통과) */
  text: string;
}

export const STORE_ADMIN_COLORS: Record<string, StoreColorSet> = {
  '해율만두전골': { border: '#2D5A3D', bg: '#EAF4EC', text: '#1F4A2E' },
  '정담명가 남원추어탕': { border: '#2B5D8A', bg: '#EAF2FA', text: '#1B4A73' },
  '곤드레밥집': { border: '#B3261E', bg: '#FBEAEA', text: '#8A241A' },
};

export const DEFAULT_STORE_ADMIN_COLOR: StoreColorSet = {
  border: '#6B6B5E',
  bg: '#F0EFE9',
  text: '#44443C',
};

export function getStoreAdminColor(storeName: string): StoreColorSet {
  return STORE_ADMIN_COLORS[storeName] ?? DEFAULT_STORE_ADMIN_COLOR;
}
