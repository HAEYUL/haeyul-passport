/**
 * 고객용 화면 전용 매장별 강조색입니다. (관리자 화면은 storeColors.ts를 따로 씁니다)
 * 가입 첫 화면과 여권 화면에서 같은 색을 써서 매장을 눈에 익게 합니다.
 */
export interface StoreAccent {
  border: string;
  bg: string;
  text: string;
}

/** 고객 화면에서 세 매장을 나열할 때의 순서 */
export const STORE_NAMES = ['해율만두전골', '곤드레밥집', '정담명가 남원추어탕'] as const;

export const STORE_ACCENTS: Record<string, StoreAccent> = {
  '해율만두전골': { border: '#2D5A3D', bg: '#F1F8F3', text: '#1F4A2E' },
  '곤드레밥집': { border: '#2B5D8A', bg: '#EEF5FB', text: '#204A6E' },
  '정담명가 남원추어탕': { border: '#A8551F', bg: '#FBF1E7', text: '#8A4517' },
};

export const DEFAULT_STORE_ACCENT: StoreAccent = { border: '#8C8C80', bg: '#F5F5EC', text: '#44443C' };
