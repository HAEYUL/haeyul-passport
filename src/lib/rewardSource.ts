import type { RewardSource } from '@/types/database';

/** 할인권 종류 이름 (관리자 화면·백업 파일 등) */
export const REWARD_SOURCE_LABEL: Record<RewardSource, string> = {
  visit: '방문 할인권',
  birthday: '생일 쿠폰',
  comeback: '컴백 쿠폰',
  all_stores: '세 매장 완주 선물',
  signup: '가입 축하 할인권',
};

/** 목록 옆에 괄호로 붙이는 짧은 이름. 방문 할인권은 기준 방문 횟수로 표시합니다. */
export function getRewardSourceShortLabel(source: RewardSource, thresholdVisits?: number | null): string {
  switch (source) {
    case 'birthday':
      return '생일축하';
    case 'comeback':
      return '컴백';
    case 'all_stores':
      return '세 매장 완주';
    case 'signup':
      return '가입 축하';
    default:
      return thresholdVisits ? `${thresholdVisits}회` : '방문';
  }
}
