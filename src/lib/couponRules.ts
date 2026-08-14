/**
 * 방문 횟수별 할인권(쿠폰) 지급 규칙 계산 유틸리티.
 * 실제 발급은 DB 트리거(auto_issue_reward, compute_coupon_instances)가 담당하며,
 * 이 파일은 화면 표시(다음 할인권 안내, 관리자 규칙 미리보기 등)에서 같은 계산을
 * 반복하지 않도록 순수 함수로 제공합니다. DB 트리거와 로직을 반드시 동일하게 유지하세요.
 */

export interface RewardRuleInput {
  id: string;
  thresholdVisits: number;
  amount: number;
  isRepeating: boolean;
  repeatInterval: number | null;
}

export interface CouponInstance {
  ruleId: string;
  /** 이 할인권이 해당하는 방문 횟수 기준 (예: 반복 규칙의 25) */
  thresholdVisits: number;
  amount: number;
}

/**
 * 누적 방문 횟수를 기준으로, 지금까지 지급되었어야 할 할인권 목록을 전부 계산합니다.
 * 방문 횟수 기준 오름차순으로 반환합니다.
 */
export function computeEarnedCoupons(visitCount: number, rules: RewardRuleInput[]): CouponInstance[] {
  const result: CouponInstance[] = [];

  for (const rule of rules) {
    if (rule.isRepeating) {
      const interval = rule.repeatInterval ?? 0;
      if (interval <= 0) continue;
      for (let n = rule.thresholdVisits; n <= visitCount; n += interval) {
        result.push({ ruleId: rule.id, thresholdVisits: n, amount: rule.amount });
      }
    } else if (rule.thresholdVisits <= visitCount) {
      result.push({ ruleId: rule.id, thresholdVisits: rule.thresholdVisits, amount: rule.amount });
    }
  }

  return result.sort((a, b) => a.thresholdVisits - b.thresholdVisits);
}

export interface NextCouponInfo {
  /** 다음 할인권까지 남은 방문 횟수 */
  visitsRemaining: number;
  /** 다음 할인권 금액(원) */
  amount: number;
}

/**
 * 다음 할인권까지 남은 방문 횟수와 예정 금액을 계산합니다. 더 받을 할인권이 없으면 null.
 */
export function getNextCouponInfo(visitCount: number, rules: RewardRuleInput[]): NextCouponInfo | null {
  let best: { threshold: number; amount: number } | null = null;

  for (const rule of rules) {
    if (rule.isRepeating) {
      const interval = rule.repeatInterval ?? 0;
      if (interval <= 0) continue;
      let n = rule.thresholdVisits;
      while (n <= visitCount) n += interval;
      if (!best || n < best.threshold) best = { threshold: n, amount: rule.amount };
    } else if (rule.thresholdVisits > visitCount) {
      if (!best || rule.thresholdVisits < best.threshold) best = { threshold: rule.thresholdVisits, amount: rule.amount };
    }
  }

  if (!best) return null;
  return { visitsRemaining: best.threshold - visitCount, amount: best.amount };
}
