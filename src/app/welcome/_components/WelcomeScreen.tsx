'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getPassportData, updateReferralSource, type PassportData } from '@/app/actions';
import { REFERRAL_SOURCE_OPTIONS, type ReferralSourceKey } from '@/lib/referralSource';
import { STORE_NAMES } from '@/lib/storeAccents';
import { getTierUpDefinition } from '@/lib/tiers';
import StoreStamps from '@/components/passport/StoreStamps';
import StoreMealList from '@/components/passport/StoreMealList';
import { useAddToHome } from '@/components/passport/useAddToHome';

/**
 * 가입 직후 한 번 보이는 환영 화면
 * 첫 기록 축하 → 받을 수 있는 할인권 → 아직 안 가본 두 매장 소개 → 내 여권 보기
 */
export default function WelcomeScreen() {
  const [data, setData] = useState<PassportData | null>(null);
  const { isInstalledApp, installMessage, addToHome } = useAddToHome();
  // 해율을 알게 된 경로 (선택) — 가입을 빠르게 하려고 가입 화면이 아니라 여기서 묻습니다.
  const [referralChoice, setReferralChoice] = useState<ReferralSourceKey | null>(null);
  const [referralDetail, setReferralDetail] = useState('');
  const [referralSaved, setReferralSaved] = useState(false);

  async function saveReferral(source: ReferralSourceKey, detail?: string) {
    setReferralChoice(source);
    if (source === 'other' && detail === undefined) return; // '기타'는 내용을 적은 뒤 저장
    const result = await updateReferralSource(source, detail);
    if (result.success) setReferralSaved(true);
  }

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
  const nextTierUp = nextCoupon ? getTierUpDefinition(nextCoupon.atVisit) : null;

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
              {nextTierUp && ` + ${nextTierUp.label} 등급`}
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

        {/* 다음에 QR 없이도 쉽게 열 수 있도록 — 가입 직후가 권하기 가장 좋은 때 */}
        {!isInstalledApp && (
          <div className="bg-white rounded-2xl border-2 border-[#E0DCD0] p-4 space-y-2 text-center">
            <p className="text-[15px] font-semibold text-[#44443C]">
              다음에 더 쉽게 여권을 여시려면
            </p>
            <button
              type="button"
              onClick={addToHome}
              className="w-full min-h-[52px] rounded-xl border-2 border-[#2D5A3D] bg-white text-[#2D5A3D] text-base font-bold
                         hover:bg-[#F0F7F2] active:scale-[0.98] transition-all duration-200"
            >
              홈 화면에 추가하기
            </button>
            {installMessage && (
              <p className="text-[15px] leading-relaxed text-[#55534A]">{installMessage}</p>
            )}
          </div>
        )}

        {/* 해율을 알게 된 경로 (선택) — 한 번 누르면 바로 저장 */}
        {!data.customer.referral_source && (
          <section className="bg-white rounded-2xl border-2 border-[#E0DCD0] p-4 space-y-3">
            {referralSaved ? (
              <p className="text-center text-[17px] font-bold text-[#2D5A3D]">알려주셔서 감사합니다 😊</p>
            ) : (
              <>
                <p className="text-center text-[15px] font-semibold text-[#44443C]">
                  해율을 어떻게 알고 오셨어요? <span className="text-[#8C8C80]">(선택)</span>
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {REFERRAL_SOURCE_OPTIONS.map((option) => (
                    <button
                      key={option.key}
                      type="button"
                      onClick={() => saveReferral(option.key)}
                      className={`min-h-[48px] px-2 rounded-xl border-2 text-[15px] font-semibold leading-tight transition-colors duration-200 ${
                        referralChoice === option.key
                          ? 'bg-[#2D5A3D] border-[#2D5A3D] text-white'
                          : 'bg-white border-[#D4D0C8] text-[#44443C] hover:bg-[#F5F5EC]'
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
                {referralChoice === 'other' && (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={referralDetail}
                      onChange={(e) => setReferralDetail(e.target.value)}
                      placeholder="어떤 경로였는지 알려주세요"
                      maxLength={100}
                      className="flex-1 min-w-0 px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white
                                 placeholder-[#B0B0A0] focus:border-[#2D5A3D] focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => saveReferral('other', referralDetail)}
                      className="flex-shrink-0 min-h-[48px] px-4 rounded-xl bg-[#2D5A3D] text-white text-[15px] font-bold"
                    >
                      저장
                    </button>
                  </div>
                )}
              </>
            )}
          </section>
        )}

        <div className="text-center">
          <Link href="/guide" className="inline-flex items-center min-h-[48px] px-4 text-base font-bold text-[#2D5A3D] underline">
            여권 안내 보기
          </Link>
        </div>
      </div>
    </main>
  );
}
