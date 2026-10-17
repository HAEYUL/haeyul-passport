/**
 * 고객용 화면 전용 매장 표시 정보(강조색·짧은 이름·소개 문구·매장 페이지 주소)입니다.
 * (관리자 화면 색상은 storeColors.ts를 따로 씁니다)
 * 가입 첫 화면·환영 화면·여권 화면에서 같은 색과 문구를 써서 매장을 눈에 익게 합니다.
 */
export interface StoreAccent {
  border: string;
  bg: string;
  text: string;
}

/**
 * 지금 해율여권을 쓰는 매장 — 고객 화면에는 이 매장들만, 이 순서로 보입니다.
 * 해율만두전골에서 먼저 시범 운영하고, 정담명가·곤드레밥집을 차례로 여기에 추가합니다.
 * 세 매장 모두: ['해율만두전골', '곤드레밥집', '정담명가 남원추어탕']
 */
export const STORE_NAMES: readonly string[] = ['해율만두전골'];

/**
 * 한 매장만 운영 중인지 — true면 세 매장 도장 칸·완주 선물·다른 매장 소개를 숨기고
 * 그 매장 기준 문구를 보여줍니다. 매장을 추가하면 세 매장 화면이 그대로 다시 나타납니다.
 */
export const IS_SINGLE_STORE = STORE_NAMES.length === 1;

/** 고객 화면 머리 문구 (가입 첫 화면·여권 홈) */
export const BRAND_SUBTITLE = IS_SINGLE_STORE ? '자연의 흐름을 맛으로 전하다' : '해율푸드의 세 가지 건강한 한식';

export const STORE_ACCENTS: Record<string, StoreAccent> = {
  '해율만두전골': { border: '#2D5A3D', bg: '#F1F8F3', text: '#1F4A2E' },
  '곤드레밥집': { border: '#2B5D8A', bg: '#EEF5FB', text: '#204A6E' },
  '정담명가 남원추어탕': { border: '#A8551F', bg: '#FBF1E7', text: '#8A4517' },
};

export const DEFAULT_STORE_ACCENT: StoreAccent = { border: '#8C8C80', bg: '#F5F5EC', text: '#44443C' };

/**
 * 좁은 칸(세 매장 도장)에 쓰는 짧은 매장 이름.
 * 글씨를 크게 설정한 휴대폰에서 줄이 바뀌어야 할 때 "해율 / 만두전골"처럼
 * 자연스러운 자리에서만 바뀌도록 줄바꿈 가능 위치(\u200B)를 넣어 둡니다.
 */
export const STORE_SHORT_NAMES: Record<string, string> = {
  '해율만두전골': '해율\u200B만두전골',
  '곤드레밥집': '곤드레\u200B밥집',
  '정담명가 남원추어탕': '정담명가',
};

/** 매장 목록에서 이름 아래 붙이는 한 줄 소개 */
export const STORE_MEAL_LABELS: Record<string, string> = {
  '해율만두전골': '🍲 뜨끈한 버섯 만두전골',
  '곤드레밥집': '🍚 정갈한 곤드레 한 상',
  '정담명가 남원추어탕': '🥣 든든한 추어탕 한 그릇',
};

/** 해율푸드 홈페이지 첫 화면 (세 매장 둘러보기) */
export const HOMEPAGE_URL = 'https://haeyul-homepage.vercel.app/';

/** 해율푸드 홈페이지의 매장별 소개 페이지 */
export const STORE_PAGE_URLS: Record<string, string> = {
  '해율만두전골': 'https://haeyul-homepage.vercel.app/haeyul',
  '곤드레밥집': 'https://haeyul-homepage.vercel.app/gondre',
  '정담명가 남원추어탕': 'https://haeyul-homepage.vercel.app/chueotang',
};
