'use client';

import { useState, useEffect } from 'react';
import { getPassportData, type PassportData } from '@/app/actions';
import { VIP_MESSAGE } from '@/lib/tiers';

export default function WelcomeScreen() {
  const [data, setData] = useState<PassportData | null>(null);

  useEffect(() => {
    getPassportData().then((result) => {
      if (result.success && result.data) {
        setData(result.data);
      }
    });
  }, []);

  if (!data) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="w-16 h-16 rounded-full bg-[#E8E8E0] animate-pulse" />
        <div className="mt-4 w-40 h-6 rounded bg-[#E8E8E0] animate-pulse" />
      </main>
    );
  }

  const tier = data.tier;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <div className="w-full max-w-sm text-center space-y-8">
        {/* 성공 아이콘 */}
        <div className="w-20 h-20 mx-auto rounded-full bg-[#2D5A3D] flex items-center justify-center shadow-lg">
          <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
          </svg>
        </div>

        <div className="space-y-4">
          <h2 className="text-xl font-bold text-[#2D5A3D]">전자여권이 발급되었습니다</h2>
          <div className="text-base text-[#555] leading-relaxed space-y-3">
            <p>
              <span className="font-semibold text-[#2D5A3D]">{data.customer.name}</span> 고객님
            </p>
            <p>
              해율 자연의 흐름 전자여권이<br />
              발급되었습니다.
            </p>
            <p>
              오늘의 자연이 첫 번째 기록으로<br />
              남았습니다.
            </p>
            <p className="text-[#8C8C80]">
              자연의 흐름을 함께해 주셔서<br />
              감사합니다.
            </p>
          </div>
        </div>

        {/* 방문 정보 카드 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA]">
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-[#8C8C80]">현재 등급</span>
            <span className="text-lg font-bold text-[#2D5A3D]">{tier.label}</span>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <span className="text-[15px] text-[#8C8C80]">총 방문 횟수</span>
            <span className="text-2xl font-bold text-[#2D5A3D]">{data.customer.visit_count}회</span>
          </div>
          {tier.isMaxTier ? (
            <p className="mt-3 text-sm text-[#B8860B] leading-relaxed">{VIP_MESSAGE}</p>
          ) : (
            <div className="mt-3 flex items-center justify-between">
              <span className="text-[15px] text-[#8C8C80]">다음 등급까지</span>
              <span className="text-lg font-semibold text-[#B8860B]">{tier.visitsUntilNext}회 남음</span>
            </div>
          )}
        </div>

        <button
          onClick={() => {
            window.location.href = '/passport';
          }}
          className="w-full py-4 px-6 bg-[#2D5A3D] text-white text-lg font-semibold rounded-2xl
                     shadow-md hover:bg-[#245032] active:scale-[0.98]
                     transition-all duration-200"
        >
          확인
        </button>

        <button
          onClick={() => {
            window.location.href = '/guide';
          }}
          className="text-sm text-[#AAA] underline"
          type="button"
        >
          여권 설명서 보기
        </button>
      </div>
    </main>
  );
}
