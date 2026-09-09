/**
 * 해율 자연의 흐름 전자여권 — 가입 유입 경로
 * 가입 시 고객에게 해율을 알게 된 경로를 선택(선택 사항)받아 저장합니다.
 */

export type ReferralSourceKey = 'signboard' | 'online' | 'ai' | 'sns' | 'referral' | 'other';

export interface ReferralSourceOption {
  key: ReferralSourceKey;
  label: string;
}

// 가입 폼과 관리자 화면에서 공통으로 사용하는 순서/문구입니다.
export const REFERRAL_SOURCE_OPTIONS: ReferralSourceOption[] = [
  { key: 'signboard', label: '간판/외관' },
  { key: 'online', label: '온라인(네이버/구글 등)' },
  { key: 'ai', label: 'AI(챗GPT/클로드 등)' },
  { key: 'sns', label: 'SNS(유튜브/인스타 등)' },
  { key: 'referral', label: '지인/가족 소개' },
  { key: 'other', label: '기타' },
];

export function isReferralSourceKey(value: string): value is ReferralSourceKey {
  return REFERRAL_SOURCE_OPTIONS.some((o) => o.key === value);
}

export function getReferralSourceLabel(key: ReferralSourceKey | null): string | null {
  if (!key) return null;
  return REFERRAL_SOURCE_OPTIONS.find((o) => o.key === key)?.label ?? null;
}
