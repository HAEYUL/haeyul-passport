'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { getPassportData, registerVisit, logout, type PassportData } from '@/app/actions';
import { getCurrentPositionWithRetry } from '@/lib/geolocation';
import { getTierUpDefinition, type VisitTierInfo } from '@/lib/tiers';
import { STORE_NAMES, HOMEPAGE_URL } from '@/lib/storeAccents';
import VisitHistory from './VisitHistory';
import MyInfo from './MyInfo';
import NoticeDetail from './NoticeDetail';
import BrandLogo from '@/components/BrandLogo';
import StoreStamps from '@/components/passport/StoreStamps';
import StoreMealList from '@/components/passport/StoreMealList';
import { useAddToHome } from '@/components/passport/useAddToHome';

/** 방금 기록한 방문 결과 — 축하 카드 한 장으로 보여줍니다 */
interface JustRecordedVisit {
  storeName: string;
  visitCount: number;
  tier: VisitTierInfo;
  tierUpgraded: boolean;
  newCouponAmounts: number[];
  allStoresGiftAmount: number | null;
}

/** 할인권 카드에 보여줄 "가장 급한 한 줄" */
interface CouponLine {
  title: string;
  sub?: string;
}

/**
 * 할인권 카드의 한 줄 안내를 우선순위대로 하나만 고릅니다.
 * 1) 곧 만료 → 2) 사용 가능 → 3) 세 매장 완주까지 한 곳 → 4) 다음 할인권까지
 * 방금 방문을 기록한 직후에는 새로 받은 할인권을 축하 카드에서 이미 알렸으므로
 * "사용 가능" 안내는 건너뜁니다.
 */
function getCouponLine(data: PassportData, justRecorded: boolean): CouponLine {
  const { soonExpiringReward, availableRewards } = data;

  if (soonExpiringReward) {
    const when = soonExpiringReward.daysLeft <= 0 ? '오늘' : `${soonExpiringReward.daysLeft}일 후`;
    return {
      title: `⏰ ${soonExpiringReward.amount.toLocaleString()}원 할인권이 ${when} 만료돼요`,
      sub: availableRewards > 1 ? `사용할 수 있는 할인권 ${availableRewards}장` : undefined,
    };
  }

  if (availableRewards > 0 && !justRecorded) {
    return { title: `🎫 사용할 수 있는 할인권 ${availableRewards}장` };
  }

  if (data.allStoresGiftAmount && !data.allStoresGiftReceived) {
    const counts = new Map(data.storeVisitBreakdown.map((s) => [s.storeName, s.count]));
    const notVisited = STORE_NAMES.filter((name) => (counts.get(name) ?? 0) === 0);
    if (notVisited.length === 1) {
      return {
        title: `🏅 ${notVisited[0]}만 가시면`,
        sub: `${data.allStoresGiftAmount.toLocaleString()}원 완주 선물을 드려요`,
      };
    }
  }

  if (data.nextCoupon) {
    // 등급이 오르는 방문(5·10·20·30회)이면 할인권과 함께 새 등급도 알려줍니다.
    const tierUp = getTierUpDefinition(data.nextCoupon.atVisit);
    return {
      title: `🎫 다음 할인권까지 ${data.nextCoupon.visitsRemaining}번 남았어요`,
      sub: `${data.nextCoupon.atVisit}번째 방문에 ${data.nextCoupon.amount.toLocaleString()}원${tierUp ? ` + ${tierUp.label} 등급` : ''}`,
    };
  }

  return { title: '🎫 방문할수록 할인권이 쌓여요' };
}

