'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { getPassportData, registerVisit, logout, type PassportData } from '@/app/actions';
import { formatDateKR } from '@/lib/utils';
import { VIP_MESSAGE } from '@/lib/tiers';
import { getCurrentPosition } from '@/lib/geolocation';
import VisitHistory from './VisitHistory';
import MyInfo from './MyInfo';
import BrandLogo from '@/components/BrandLogo';

// 매장 주소 (매장별 방문 횟수 카드의 매장명과 매칭)
const STORE_ADDRESSES: Record<string, string> = {
  '해율만두전골': '용인시 수지구 고기로 173번길 5',
  '곤드레밥집': '용인시 수지구 고기로 114',
  '정담명가 남원추어탕': '용인시 수지구 고기로 129번길 12',
};

// 매장별 강조색 (매장별 방문 카드의 좌측 강조선 + 배경 톤)
const STORE_ACCENTS: Record<string, { border: string; bg: string; text: string }> = {
  '해율만두전골': { border: '#2D5A3D', bg: '#F1F8F3', text: '#1F4A2E' },
  '곤드레밥집': { border: '#2B5D8A', bg: '#EEF5FB', text: '#204A6E' },
  '정담명가 남원추어탕': { border: '#A8551F', bg: '#FBF1E7', text: '#8A4517' },
};
const DEFAULT_STORE_ACCENT = { border: '#8C8C80', bg: '#F5F5EC', text: '#44443C' };

