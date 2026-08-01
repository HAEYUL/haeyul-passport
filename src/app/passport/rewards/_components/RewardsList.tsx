'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRewards, confirmRewardUse, type RewardItem } from '@/app/actions';
import { formatDateKR } from '@/lib/utils';

function StatusBadge({ status }: { status: RewardItem['status'] }) {
  if (status === 'used') {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F5F5EC] text-[#8C8C80] border border-[#E0E0D0]">
        사용 완료
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FFFDF0] text-[#B8860B] border border-[#E8D88C]">
      사용 가능
    </span>
  );
}

export default function RewardsList() {
  const [rewards, setRewards] = useState<RewardItem[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);
  const [error, setError] = useState('');

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

  async function handleConfirm(id: string) {
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
          className="flex items-center text-[#2D5A3D] text-base font-medium"
          type="button"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </button>

        {/* 타이틀 */}
        <h1 className="text-2xl font-bold text-[#2D5A3D]">내 선물함</h1>

        {error && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-5 py-4 rounded-2xl text-[15px] leading-relaxed whitespace-pre-line">
            {error}
          </div>
        )}

        {/* 선물 목록 */}
        {!rewards || rewards.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
            <p className="text-[15px] text-[#8C8C80] leading-relaxed">
              아직 받은 선물이 없습니다.<br />
              방문을 계속하시면 선물을 받으실 수 있어요.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {rewards.map((reward) => (
              <li
                key={reward.id}
                className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA] space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-lg font-bold text-[#2D5A3D]">{reward.rewardName}</p>
                    {reward.description && (
                      <p className="mt-1 text-sm text-[#8C8C80] leading-relaxed">
                        {reward.description}
                      </p>
                    )}
                  </div>
                  <StatusBadge status={reward.status} />
                </div>

                <div className="text-xs text-[#AAA] space-y-0.5">
                  <p>발급일: {formatDateKR(reward.issuedAt)}</p>
                  {reward.status === 'used' && reward.usedAt && (
                    <p>사용일: {formatDateKR(reward.usedAt)}</p>
                  )}
                </div>

                {reward.status !== 'used' && (
                  <button
                    onClick={() => handleConfirm(reward.id)}
                    disabled={actionLoadingId === reward.id}
                    className="w-full py-3 px-4 bg-[#2D5A3D] text-white text-base font-semibold rounded-xl
                               shadow-sm hover:bg-[#245032] active:scale-[0.98]
                               transition-all duration-200 disabled:bg-[#999] disabled:cursor-not-allowed"
                  >
                    {actionLoadingId === reward.id ? '처리 중...' : '직원확인'}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}

        <div className="pb-8" />
      </div>
    </main>
  );
}
