'use client';

import { useState, useEffect, useCallback, type ReactNode } from 'react';
import Image from 'next/image';
import { getRewards, confirmRewardsUse, type RewardItem } from '@/app/actions';
import { formatDateKR } from '@/lib/utils';
import { getTierUpDefinition } from '@/lib/tiers';
import { MAX_REWARDS_PER_PAYMENT, MAX_DISCOUNT_PERCENT_PER_TABLE } from '@/lib/constants';

/**
 * 할인권 카드를 종류별로 다르게 보이게 하기 위한 스타일 세트.
 * 일반 방문 쿠폰(노랑) / 생일 선물(핑크) / 등급 업그레이드 선물(그린)을 시각적으로 구분합니다.
 */
const REWARD_CARD_STYLES = {
  visit: {
    usableBg: 'bg-[#FFF3D6] border-[#F0D98C] shadow-sm',
    accentText: 'text-[#8A5800]',
    borderTop: 'border-[#F0D98C]',
    subText: 'text-[#7A5B10]',
  },
  birthday: {
    usableBg: 'bg-[#FDEAF0] border-[#F3B8CE] shadow-sm',
    accentText: 'text-[#B23A63]',
    borderTop: 'border-[#F3B8CE]',
    subText: 'text-[#9C3358]',
  },
  tierUp: {
    usableBg: 'bg-[#E9F3EC] border-[#BFE0C8] shadow-sm',
    accentText: 'text-[#1F4A2E]',
    borderTop: 'border-[#BFE0C8]',
    subText: 'text-[#1F4A2E]',
  },
  comeback: {
    usableBg: 'bg-[#FFEADB] border-[#F0BE94] shadow-sm',
    accentText: 'text-[#B2560C]',
    borderTop: 'border-[#F0BE94]',
    subText: 'text-[#9C4A0A]',
  },
  allStores: {
    usableBg: 'bg-[#EEF5FB] border-[#A9C8E4] shadow-sm',
    accentText: 'text-[#204A6E]',
    borderTop: 'border-[#A9C8E4]',
    subText: 'text-[#204A6E]',
  },
} as const;

function getRewardLabel(reward: RewardItem): { text: string; icon: ReactNode; kind: keyof typeof REWARD_CARD_STYLES } {
  if (reward.source === 'birthday') {
    return { text: '생일 축하 선물', icon: <span className="text-2xl leading-none mt-0.5">🎂</span>, kind: 'birthday' };
  }
  if (reward.source === 'all_stores') {
    return { text: '세 매장 완주 선물', icon: <span className="text-2xl leading-none mt-0.5">🏅</span>, kind: 'allStores' };
  }
  if (reward.source === 'comeback') {
    return { text: '다시 만나 반가워요 선물', icon: <span className="text-2xl leading-none mt-0.5">🧡</span>, kind: 'comeback' };
  }
  const tier = getTierUpDefinition(reward.thresholdVisits);
  if (tier) {
    return {
      text: `${tier.label} 등급 업그레이드 축하 선물`,
      icon: <Image src={tier.iconSrc} alt="" width={28} height={28} className="mt-0.5" />,
      kind: 'tierUp',
    };
  }
  return { text: `${reward.thresholdVisits}회 방문 기념`, icon: <span className="text-2xl leading-none mt-0.5">🎫</span>, kind: 'visit' };
}

function StatusBadge({ status, isExpired }: { status: RewardItem['status']; isExpired: boolean }) {
  if (status === 'used') {
    return (
      <span className="flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-bold bg-white text-[#6B6B5E] border-2 border-[#D4D0C8]">
        사용 완료
      </span>
    );
  }
  if (isExpired) {
    return (
      <span className="flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-bold bg-white text-[#6B6B5E] border-2 border-[#D4D0C8]">
        유효기간경과
      </span>
    );
  }
  return (
    <span className="flex-shrink-0 whitespace-nowrap px-3 py-1.5 rounded-full text-sm font-bold bg-[#8A5800] text-white">
      사용 가능
    </span>
  );
}

