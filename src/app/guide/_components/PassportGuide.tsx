'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getRewardCatalog, type RewardCatalogItem } from '@/app/actions';
import { getAllTiers } from '@/lib/tiers';
import BrandLogo from '@/components/BrandLogo';

const tiers = getAllTiers();

export default function PassportGuide() {
  const router = useRouter();
  const [rewards, setRewards] = useState<RewardCatalogItem[] | null>(null);

  useEffect(() => {
    getRewardCatalog().then((result) => {
      if (result.success && result.data) {
        setRewards(result.data);
      }
    });
  }, []);

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* 뒤로 가기 */}
        <button
          onClick={() => router.back()}
          className="flex items-center text-[#2D5A3D] text-base font-medium"
          type="button"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </button>

        {/* 타이틀 */}
        <header className="text-center space-y-3">
          <BrandLogo height={48} textClassName="text-lg" />
          <div>
            <h1 className="text-xl font-bold text-[#2D5A3D]">해율 여권 설명서</h1>
            <p className="mt-1 text-[15px] text-[#8C8C80]">
              방문할수록 등급이 오르고, 선물도 받으실 수 있어요.
            </p>
          </div>
        </header>

        {/* 등급 안내 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[#555]">방문 등급</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-[#E8E4DA] divide-y divide-[#F0EDE6]">
            {tiers.map((tier, i) => {
              const next = tiers[i + 1];
              const rangeText = next
                ? `${tier.minVisits}회 ~ ${next.minVisits - 1}회`
                : `${tier.minVisits}회 이상`;
              return (
                <div key={tier.key} className="flex items-center gap-3 px-4 py-3">
                  <Image src={tier.iconSrc} alt={tier.label} width={36} height={36} className="flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-[15px] font-semibold text-[#333]">{tier.label}</p>
                    <p className="text-xs text-[#AAA]">누적 방문 {rangeText}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-[#AAA] leading-relaxed">
            해율 VIP 혜택은 앞으로 추가되거나 변경될 수 있습니다.
          </p>
        </section>

        {/* 방문 선물 안내 */}
        <section className="space-y-3">
          <h2 className="text-base font-semibold text-[#555]">방문 선물</h2>
          {!rewards ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-[#E8E8E0] animate-pulse" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {rewards.map((r) => (
                <li
                  key={r.requiredVisits}
                  className="bg-white rounded-xl px-4 py-3 border border-[#F0EDE6] flex items-start gap-3"
                >
                  <span className="mt-0.5 w-12 flex-shrink-0 text-sm font-semibold text-[#2D5A3D]">
                    {r.requiredVisits}회
                  </span>
                  <div>
                    <p className="text-[15px] font-medium text-[#333]">{r.name}</p>
                    {r.description && (
                      <p className="mt-0.5 text-xs text-[#8C8C80] leading-relaxed">{r.description}</p>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          <p className="text-xs text-[#AAA] leading-relaxed">
            선물은 해당 방문 횟수를 달성하면 자동으로 선물함에 담깁니다. 사용하지 않으면 선물함에 계속
            남아있으니, 매장에서 언제든 직원에게 보여주고 사용하실 수 있습니다.
          </p>
        </section>

        <div className="pb-8" />
      </div>
    </main>
  );
}
