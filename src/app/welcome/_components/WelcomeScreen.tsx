'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getPassportData, type PassportData } from '@/app/actions';
import { STORE_NAMES } from '@/lib/storeAccents';
import StoreStamps from '@/components/passport/StoreStamps';
import StoreMealList from '@/components/passport/StoreMealList';

/**
 * 가입 직후 한 번 보이는 환영 화면
 * 첫 기록 축하 → 받을 수 있는 할인권 → 아직 안 가본 두 매장 소개 → 내 여권 보기
 */
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

  const { tier, nextCoupon, allStoresGiftAmount } = data;
  const visitCounts = Object.fromEntries(data.storeVisitBreakdown.map((s) => [s.storeName, s.count]));
  const firstStoreName = data.todayVisitedStoreNames[0] ?? data.storeName;
  const otherStores = STORE_NAMES.filter((name) => (visitCounts[name] ?? 0) === 0);

  return (
    <main className="flex flex-col min-h-screen px-5 py-8">
      <div className="w-full max-w-sm mx-auto space-y-4">
        {/* 첫 기록 축하 */}
        <div className="text-center space-y-3">
          <div className="w-16 h-16 mx-auto rounded-full bg-[#2D5A3D] flex items-center justify-center shadow-lg">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-2xl font-extrabold text-[#2D5A3D]">방문여권이 발급되었어요</h1>
          <p className="text-[17px] font-medium text-[#333331] leading-relaxed">
            <span className="font-extrabold text-[#2D5A3D]">{data.customer.name}</span> 고객님, 반갑습니다.
            {firstStoreName && (
              <>
                <br />
                {firstStoreName} 첫 방문이 기록되었어요.
              </>
            )}
          </p>
        </div>

        {/* 등급 + 세 매장 도장 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border-2 border-[#A8A296] space-y-3">
          <div className="flex items-center gap-3">
            <Image src={tier.iconSrc} alt="" width={44} height={44} />
            <p className="text-lg font-bold text-[#1F4A2E]">
              {tier.label} · {data.customer.visit_count <= 1 ? '첫 번째 방문' : `총 ${data.customer.visit_count}회 방문`}
            </p>
          </div>
          <StoreStamps counts={visitCounts} todayStoreNames={data.todayVisitedStoreNames} />
        </section>

        {/* 받을 수 있는 할인권 */}
        <section className="bg-[#FFF3D6] border-2 border-[#DFBE5C] rounded-2xl p-4 space-y-1.5">
          {nextCoupon && (
            <p className="text-[17px] font-bold text-[#8A5800]">
              🎫 {nextCoupon.visitsRemaining}번 더 오시면 {nextCoupon.amount.toLocaleString()}원 할인권
            </p>
          )}
          {allStoresGiftAmount && !data.allStoresGiftReceived && (
            <p className="text-[17px] font-bold text-[#204A6E]">
              🏅 세 매장 모두 오시면 {allStoresGiftAmount.toLocaleString()}원 완주 선물
            </p>
          )}
          <p className="text-[15px] font-medium text-[#8A5800]">🎂 생일에도 할인권을 드려요</p>
        </section>

        {/* 아직 안 가본 매장 소개 */}
        {otherStores.length > 0 && <StoreMealList title="다음엔 이런 한 끼도 있어요" storeNames={otherStores} />}

        <button
          onClick={() => {
            window.location.href = '/passport';
          }}
          className="w-full min-h-[56px] py-4 px-6 bg-[#2D5A3D] text-white text-lg font-bold rounded-2xl
                     shadow-md hover:bg-[#245032] active:scale-[0.98]
                     transition-all duration-200"
        >
          내 여권 보기
        </button>

        <div className="text-center">
          <Link href="/guide" className="inline-flex items-center min-h-[48px] px-4 text-base font-bold text-[#2D5A3D] underline">
            여권 안내 보기
          </Link>
        </div>
      </div>
    </main>
  );
}
