'use client';

import { useState, useEffect, useCallback } from 'react';
import Image from 'next/image';
import { getPassportData, registerVisit, logout, type PassportData } from '@/app/actions';
import { formatDateKR } from '@/lib/utils';
import { VIP_MESSAGE } from '@/lib/tiers';
import VisitHistory from './VisitHistory';
import MyInfo from './MyInfo';
import BrandLogo from '@/components/BrandLogo';

export default function PassportHome() {
  const [data, setData] = useState<PassportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [visitLoading, setVisitLoading] = useState(false);
  const [visitMessage, setVisitMessage] = useState('');
  const [visitError, setVisitError] = useState('');
  const [newRewards, setNewRewards] = useState<string[]>([]);
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

    const result = await registerVisit();

    setVisitLoading(false);

    if (result.success && result.data) {
      const { visitCount, newRewardNames, tier } = result.data;
      const tierLine = tier.isMaxTier
        ? VIP_MESSAGE
        : `다음 등급까지 ${tier.visitsUntilNext}회 남았습니다.`;
      setVisitMessage(
        `오늘도 자연의 흐름이 여권에 기록되었습니다.\n현재까지 총 ${visitCount}회 방문하셨습니다.\n${tierLine}`
      );
      if (newRewardNames.length > 0) {
        setNewRewards(newRewardNames);
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
        <p className="text-[#666]">정보를 불러올 수 없습니다.</p>
        <button onClick={handleLogout} className="mt-4 text-[#2D5A3D] underline">
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
        <header className="text-center space-y-3">
          <BrandLogo height={56} textClassName="text-xl" />
          <p className="text-sm text-[#AAA]">해율 자연의 흐름 전자여권</p>
        </header>

        {/* 고객 정보 카드 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold text-[#2D5A3D]">
                {data.customer.name} 고객님
              </h1>
              <p className="text-sm text-[#AAA] mt-1">
                {data.customer.customer_number}
              </p>
            </div>
            <Image
              src={data.tier.iconSrc}
              alt={data.tier.label}
              width={56}
              height={56}
              priority
              className="flex-shrink-0"
            />
          </div>

          <div className="border-t border-[#F0EDE6] pt-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-[#8C8C80]">현재 등급</span>
              <span className="text-lg font-bold text-[#2D5A3D]">{data.tier.label}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-[#8C8C80]">총 방문 횟수</span>
              <span className="text-2xl font-bold text-[#2D5A3D]">
                {data.customer.visit_count}회
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-[#8C8C80]">최근 방문일</span>
              <span className="text-base font-medium text-[#555]">
                {data.recentVisitDate ? formatDateKR(data.recentVisitDate) : '-'}
              </span>
            </div>
            {data.availableRewards > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-[15px] text-[#8C8C80]">사용 가능 선물</span>
                <span className="text-lg font-semibold text-[#D4442A]">
                  {data.availableRewards}개
                </span>
              </div>
            )}
          </div>

          {/* 다음 등급 진행 바 / VIP 문구 */}
          {data.tier.isMaxTier ? (
            <div className="pt-2 text-center">
              <p className="text-[15px] text-[#B8860B] font-medium leading-relaxed">
                {VIP_MESSAGE}
              </p>
            </div>
          ) : (
            <div className="pt-2">
              <div className="flex justify-between text-xs text-[#AAA] mb-1">
                <span>{data.tier.label}</span>
                <span>다음 등급까지 {data.tier.visitsUntilNext}회</span>
              </div>
              <div className="w-full h-3 bg-[#F0EDE6] rounded-full overflow-hidden">
                <div
                  className="h-full bg-[#2D5A3D] rounded-full transition-all duration-500"
                  style={{ width: `${data.tier.progressPercent}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* 오늘의 방문 / 메시지 영역 */}
        {visitMessage && (
          <div className="bg-[#F0F7F2] border border-[#C4DCC9] text-[#2D5A3D] px-5 py-4 rounded-2xl text-[15px] leading-relaxed whitespace-pre-line">
            {visitMessage}
          </div>
        )}

        {visitError && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-5 py-4 rounded-2xl text-[15px] leading-relaxed whitespace-pre-line space-y-2">
            <p>{visitError}</p>
            {!data.todayVisited && (
              <button
                onClick={handleVisit}
                disabled={visitLoading}
                className="text-sm font-semibold text-[#2D5A3D] underline disabled:opacity-60"
              >
                다시 시도
              </button>
            )}
          </div>
        )}

        {newRewards.length > 0 && (
          <div className="bg-[#FFFDF0] border border-[#E8D88C] px-5 py-5 rounded-2xl text-center space-y-2">
            <p className="text-lg font-bold text-[#B8860B]">🎉 축하드립니다!</p>
            <p className="text-[15px] text-[#666] leading-relaxed">
              새로운 방문 선물이 도착했습니다.<br />
              {newRewards.join(' · ')}
            </p>
            <p className="text-sm text-[#999]">내 선물함에서 확인해 주세요.</p>
          </div>
        )}

        {/* 방문 확인 및 기록 */}
        {!data.todayVisited && !visitMessage && (
          data.qrVerified ? (
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center space-y-4">
              <p className="text-[15px] text-[#2D5A3D] leading-relaxed">
                해율 매장 방문이 확인되었습니다.<br />
                오늘의 방문을 기록하시겠습니까?
              </p>
              <button
                onClick={handleVisit}
                disabled={visitLoading}
                className="w-full py-4 px-6 bg-[#2D5A3D] text-white text-lg font-semibold rounded-2xl
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
                  '해율 방문 기록하기'
                )}
              </button>
            </div>
          ) : (
            <div className="text-center py-4 px-4 bg-[#F5F5EC] rounded-2xl">
              <p className="text-[15px] text-[#8C8C80] leading-relaxed">
                매장 방문 확인이 필요합니다.<br />
                매장의 QR코드를 다시 스캔해 주세요.
              </p>
            </div>
          )
        )}

        {data.todayVisited && !visitMessage && (
          <div className="text-center py-3 px-4 bg-[#F5F5EC] rounded-2xl">
            <p className="text-[15px] text-[#8C8C80]">
              ✅ 오늘의 방문이 이미 기록되었습니다.
            </p>
          </div>
        )}

        {/* 메뉴 버튼들 */}
        <div className="space-y-3">
          <button
            onClick={() => setShowHistory(true)}
            className="w-full py-4 px-6 bg-white text-[#2D5A3D] text-lg font-semibold rounded-2xl
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
            className={`w-full py-4 px-6 text-lg font-semibold rounded-2xl border-2 shadow-sm
                       transition-all duration-200
                       ${data.hasRewardToUse
                         ? 'bg-[#FFFDF0] text-[#B8860B] border-[#E8D88C] hover:bg-[#FFF8E0]'
                         : 'bg-white text-[#2D5A3D] border-[#D4D0C8] hover:bg-[#F5F5EC]'
                       } active:scale-[0.98]`}
            id="btn-rewards"
          >
            내 선물함 {data.availableRewards > 0 && `(${data.availableRewards})`}
          </button>
        </div>

        {/* 하단 문구 + 로그아웃 */}
        <footer className="pt-4 border-t border-[#E8E4DA] space-y-4">
          <p className="text-center text-sm text-[#B0B0A0] leading-relaxed">
            한 번의 방문이 한 장의 기록이 되고,<br />
            그 기록들이 모여 자연의 흐름이 됩니다.
          </p>
          <div className="flex justify-center gap-4">
            <button
              onClick={() => setShowMyInfo(true)}
              className="text-sm text-[#AAA] underline"
            >
              내 정보
            </button>
            <button
              onClick={handleLogout}
              className="text-sm text-[#AAA] underline"
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
