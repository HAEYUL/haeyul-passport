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
          <h2 className="text-2xl font-extrabold text-[#2D5A3D]">전자여권이 발급되었습니다</h2>
          <div className="text-[17px] font-medium text-[#333331] leading-relaxed space-y-3">
            <p>
              <span className="font-extrabold text-[#2D5A3D]">{data.customer.name}</span> 고객님
            </p>
            <p>
              해율 자연의 흐름 전자여권이<br />
              발급되었습니다.
            </p>
            <p>
              오늘의 자연이 첫 번째 기록으로<br />
              남았습니다.
            </p>
            <p className="text-[#55534A]">
              자연의 흐름을 함께해 주셔서<br />
              감사합니다.
            </p>
          </div>
        </div>

        {/* 등급 카드 (초록 계열) */}
        <div className="bg-[#E9F3EC] border-2 border-[#BFE0C8] rounded-2xl p-6 flex items-center justify-between">
          <div className="text-left">
            <p className="text-[15px] font-semibold text-[#1F4A2E]">현재 등급</p>
            <p className="text-2xl font-extrabold text-[#1F4A2E] leading-tight">{tier.label}</p>
          </div>
          <div className="text-right">
            <p className="text-[15px] font-semibold text-[#1F4A2E]">총 방문</p>
            <p className="text-2xl font-extrabold text-[#1F4A2E] leading-tight">
              {data.customer.visit_count}<span className="text-base">회</span>
            </p>
          </div>
        </div>

        {/* 다음 혜택까지 카드 (주황/노랑 계열) */}
        {tier.isMaxTier ? (
          <div className="bg-[#FFF3D6] border-2 border-[#F0D98C] rounded-2xl p-5">
            <p className="text-[17px] font-bold text-[#8A5800] leading-relaxed">{VIP_MESSAGE}</p>
          </div>
        ) : (
          <div className="bg-[#FFF3D6] border-2 border-[#F0D98C] rounded-2xl p-5 flex items-center justify-between">
            <span className="text-[17px] font-bold text-[#8A5800]">다음 등급까지</span>
            <span className="text-xl font-extrabold text-[#8A5800]">{tier.visitsUntilNext}회 남음</span>
          </div>
        )}

        <button
          onClick={() => {
            window.location.href = '/passport';
          }}
          className="w-full min-h-[56px] py-4 px-6 bg-[#2D5A3D] text-white text-lg font-bold rounded-2xl
                     shadow-md hover:bg-[#245032] active:scale-[0.98]
                     transition-all duration-200"
        >
          확인
        </button>

        <button
          onClick={() => {
            window.location.href = '/guide';
          }}
          className="min-h-[48px] px-4 text-base font-bold text-[#2D5A3D] underline"
          type="button"
        >
          여권 설명서 보기
        </button>
      </div>
    </main>
  );
}
