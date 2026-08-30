'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRewards, confirmRewardUse, type RewardItem } from '@/app/actions';
import { formatDateKR } from '@/lib/utils';

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
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [confirmingReward, setConfirmingReward] = useState<RewardItem | null>(null);

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

  async function handleConfirmUse() {
    if (!confirmingReward) return;
    const id = confirmingReward.id;

    setConfirmingReward(null);
    setActionLoadingId(id);
    setError('');

    const result = await confirmRewardUse(id);

    setActionLoadingId(null);

    if (result.success) {
      fetchRewards();
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
        </div>

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
              return (
                <li
                  key={reward.id}
                  className={`rounded-2xl p-5 space-y-3 border-2 ${
                    isUsable
                      ? 'bg-[#FFF3D6] border-[#F0D98C] shadow-sm'
                      : 'bg-[#F5F5EC] border-[#E0E0D0]'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-start gap-2">
                      <span className="text-2xl leading-none mt-0.5">🎫</span>
                      <div>
                        <p className={`text-2xl font-extrabold leading-tight ${isUsable ? 'text-[#8A5800]' : 'text-[#6B6B5E]'}`}>
                          {reward.amount.toLocaleString()}원
                        </p>
                        <p className={`mt-0.5 text-[15px] font-semibold ${isUsable ? 'text-[#8A5800]' : 'text-[#6B6B5E]'}`}>
                          {reward.source === 'birthday' ? '생일축하 쿠폰' : `${reward.thresholdVisits}회 방문 기념`}
                        </p>
                      </div>
                    </div>
                    <StatusBadge status={reward.status} isExpired={reward.isExpired} />
                  </div>

                  <p className={`text-xs font-semibold ${isUsable ? 'text-[#8A5800]' : 'text-[#6B6B5E]'}`}>
                    전 매장 사용가능 <span className="font-normal">(단, 포장은 할인권 사용이 불가합니다.)</span>
                  </p>

                  <div className={`text-sm font-medium space-y-0.5 border-t pt-2 ${isUsable ? 'border-[#F0D98C] text-[#7A5B10]' : 'border-[#E0E0D0] text-[#6B6B5E]'}`}>
                    <p>
                      발급일: {formatDateKR(reward.issuedAt)}
                      {reward.issuedStoreName && ` · ${reward.issuedStoreName}`}
                    </p>
                    {reward.status === 'used' && reward.usedAt && (
                      <p>
                        사용일: {formatDateKR(reward.usedAt)}
                        {reward.usedStoreName && ` · ${reward.usedStoreName}`}
                      </p>
                    )}
                  </div>

                  {isUsable && (
                    <button
                      onClick={() => setConfirmingReward(reward)}
                      disabled={actionLoadingId === reward.id}
                      className="w-full min-h-[52px] py-3 px-4 bg-[#2D5A3D] text-white text-base font-bold rounded-xl
                                 shadow-sm hover:bg-[#245032] active:scale-[0.98]
                                 transition-all duration-200 disabled:bg-[#999] disabled:cursor-not-allowed"
                    >
                      {actionLoadingId === reward.id ? '처리 중...' : '직원확인'}
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <div className="pb-8" />
      </div>

      {/* 할인권 사용 확인 모달 */}
      {confirmingReward && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-6 py-8">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-5 shadow-lg">
            <div className="space-y-2">
              <p className="text-xl font-bold text-[#2D5A3D]">
                {confirmingReward.amount.toLocaleString()}원 할인권을 사용하시겠습니까?
              </p>
              <p className="text-[15px] font-medium text-[#7A4A16] bg-[#FFF3E4] border border-[#EAC28E] rounded-xl px-4 py-3">
                사용 후에는 취소할 수 없습니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setConfirmingReward(null)}
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
