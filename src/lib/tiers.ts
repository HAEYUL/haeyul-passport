/**
 * 해율 자연의 흐름 전자여권 — 방문 등급
 * 누적 방문 횟수로부터 그때그때 계산하는 값이라 DB에 별도 저장하지 않습니다.
 */

export type VisitTierKey = 'sprout' | 'leaf' | 'tree' | 'forest' | 'vip';

export interface TierDefinition {
  key: VisitTierKey;
  label: string;
  minVisits: number;
  iconSrc: string;
  description: string;
}

// 낮은 등급부터 순서대로 정의합니다.
const TIER_DEFINITIONS: TierDefinition[] = [
  { key: 'sprout', label: '새싹', minVisits: 1, iconSrc: '/tiers/sprout.svg', description: '자연과 첫 인연을 시작한 고객' },
  { key: 'leaf', label: '푸른잎', minVisits: 5, iconSrc: '/tiers/leaf.svg', description: '해율푸드를 다시 찾아주시는 고객' },
  { key: 'tree', label: '나무', minVisits: 10, iconSrc: '/tiers/tree.svg', description: '해율푸드와 함께 자라가는 단골 고객' },
  { key: 'forest', label: '숲', minVisits: 20, iconSrc: '/tiers/forest.svg', description: '해율푸드의 소중한 동행' },
  { key: 'vip', label: '해율푸드 VIP', minVisits: 30, iconSrc: '/tiers/vip.svg', description: '가장 오랜 시간 자연을 함께한 고객' },
];

export const VIP_MESSAGE =
  '해율푸드 VIP가 되셨습니다. 오랜 시간 자연의 흐름을 함께해 주셔서 감사합니다.';

/** VIP 등급 달성(30회) 이후, 31회부터 계속 보여줄 문구 */
export const VIP_ONGOING_MESSAGE =
  '오랜 시간 함께해 주신 해율푸드 VIP 고객님, 늘 감사한 마음으로 자연을 전합니다.';

/**
 * 등급 안내(여권 설명서 등)에서 쓰기 위한 전체 등급 목록.
 * 낮은 등급부터 순서대로 반환합니다.
 */
export function getAllTiers(): TierDefinition[] {
  return TIER_DEFINITIONS.map((t) => ({ ...t }));
}

export interface VisitTierInfo {
  key: VisitTierKey;
  label: string;
  iconSrc: string;
  minVisits: number;
  /** 다음 등급까지 남은 방문 횟수. 최고 등급(해율푸드 VIP)이면 null. */
  visitsUntilNext: number | null;
  /** 다음 등급 이름. 최고 등급(해율푸드 VIP)이면 null. */
  nextTierLabel: string | null;
  /** 현재 등급 구간 내 진행률(0~100). 최고 등급이면 100. */
  progressPercent: number;
  isMaxTier: boolean;
}

/**
 * 누적 방문 횟수로 현재 방문 등급 정보를 계산합니다.
 * 방문 0회(가입만 하고 아직 방문 기록이 없는 경우)에도 안전하게 '새싹' 기준으로 표시합니다.
 */
export function getVisitTierInfo(visitCount: number): VisitTierInfo {
  const safeVisits = Math.max(0, visitCount);

  let currentIndex = 0;
  for (let i = 0; i < TIER_DEFINITIONS.length; i++) {
    if (safeVisits >= TIER_DEFINITIONS[i].minVisits) {
      currentIndex = i;
    }
  }

  const current = TIER_DEFINITIONS[currentIndex];
  const next = TIER_DEFINITIONS[currentIndex + 1] ?? null;

  if (!next) {
    return {
      key: current.key,
      label: current.label,
      iconSrc: current.iconSrc,
      minVisits: current.minVisits,
      visitsUntilNext: null,
      nextTierLabel: null,
      progressPercent: 100,
      isMaxTier: true,
    };
  }

  const rangeStart = current.minVisits;
  const rangeEnd = next.minVisits;
  const progressPercent = Math.min(
    100,
    Math.max(0, ((safeVisits - rangeStart) / (rangeEnd - rangeStart)) * 100)
  );

  return {
    key: current.key,
    label: current.label,
    iconSrc: current.iconSrc,
    minVisits: current.minVisits,
    visitsUntilNext: Math.max(0, next.minVisits - safeVisits),
    nextTierLabel: next.label,
    progressPercent,
    isMaxTier: false,
  };
}