export default function RewardsList() {
  const [rewards, setRewards] = useState<RewardItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [doneMessage, setDoneMessage] = useState('');
  // 한 번 결제에 쓸 할인권 (최대 MAX_REWARDS_PER_PAYMENT장) — 고른 뒤 직원 확인 한 번으로 처리합니다.
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [confirming, setConfirming] = useState(false);

  const fetchRewards = useCallback(async () => {
    const result = await getRewards();
    if (result.success && result.data) {
      setRewards(result.data);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchRewards();
  }, [fetchRewards]);

  function goBack() {
    window.location.href = '/passport';
  }

  function toggleSelect(id: string) {
    setError('');
    setDoneMessage('');
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < MAX_REWARDS_PER_PAYMENT ? [...prev, id] : prev
    );
  }

  const selectedRewards = (rewards || []).filter((r) => selectedIds.includes(r.id));
  const selectedTotal = selectedRewards.reduce((sum, r) => sum + r.amount, 0);

  async function handleConfirmUse() {
    if (selectedIds.length === 0) return;

    setConfirming(false);
    setSubmitting(true);
    setError('');

    const result = await confirmRewardsUse(selectedIds);

    setSubmitting(false);

    if (result.success) {
      setDoneMessage(result.message || `✓ 할인권 ${selectedIds.length}장(${selectedTotal.toLocaleString()}원) 사용이 완료되었습니다.`);
      setSelectedIds([]);
      fetchRewards();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setError(result.error || '처리 중 오류가 발생했습니다.');
    }
  }

  if (loading) {
    return (
      <main className="flex flex-col min-h-screen px-6 py-8">
        <div className="w-full max-w-sm mx-auto space-y-4">
          <div className="w-32 h-6 rounded bg-[#E8E8E0] animate-pulse" />
          <div className="space-y-3">
            {[1, 2].map((i) => (
              <div key={i} className="w-full h-28 rounded-2xl bg-[#E8E8E0] animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* 뒤로 가기 */}
        <button
          onClick={goBack}
          className="flex items-center min-h-[44px] text-[#2D5A3D] text-base font-bold"
          type="button"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </button>

        {/* 타이틀 */}
        <div>
          <h1 className="text-2xl font-bold text-[#2D5A3D]">내 할인권함</h1>
          <p className="mt-1 text-[15px] font-medium text-[#55534A]">
            해율만두전골 · 곤드레밥집 · 정담명가 남원추어탕 어느 매장에서든 사용하실 수 있습니다.
          </p>
          <p className="mt-1 text-[15px] font-bold text-[#8A5800]">
            사용할 할인권을 골라 직원에게 보여주세요.
          </p>
        </div>

        {doneMessage && (
          <div className="bg-[#F0F7F2] border-2 border-[#8FC49F] text-[#1F4A2E] px-5 py-4 rounded-2xl text-[17px] font-bold leading-relaxed">
            {doneMessage}
          </div>
        )}

        {error && (
          <div className="bg-[#FFF3E4] border-2 border-[#EAC28E] text-[#7A4A16] px-5 py-4 rounded-2xl text-[17px] font-medium leading-relaxed whitespace-pre-line">
            {error}
          </div>
        )}

        {/* 할인권 목록 */}
        {!rewards || rewards.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
            <p className="text-[17px] font-medium text-[#44443C] leading-relaxed">
              아직 받은 할인권이 없습니다.<br />
              방문을 계속하시면 할인권을 받으실 수 있어요.
            </p>
          </div>
        ) : (
          <ul className="space-y-4">
            {rewards.map((reward) => {
              const isUsable = reward.status !== 'used' && !reward.isExpired;
              const isSelected = selectedIds.includes(reward.id);
              const selectionFull = !isSelected && selectedIds.length >= MAX_REWARDS_PER_PAYMENT;
              const { text: rewardLabel, icon: rewardIcon, kind } = getRewardLabel(reward);
              const style = REWARD_CARD_STYLES[kind];
              return (
                <li
                  key={reward.id}
                  className={`rounded-2xl p-5 space-y-3 border-2 ${
                    isUsable ? style.usableBg : 'bg-[#F5F5EC] border-[#E0E0D0]'
                  } ${isSelected ? 'ring-4 ring-[#2D5A3D] ring-offset-2' : ''}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      {rewardIcon}
                      <div>
                        <p className={`text-2xl font-extrabold leading-tight ${isUsable ? style.accentText : 'text-[#6B6B5E]'}`}>
                          {reward.amount.toLocaleString()}원
                        </p>
                        <p className={`mt-0.5 text-[15px] font-semibold ${isUsable ? style.accentText : 'text-[#6B6B5E]'}`}>
                          {rewardLabel}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={reward.status} isExpired={reward.isExpired} />
                  </div>

                  <p className={`text-sm font-semibold ${isUsable ? style.accentText : 'text-[#6B6B5E]'}`}>
                    세 매장 어디서나 사용 <span className="font-normal">(포장은 사용 불가)</span>
                  </p>

                  <div className={`text-sm font-medium space-y-0.5 border-t pt-2 ${isUsable ? `${style.borderTop} ${style.subText}` : 'border-[#E0E0D0] text-[#6B6B5E]'}`}>
                    <p>
                      발급일: {formatDateKR(reward.issuedAt)}
                      {reward.issuedStoreName && ` · ${reward.issuedStoreName}`}
                    </p>
                    {isUsable && <p>유효기간: {formatDateKR(reward.expiresAt)}까지</p>}
                    {reward.status === 'used' && reward.usedAt && (
                      <p>
                        사용일: {formatDateKR(reward.usedAt)}
                        {reward.usedStoreName && ` · ${reward.usedStoreName}`}
                      </p>
                    )}
                  </div>

                  {isUsable && (
                    <button
                      type="button"
                      onClick={() => toggleSelect(reward.id)}
                      disabled={submitting || selectionFull}
                      aria-pressed={isSelected}
                      className={`w-full min-h-[52px] py-3 px-4 text-base font-bold rounded-xl
                                 active:scale-[0.98] transition-all duration-200 disabled:cursor-not-allowed ${
                                   isSelected
                                     ? 'bg-[#2D5A3D] text-white shadow-sm'
                                     : 'bg-white text-[#2D5A3D] border-2 border-[#2D5A3D] disabled:opacity-40'
                                 }`}
                    >
                      {isSelected ? '✓ 선택됨 (다시 누르면 취소)' : selectionFull ? `${MAX_REWARDS_PER_PAYMENT}장까지 고를 수 있어요` : '이 할인권 사용하기'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        {/* 아래 고정 바에 가려지지 않도록 여백 */}
        <div className={selectedIds.length > 0 ? 'pb-32' : 'pb-8'} />
      </div>

      {/* 고른 할인권 — 직원 확인 한 번으로 처리 */}
      {selectedIds.length > 0 && !confirming && (
        <div className="fixed inset-x-0 bottom-0 z-40 bg-white border-t-2 border-[#E0DCD0] shadow-[0_-4px_16px_rgba(0,0,0,0.08)] px-5 py-4">
          <div className="w-full max-w-sm mx-auto space-y-2">
            <p className="text-center text-[17px] font-bold text-[#2D5A3D]">
              {selectedIds.length}장 선택 · 합계 {selectedTotal.toLocaleString()}원
            </p>
            <p className="text-center text-sm font-semibold text-[#7A4A16]">
              1인 {MAX_REWARDS_PER_PAYMENT}장까지 · 테이블당 결제 금액의 {MAX_DISCOUNT_PERCENT_PER_TABLE}%까지
            </p>
            <button
              type="button"
              onClick={() => setConfirming(true)}
              disabled={submitting}
              className="w-full min-h-[56px] bg-[#2D5A3D] text-white text-lg font-bold rounded-xl shadow-md
                         hover:bg-[#245032] active:scale-[0.98] transition-all duration-200 disabled:bg-[#999]"
            >
              {submitting ? '처리 중...' : '직원확인'}
            </button>
          </div>
        </div>
      )}

      {/* 할인권 사용 확인 모달 */}
      {confirming && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-6 py-8">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-5 shadow-lg">
            <div className="space-y-2">
              {/* 직원이 결제 금액과 바로 비교할 수 있게 사용 합계를 가장 크게 보여줍니다 */}
              <div className="rounded-xl bg-[#F0F7F2] border-2 border-[#8FC49F] px-4 py-3 text-center">
                <p className="text-[15px] font-bold text-[#1F4A2E]">사용 할인권 합계</p>
                <p className="text-3xl font-extrabold text-[#1F4A2E]">{selectedTotal.toLocaleString()}원</p>
                <p className="mt-1 text-[15px] font-bold text-[#8A4517]">
                  할인은 테이블당 결제 금액의 {MAX_DISCOUNT_PERCENT_PER_TABLE}%까지 가능해요
                </p>
              </div>
              <p className="text-lg font-bold text-[#2D5A3D]">
                할인권 {selectedIds.length}장을 사용하시겠습니까?
              </p>
              <ul className="space-y-1 text-[15px] font-semibold text-[#44443C]">
                {selectedRewards.map((r) => (
                  <li key={r.id}>
                    · {r.amount.toLocaleString()}원 {getRewardLabel(r).text}
                  </li>
                ))}
              </ul>
              <p className="text-[15px] font-medium text-[#7A4A16] bg-[#FFF3E4] border border-[#EAC28E] rounded-xl px-4 py-3">
                사용 후에는 취소할 수 없습니다.<br />
                1인 {MAX_REWARDS_PER_PAYMENT}장까지 사용할 수 있어요.<br />
                포장 주문에는 사용할 수 없어요.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="flex-1 min-h-[52px] py-3 px-4 bg-white text-[#55534A] text-base font-bold rounded-xl
                           border-2 border-[#D4D0C8] active:scale-[0.98] transition-all duration-200"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleConfirmUse}
                className="flex-1 min-h-[52px] py-3 px-4 bg-[#2D5A3D] text-white text-base font-bold rounded-xl
                           shadow-sm hover:bg-[#245032] active:scale-[0.98] transition-all duration-200"
              >
                사용 확정
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
