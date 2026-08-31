'use client';

import { useState, useEffect, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getRewardCatalog, type RewardRuleCatalogItem } from '@/app/actions';
import { getAllTiers, getTierUpDefinition } from '@/lib/tiers';
import BrandLogo from '@/components/BrandLogo';

const tiers = getAllTiers();

/**
 * 방문 할인권 카드를 종류별로 다르게 보이게 하기 위한 스타일 세트.
 * 기본 방문 할인권(노랑) / 등급업 축하 할인권(그린) / VIP 축하쿠폰(퍼플)을 구분합니다.
 */
const REWARD_CATALOG_STYLES = {
  default: { bg: 'bg-[#FFF3D6] border-[#F0D98C]', accent: 'text-[#8A5800]' },
  tierUp: { bg: 'bg-[#E9F3EC] border-[#BFE0C8]', accent: 'text-[#1F4A2E]' },
  vip: { bg: 'bg-[#F1EAFB] border-[#D2BFF0]', accent: 'text-[#5B3A96]' },
} as const;

function getCatalogCardInfo(r: RewardRuleCatalogItem): {
  kind: keyof typeof REWARD_CATALOG_STYLES;
  label: string | null;
  icon: ReactNode;
} {
  if (r.isRepeating) {
    return { kind: 'vip', label: null, icon: <span className="text-2xl leading-none">👑</span> };
  }
  const tier = getTierUpDefinition(r.thresholdVisits);
  if (tier?.key === 'vip') {
    return { kind: 'vip', label: 'VIP 축하쿠폰', icon: <span className="text-2xl leading-none">👑</span> };
  }
  if (tier) {
    return {
      kind: 'tierUp',
      label: '등급업 축하 할인권',
      icon: <Image src={tier.iconSrc} alt="" width={28} height={28} />,
    };
  }
  return { kind: 'default', label: null, icon: <span className="text-2xl leading-none">🎫</span> };
}

export default function PassportGuide() {
  const router = useRouter();
  const [rewards, setRewards] = useState<RewardRuleCatalogItem[] | null>(null);

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
          className="flex items-center min-h-[44px] text-[#2D5A3D] text-base font-bold"
          type="button"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </button>

        {/* 타이틀 */}
        <header className="text-center space-y-3">
          <BrandLogo height={48} textClassName="text-xl" />
          <div>
            <h1 className="text-xl font-bold text-[#2D5A3D]">해율푸드 여권 설명서</h1>
            <p className="mt-1 text-[15px] font-medium text-[#55534A]">
              해율만두전골 · 곤드레밥집 · 정담명가 남원추어탕 3개 매장에서 함께 사용하는 통합 전자여권입니다.
            </p>
            <p className="mt-1 text-[15px] font-medium text-[#55534A]">
              방문할수록 등급이 오르고, 할인권도 받으실 수 있어요.
            </p>
          </div>
        </header>

        {/* 등급 안내 */}
        <section className="space-y-3">
          <h2 className="text-[17px] font-bold text-[#333331]">방문 등급</h2>
          <div className="bg-white rounded-2xl shadow-sm border border-[#E8E4DA] divide-y divide-[#F0EDE6]">
            {tiers.map((tier, i) => {
              const next = tiers[i + 1];
              const rangeText = next
                ? `${tier.minVisits}회 ~ ${next.minVisits - 1}회`
                : `${tier.minVisits}회 이상`;
              return (
                <div key={tier.key} className="flex items-center gap-3 px-4 py-3.5">
                  <Image src={tier.iconSrc} alt={tier.label} width={40} height={40} className="flex-shrink-0" />
                  <div className="flex-1">
                    <p className="text-base font-bold text-[#232320]">
                      {tier.label}
                      <span className="ml-2 text-[13px] font-medium text-[#6B6B5E]">{tier.description}</span>
                    </p>
                    <p className="text-[13px] font-medium text-[#6B6B5E]">누적 방문 {rangeText}</p>
                  </div>
                </div>
              );
            })}
          </div>
          <p className="text-[13px] font-medium text-[#6B6B5E] leading-relaxed">
            해율푸드 VIP 가족이 되시면 별도 관리되며, 최고 등급에 맞는 혜택을 지속적으로 늘려나갈 예정입니다.
          </p>
        </section>

        {/* 방문 할인권 안내 */}
        <section className="space-y-3">
          <h2 className="text-[17px] font-bold text-[#333331]">방문 할인권</h2>
          {!rewards ? (
            <div className="space-y-2">
              {[1, 2, 3].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-[#E8E8E0] animate-pulse" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2.5">
              {rewards.map((r) => {
                const { kind, label, icon } = getCatalogCardInfo(r);
                const style = REWARD_CATALOG_STYLES[kind];
                return (
                  <li
                    key={r.thresholdVisits}
                    className={`${style.bg} border-2 rounded-xl px-4 py-3.5 flex items-center gap-3`}
                  >
                    {icon}
                    <div className="flex-1">
                      <p className={`text-2xl font-extrabold ${style.accent}`}>{r.amount.toLocaleString()}원</p>
                      {label && <p className={`text-[13px] font-bold ${style.accent}`}>{label}</p>}
                    </div>
                    <span className={`flex-shrink-0 text-[15px] font-bold ${style.accent} text-right leading-snug`}>
                      {r.isRepeating ? (
                        <>
                          해율VIP<br />{r.repeatInterval}회마다
                        </>
                      ) : (
                        `${r.thresholdVisits}회`
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="text-[13px] font-medium text-[#6B6B5E] leading-relaxed">
            할인권은 해당 방문 횟수를 달성하면 자동으로 할인권함에 담기며, 3개 매장 어디서든 사용하실 수
            있습니다. 사용하지 않으면 할인권함에 계속 남아있으니, 매장에서 언제든 직원에게 보여주고
            사용하실 수 있습니다. 할인권의 유효기간은 발급일로부터 6개월입니다.
          </p>
        </section>

        <div className="pb-8" />
      </div>
    </main>
  );
}