export default function PassportHome() {
  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visitLoading, setVisitLoading] = useState(false);
  const [visitError, setVisitError] = useState('');
  const [justRecorded, setJustRecorded] = useState<JustRecordedVisit | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [showMyInfo, setShowMyInfo] = useState(false);
  const [showNotice, setShowNotice] = useState(false);
  // 이미 홈 화면 앱으로 열었으면 "홈 화면에 추가"를 숨깁니다.
  const { isInstalledApp, installMessage, addToHome } = useAddToHome();
  const [showScrollHint, setShowScrollHint] = useState(false);

  // 화면이 한 번에 안 보이고 스크롤이 필요할 때만, 하단에 "더 있음" 표시를 보여줍니다.
  // 스크롤을 시작하면(내용을 이미 인지했다고 보고) 자동으로 사라집니다.
  useEffect(() => {
    function checkScrollable() {
      setShowScrollHint(document.documentElement.scrollHeight > window.innerHeight + 40);
    }
    const timer = setTimeout(checkScrollable, 100);
    function handleScroll() {
      if (window.scrollY > 24) {
        setShowScrollHint(false);
      }
    }
    window.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', checkScrollable);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', checkScrollable);
    };
  }, [data]);

  // 내 정보/방문기록 화면은 라우트 이동 없이 상태로만 전환되므로, 브라우저/기기의
  // 뒤로가기가 앱을 그냥 벗어나 버리지 않도록 히스토리 항목을 쌓고 popstate로 닫습니다.
  const openMyInfo = useCallback(() => {
    window.history.pushState({ passportOverlay: 'myinfo' }, '');
    setShowMyInfo(true);
  }, []);

  const openHistory = useCallback(() => {
    window.history.pushState({ passportOverlay: 'history' }, '');
    setShowHistory(true);
  }, []);

  const openNotice = useCallback(() => {
    window.history.pushState({ passportOverlay: 'notice' }, '');
    setShowNotice(true);
  }, []);

  const closeOverlay = useCallback(() => {
    window.history.back();
  }, []);

  useEffect(() => {
    function handlePopState() {
      setShowMyInfo(false);
      setShowHistory(false);
      setShowNotice(false);
    }
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const refreshPassportData = useCallback(async () => {
    const result = await getPassportData();
    if (result.success && result.data) {
      setData(result.data);
    }
    return result;
  }, []);

  const handleVisit = useCallback(async () => {
    const storeName = data?.storeName ?? '매장';
    setVisitLoading(true);
    setVisitError('');

    const { coords } = await getCurrentPositionWithRetry();
    const result = await registerVisit(coords?.latitude ?? null, coords?.longitude ?? null);

    if (result.success && result.data) {
      const { visitCount, newCouponAmounts, allStoresGiftAmount, tier, tierUpgraded } = result.data;
      await refreshPassportData();
      setJustRecorded({ storeName, visitCount, tier, tierUpgraded, newCouponAmounts, allStoresGiftAmount });
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      setVisitError(result.error || '방문 등록 중 오류가 발생했습니다.');
    }
    setVisitLoading(false);
  }, [data?.storeName, refreshPassportData]);

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
    return <VisitHistory onBack={closeOverlay} />;
  }

  // 내 정보 화면
  if (showMyInfo) {
    return (
      <MyInfo
        customer={data.customer}
        recentVisitDate={data.recentVisitDate}
        onBack={closeOverlay}
        onUpdated={refreshPassportData}
        onLogout={handleLogout}
      />
    );
  }

  // 알림/이벤트 상세 화면
  if (showNotice && data.activeNotice) {
    return <NoticeDetail notice={data.activeNotice} onBack={closeOverlay} />;
  }

  // 화면 상태: 매장 QR로 들어와 아직 기록 전(A) / 방금 기록함(B) / 평소(C)
  const needsRecord = data.qrVerified && !data.todayVisited && !justRecorded;
  const couponLine = getCouponLine(data, !!justRecorded);
  const visitCounts = Object.fromEntries(data.storeVisitBreakdown.map((s) => [s.storeName, s.count]));
  const recordedToday = data.todayVisitedStoreNames.length > 0;
  const activeEvent = data.activeNotice?.kind === 'event' ? data.activeNotice : null;
  const activeAlert = data.activeNotice?.kind === 'notice' ? data.activeNotice : null;

  return (
    <main className="flex flex-col min-h-screen px-5 py-6">
      <div className="w-full max-w-sm mx-auto space-y-3">
        {/* 헤더 */}
        <header className="text-center space-y-1">
          <BrandLogo height={48} textClassName="text-2xl" />
          <p className="text-[15px] font-medium text-[#6B6B5E]">음식은 달라도, 정성은 같습니다.</p>
        </header>

        {/* A. 매장 QR 확인 → 방문 기록하기 (가장 먼저) */}
        {needsRecord && (
          <section className="bg-[#EEF5FB] border-2 border-[#2B5D8A] rounded-2xl p-4 space-y-3 text-center">
            <p className="text-[17px] font-bold text-[#204A6E]">✓ {data.storeName ?? '매장'} 방문이 확인되었어요</p>
            <button
              onClick={handleVisit}
              disabled={visitLoading}
              className="w-full min-h-[60px] py-4 px-6 bg-[#2D5A3D] text-white text-lg font-bold rounded-2xl
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
            {visitError && (
              <div className="bg-[#FFF3E4] border-2 border-[#D9A257] text-[#7A4A16] px-4 py-3 rounded-xl text-[15px] font-medium leading-relaxed whitespace-pre-line text-left">
                {visitError}
                <p className="mt-1 text-sm">QR 인증은 방문 당일 매장 영업시간까지만 유효해요.</p>
              </div>
            )}
          </section>
        )}

        {/* B. 방금 기록한 방문 — 축하 카드 한 장 */}
        {justRecorded && (
          <section className="bg-[#F0F7F2] border-2 border-[#8FC49F] rounded-2xl p-4 space-y-2.5 text-center" aria-live="polite">
            <p className="text-xl font-extrabold text-[#1F4A2E]">✓ {justRecorded.storeName} 방문이 기록되었어요</p>
            <p className="text-[17px] font-semibold text-[#1F4A2E]">오늘로 {justRecorded.visitCount}번째 방문, 감사합니다.</p>
            {justRecorded.tierUpgraded && (
              <div className="flex items-center justify-center gap-2 bg-white/70 rounded-xl py-2 px-3">
                <Image src={justRecorded.tier.iconSrc} alt="" width={32} height={32} />
                <p className="text-[17px] font-bold text-[#1F4A2E]">{justRecorded.tier.label} 등급으로 올랐어요</p>
              </div>
            )}
            {justRecorded.allStoresGiftAmount && (
              <p className="text-[17px] font-bold text-[#204A6E] bg-[#EEF5FB] rounded-xl py-2 px-3 leading-relaxed">
                🏅 세 매장 완주를 축하드려요!<br />
                {justRecorded.allStoresGiftAmount.toLocaleString()}원 완주 선물이 도착했어요
              </p>
            )}
            {justRecorded.newCouponAmounts.length > 0 && (
              <p className="text-[17px] font-bold text-[#8A5800] bg-[#FFF3D6] rounded-xl py-2 px-3">
                🎫 {justRecorded.newCouponAmounts.map((a) => `${a.toLocaleString()}원`).join(' · ')} 할인권이 도착했어요
              </p>
            )}
            {(justRecorded.newCouponAmounts.length > 0 || justRecorded.allStoresGiftAmount) && (
              <div className="space-y-2 pt-1">
                <p className="text-[15px] font-bold text-[#1F4A2E]">계산하실 때 바로 쓰실 수 있어요</p>
                <button
                  onClick={() => {
                    window.location.href = '/passport/rewards';
                  }}
                  className="w-full min-h-[52px] rounded-xl bg-[#2D5A3D] text-white text-base font-bold shadow-sm
                             hover:bg-[#245032] active:scale-[0.98] transition-all duration-200"
                >
                  할인권 보기
                </button>
              </div>
            )}
          </section>
        )}

        {/* 고객 카드 — 이름 · 등급 · 총 방문 · 세 매장 도장 */}
        <section className="bg-white rounded-2xl p-4 shadow-sm border-2 border-[#A8A296] space-y-3">
          <div className="flex items-center gap-3">
            <Image src={data.tier.iconSrc} alt={data.tier.label} width={48} height={48} priority className="flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <h1 className="text-xl font-bold text-[#2D5A3D]">{data.customer.name} 고객님</h1>
              <p className="text-[15px] font-semibold text-[#44443C]">
                {data.tier.label} · 총 {data.customer.visit_count}회 방문
                {recordedToday && <span className="text-[#2D5A3D]"> (오늘 ✓)</span>}
              </p>
            </div>
          </div>
          <StoreStamps counts={visitCounts} todayStoreNames={data.todayVisitedStoreNames} />
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={openHistory}
              type="button"
              id="btn-history"
              className="min-h-[48px] rounded-xl border-2 border-[#2D5A3D] bg-white text-[#2D5A3D] text-base font-bold
                         hover:bg-[#F0F7F2] active:scale-[0.98] transition-all duration-200"
            >
              방문기록
            </button>
            <button
              onClick={openMyInfo}
              type="button"
              className="min-h-[48px] rounded-xl border-2 border-[#2D5A3D] bg-white text-[#2D5A3D] text-base font-bold
                         hover:bg-[#F0F7F2] active:scale-[0.98] transition-all duration-200"
            >
              내 정보
            </button>
          </div>
        </section>

        {/* 할인권 — 가장 급한 한 줄만 */}
        <section className="bg-[#FFF3D6] border-2 border-[#DFBE5C] rounded-2xl p-4 space-y-3 text-center">
          <div>
            <p className="text-[17px] font-bold text-[#8A5800] leading-relaxed">{couponLine.title}</p>
            {couponLine.sub && <p className="text-[15px] font-medium text-[#8A5800]">{couponLine.sub}</p>}
          </div>
          <button
            onClick={() => {
              window.location.href = '/passport/rewards';
            }}
            id="btn-rewards"
            className="w-full min-h-[52px] rounded-xl bg-white border-2 border-[#DFBE5C] text-[#8A5800] text-base font-bold
                       hover:bg-[#FCE9BC] active:scale-[0.98] transition-all duration-200"
          >
            내 할인권 보기
          </button>
        </section>

        {/* 기록 전(A)에는 기록에 집중하도록 아래 내용은 보여주지 않습니다 */}
        {!needsRecord && (
          <>
            {activeEvent && (
              <button
                type="button"
                onClick={openNotice}
                className="notice-pill-animated w-full flex items-center gap-2.5 rounded-full border-2 px-5 py-3
                           text-left active:scale-[0.98] transition-transform duration-150
                           bg-[#FBF0F4] border-[#C15B82] text-[#7D2F51]"
              >
                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0 bg-[#C15B82]" />
                <span className="flex-1 text-[15.5px] font-bold">🎉 {activeEvent.title}</span>
                <span className="text-[13px] font-extrabold opacity-75 flex-shrink-0">확인 ›</span>
              </button>
            )}

            <StoreMealList
              title={data.qrVerified ? '해율푸드의 세 가지 밥상' : '오늘은 어떤 한 끼가 생각나세요?'}
              todayStoreNames={data.todayVisitedStoreNames}
            />
            <a
              href={HOMEPAGE_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center w-full min-h-[48px] rounded-xl bg-white border-2 border-[#D4D0C8]
                         text-[#2D5A3D] text-base font-bold hover:bg-[#F5F5EC] active:scale-[0.98] transition-all duration-200"
            >
              세 매장 둘러보기
            </a>
          </>
        )}

        {/* 하단 — 알림 · 여권 안내 · 홈 화면에 추가 */}
        <footer className="pt-3 border-t border-[#E8E4DA] space-y-2">
          <nav className="flex flex-wrap items-center justify-center text-[15px] font-semibold text-[#55534A]">
            {activeAlert && (
              <>
                <button type="button" onClick={openNotice} className="min-h-[44px] px-3 inline-flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#4E7DB5]" aria-hidden="true" />
                  알림
                </button>
                <span aria-hidden="true">·</span>
              </>
            )}
            <Link href="/guide" className="min-h-[44px] px-3 inline-flex items-center">
              여권 안내
            </Link>
            {!isInstalledApp && (
              <>
                <span aria-hidden="true">·</span>
                <button type="button" onClick={addToHome} className="min-h-[44px] px-3 inline-flex items-center">
                  홈 화면에 추가
                </button>
              </>
            )}
          </nav>
          {installMessage && (
            <p className="text-center text-[13px] leading-relaxed text-[#55534A]">{installMessage}</p>
          )}
          <p className="text-center text-xs text-[#8C8C80]">© 2026 해율푸드. All rights reserved.</p>
        </footer>
      </div>

      {showScrollHint && (
        <div
          aria-hidden="true"
          className="fixed inset-x-0 bottom-0 z-30 flex justify-center pb-3 pt-10 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(250,250,245,0) 0%, rgba(250,250,245,0.95) 55%)' }}
        >
          <div className="w-10 h-10 rounded-full bg-white shadow-md border border-[#E8E4DA] flex items-center justify-center animate-bounce">
            <svg className="w-5 h-5 text-[#2D5A3D]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
        </div>
      )}
    </main>
  );
}