export default function PassportHome() {
  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visitLoading, setVisitLoading] = useState(false);
  const [visitMessage, setVisitMessage] = useState('');
  const [visitError, setVisitError] = useState('');
  const [newCouponAmounts, setNewCouponAmounts] = useState<number[]>([]);
  const [tierUpMessage, setTierUpMessage] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [showMyInfo, setShowMyInfo] = useState(false);

  const refreshPassportData = useCallback(async () => {
    const result = await getPassportData();
    if (result.success && result.data) {
      setData(result.data);
    }
    return result;
  }, []);

  const handleVisit = useCallback(async () => {
    setVisitLoading(true);
    setVisitMessage('');
    setVisitError('');

    const { coords } = await getCurrentPosition();
    const result = await registerVisit(coords?.latitude ?? null, coords?.longitude ?? null);

    setVisitLoading(false);

    if (result.success && result.data) {
      const { visitCount, newCouponAmounts, tier, tierUpgraded } = result.data;
      const tierLine = tier.isMaxTier
        ? VIP_MESSAGE
        : `다음 등급까지 ${tier.visitsUntilNext}회 남았습니다.`;
      setVisitMessage(
        `오늘도 자연의 흐름이 여권에 기록되었습니다.\n현재까지 총 ${visitCount}회 방문하셨습니다.\n${tierLine}`
      );
      if (newCouponAmounts.length > 0) {
        setNewCouponAmounts(newCouponAmounts);
      }
      if (tierUpgraded) {
        setTierUpMessage(`${tier.label}(으)로 자라나셨습니다. 자연의 흐름을 함께해 주셔서 감사합니다.`);
      }
      // 데이터 새로고침
      refreshPassportData();
    } else {
      setVisitError(result.error || '방문 등록 중 오류가 발생했습니다.');
    }
  }, [refreshPassportData]);

  useEffect(() => {
    async function init() {
      await refreshPassportData();
      setLoading(false);
    }
    init();
  }, [refreshPassportData]);

  async function handleLogout() {
    await logout();
    window.location.href = '/visit';
  }

  if (loading) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="w-16 h-16 rounded-full bg-[#E8E8E0] animate-pulse" />
        <div className="mt-4 w-40 h-6 rounded bg-[#E8E8E0] animate-pulse" />
        <div className="mt-2 w-52 h-5 rounded bg-[#E8E8E0] animate-pulse" />
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-6">
        <p className="text-[17px] font-medium text-[#44443C]">정보를 불러올 수 없습니다.</p>
        <button onClick={handleLogout} className="mt-4 min-h-[48px] text-[17px] font-semibold text-[#2D5A3D] underline">
          다시 로그인하기
        </button>
      </main>
    );
  }

  // 방문기록 화면
  if (showHistory) {
    return <VisitHistory onBack={() => setShowHistory(false)} />;
  }

  // 내 정보 화면
  if (showMyInfo) {
    return (
      <MyInfo
        customer={data.customer}
        onBack={() => setShowMyInfo(false)}
        onUpdated={refreshPassportData}
      />
    );
  }

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* 헤더 */}
        <header className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <BrandLogo height={56} textClassName="text-2xl" />
            <a
              href="https://haeyul-homepage.vercel.app/"
              target="_blank"
              rel="noopener noreferrer"
              className="flex-shrink-0 flex flex-col items-center justify-center min-h-[52px] px-3 py-1.5
                         rounded-xl border-2 border-[#2D5A3D] bg-white text-[#2D5A3D]
                         text-[13px] font-bold leading-tight text-center
                         hover:bg-[#F0F7F2] active:scale-[0.98] transition-all duration-200"
            >
              <span>홈페이지</span>
              <span>둘러보기</span>
            </a>
          </div>
          <p className="text-[15px] font-medium text-[#55534A] text-center">해율 자연의 흐름 전자여권</p>
          <p className="text-sm font-medium text-[#55534A] text-center">
            해율만두전골 · 곤드레밥집 · 정담명가 남원추어탕
          </p>
        </header>

        {/* 고객 정보 카드 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#2D5A3D]">
                {data.customer.name} 고객님
              </h1>
              <p className="text-[15px] font-medium text-[#55534A] mt-1">
                [해율 여권번호] {data.customer.customer_number}
              </p>
            </div>
          </div>
          <div className="flex items-center justify-between border-t border-[#F0EDE6] pt-3">
            <span className="text-[15px] font-medium text-[#55534A]">최근 방문일</span>
            <span className="text-base font-bold text-[#2C2C2C]">
              {data.recentVisitDate ? formatDateKR(data.recentVisitDate) : '-'}
            </span>
          </div>
        </div>

        {/* 등급 카드 (초록 계열) */}
        <div className="bg-[#E9F3EC] border-2 border-[#BFE0C8] rounded-2xl p-6 flex items-center gap-5">
          <Image
            src={data.tier.iconSrc}
            alt={data.tier.label}
            width={64}
            height={64}
            priority
            className="flex-shrink-0"
          />
          <div className="flex-1 min-w-0">
            <p className="text-[15px] font-semibold text-[#1F4A2E]">현재 등급</p>
            <p className="text-[26px] font-extrabold text-[#1F4A2E] leading-tight">{data.tier.label}</p>
          </div>
          <div className="text-right flex-shrink-0">
            <p className="text-[15px] font-semibold text-[#1F4A2E]">총 방문</p>
            <p className="text-[26px] font-extrabold text-[#1F4A2E] leading-tight">
              {data.customer.visit_count}<span className="text-lg">회</span>
            </p>
          </div>
        </div>

        {/* 오늘의 방문 / 메시지 영역 */}
        {visitMessage && (
          <div className="bg-[#F0F7F2] border-2 border-[#C4DCC9] text-[#1F4A2E] px-5 py-4 rounded-2xl text-[17px] font-medium leading-relaxed whitespace-pre-line">
            {visitMessage}
          </div>
        )}

        {visitError && (
          <div className="bg-[#FFF3E4] border-2 border-[#EAC28E] text-[#7A4A16] px-5 py-4 rounded-2xl text-[17px] font-medium leading-relaxed whitespace-pre-line space-y-2">
            <p>{visitError}</p>
            {!data.todayVisited && (
              <button
                onClick={handleVisit}
                disabled={visitLoading}
                className="min-h-[44px] text-base font-bold text-[#2D5A3D] underline disabled:opacity-60"
              >
                다시 시도
              </button>
            )}
          </div>
        )}

        {tierUpMessage && (
          <div className="bg-[#E9F3EC] border-2 border-[#BFE0C8] px-5 py-5 rounded-2xl text-center space-y-2">
            <Image
              src={data.tier.iconSrc}
              alt={data.tier.label}
              width={40}
              height={40}
              className="mx-auto"
            />
            <p className="text-[17px] text-[#1F4A2E] leading-relaxed font-bold">
              {tierUpMessage}
            </p>
          </div>
        )}

        {newCouponAmounts.length > 0 && (
          <div className="bg-[#FFF3D6] border-2 border-[#F0D98C] px-5 py-5 rounded-2xl text-center space-y-2">
            <p className="text-xl font-extrabold text-[#8A5800]">🎉 축하드립니다!</p>
            <p className="text-[17px] font-semibold text-[#5A3E00] leading-relaxed">
              새로운 할인권이 도착했습니다.<br />
              {newCouponAmounts.map((a) => `${a.toLocaleString()}원`).join(' · ')}
            </p>
            <p className="text-[15px] font-medium text-[#8A5800]">내 할인권함에서 확인해 주세요.</p>
          </div>
        )}

        {/* 방문 확인 및 기록 */}
        {!data.todayVisited && !visitMessage && (
          data.qrVerified ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center space-y-4">
              <p className="text-[17px] font-semibold text-[#1F4A2E] leading-relaxed">
                {data.storeName ?? '매장'} 방문이 확인되었습니다.<br />
                오늘의 방문을 기록하시겠습니까?
              </p>
              <button
                onClick={handleVisit}
                disabled={visitLoading}
                className="w-full min-h-[56px] py-4 px-6 bg-[#2D5A3D] text-white text-lg font-bold rounded-2xl
                           shadow-md hover:bg-[#245032] active:scale-[0.98]
                           transition-all duration-200 disabled:bg-[#999] disabled:cursor-not-allowed"
                id="btn-visit"
              >
                {visitLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    기록 중...
                  </span>
                ) : (
                  `${data.storeName ?? '매장'} 방문 기록하기`
                )}
              </button>
            </div>
          ) : (
            <div className="text-center py-5 px-4 bg-[#F5F5EC] border-2 border-[#E0E0D0] rounded-2xl">
              <p className="text-[17px] font-semibold text-[#44443C] leading-relaxed">
                매장 방문 확인이 필요합니다.<br />
                매장의 QR코드를 다시 스캔해 주세요.
              </p>
            </div>
          )
        )}

        {data.todayVisited && !visitMessage && (
          <div className="text-center py-4 px-4 bg-[#F5F5EC] border-2 border-[#E0E0D0] rounded-2xl">
            <p className="text-[17px] font-semibold text-[#1F4A2E]">
              ✅ 오늘의 자연이 이미 기록되었습니다.
            </p>
            <p className="text-[15px] font-medium text-[#55534A] mt-1">
              방문 기록은 하루에 한 번만 가능합니다.
            </p>
          </div>
        )}

        {/* 다음 혜택까지 카드 (주황/노랑 계열) */}
        <div className="bg-[#FFF3D6] border-2 border-[#F0D98C] rounded-2xl p-6 space-y-4">
          {data.tier.isMaxTier ? (
            <p className="text-[17px] font-bold text-[#8A5800] leading-relaxed text-center">
              {VIP_MESSAGE}
            </p>
          ) : (
            <div className="space-y-2">
              <div className="flex justify-between items-baseline text-[15px] font-semibold text-[#8A5800]">
                <span>{data.tier.label}</span>
                <span>{data.tier.nextTierLabel} 등급까지 {data.tier.visitsUntilNext}회</span>
              </div>
              <div className="w-full h-4 bg-white/70 rounded-full overflow-hidden border border-[#F0D98C]">
                <div
                  className="h-full bg-[#D99A2B] rounded-full transition-all duration-500"
                  style={{ width: `${data.tier.progressPercent}%` }}
                />
              </div>
            </div>
          )}

          {data.rewardProgressMessage && (
            <p className="text-[17px] font-bold text-[#8A5800] text-center leading-relaxed border-t border-[#F0D98C] pt-3">
              🎫 {data.rewardProgressMessage}
            </p>
          )}

          {data.availableRewards > 0 && (
            <p className="text-[15px] font-semibold text-[#8A5800] text-center">
              지금 사용 가능한 할인권 {data.availableRewards}개가 있어요
            </p>
          )}
        </div>

        {/* 매장별 방문 횟수 */}
        {data.storeVisitBreakdown.length > 0 && (
          <div className="space-y-2">
            <p className="text-[15px] font-bold text-[#44443C] px-1">매장별 방문 횟수</p>
            {data.storeVisitBreakdown.map((s) => {
              const accent = STORE_ACCENTS[s.storeName] ?? DEFAULT_STORE_ACCENT;
              return (
                <div
                  key={s.storeName}
                  className="flex items-center justify-between rounded-xl py-3 px-4 border-l-[6px]"
                  style={{ backgroundColor: accent.bg, borderLeftColor: accent.border }}
                >
                  <p className="text-base font-bold" style={{ color: accent.text }}>
                    {s.storeName}
                  </p>
                  <p className="text-xl font-extrabold" style={{ color: accent.text }}>
                    {s.count}<span className="text-sm font-semibold">회</span>
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* 메뉴 버튼들 */}
        <div className="space-y-4">
          <button
            onClick={() => setShowHistory(true)}
            className="w-full min-h-[56px] py-4 px-6 bg-white text-[#2D5A3D] text-lg font-bold rounded-2xl
                       border-2 border-[#D4D0C8] shadow-sm
                       hover:bg-[#F5F5EC] active:scale-[0.98]
                       transition-all duration-200"
            id="btn-history"
          >
            방문기록 보기
          </button>

          <button
            onClick={() => {
              window.location.href = '/passport/rewards';
            }}
            className={`w-full min-h-[56px] py-4 px-6 text-lg font-bold rounded-2xl border-2 shadow-sm
                       transition-all duration-200
                       ${data.hasRewardToUse
                         ? 'bg-[#FFF3D6] text-[#8A5800] border-[#F0D98C] hover:bg-[#FCE9BC]'
                         : 'bg-white text-[#2D5A3D] border-[#D4D0C8] hover:bg-[#F5F5EC]'
                       } active:scale-[0.98]`}
            id="btn-rewards"
          >
            내 할인권함 {data.availableRewards > 0 && `(${data.availableRewards})`}
          </button>
        </div>

        {/* 하단 문구 + 로그아웃 */}
        <footer className="pt-4 border-t border-[#E8E4DA] space-y-4">
          {data.storeVisitBreakdown.length > 0 && (
            <div className="mx-auto w-fit space-y-1 text-sm font-medium text-[#6B6B5E]">
              {data.storeVisitBreakdown.map((s) => (
                <div key={s.storeName} className="flex gap-3">
                  <span className="w-28 flex-shrink-0 text-right whitespace-nowrap">{s.storeName}</span>
                  <span className="text-left">{STORE_ADDRESSES[s.storeName] ?? ''}</span>
                </div>
              ))}
            </div>
          )}
          <p className="text-center text-[15px] font-medium text-[#6B6B5E] leading-relaxed">
            봄에는 새싹이 나고, 여름에는 푸르러지며,<br />
            가을에는 열매를 맺고, 겨울에는 다시 쉼을 얻습니다.<br />
            해율을 찾아주시는 한 걸음 한 걸음이<br />
            자연의 흐름을 이어갑니다. 감사합니다.
          </p>
          <div className="flex justify-center gap-3">
            <button
              onClick={() => setShowMyInfo(true)}
              className="min-h-[48px] px-4 py-3 rounded-xl text-[15px] font-bold text-[#1F4A2E] bg-[#F0F7F2]
                         border-2 border-[#C4DCC9] hover:bg-[#E4F0E8] transition-colors duration-200"
            >
              내 정보
            </button>
            <button
              onClick={() => {
                window.location.href = '/guide';
              }}
              className="min-h-[48px] px-4 py-3 rounded-xl text-[15px] font-bold text-[#1F4A2E] bg-[#F0F7F2]
                         border-2 border-[#C4DCC9] hover:bg-[#E4F0E8] transition-colors duration-200"
            >
              여권 설명서
            </button>
            <button
              onClick={handleLogout}
              className="min-h-[48px] px-4 py-3 rounded-xl text-[15px] font-bold text-[#A8391F] bg-[#FFF0EA]
                         border-2 border-[#F0C4B8] hover:bg-[#FCDFD3] transition-colors duration-200"
              id="btn-logout"
            >
              로그아웃
            </button>
          </div>
        </footer>
      </div>
    </main>
  );
}
