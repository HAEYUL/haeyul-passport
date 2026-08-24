'use client';

import { useState, useEffect } from 'react';
import RegisterForm from './RegisterForm';
import LoginForm from './LoginForm';
import BrandLogo from '@/components/BrandLogo';
import { getCurrentPositionWithRetry, type GeoCoords } from '@/lib/geolocation';

interface VisitLandingProps {
  /** QR 스캔으로 확인된 매장 이름. 확인 안 됐으면 null */
  storeName: string | null;
  /** 지금이 매장 운영시간(오전 10시~오후 9시) 이내인지 */
  isOpen: boolean;
}

/**
 * QR 접속 후 첫 화면
 * - 처음 발급하기
 * - 기존 전자여권 열기
 */
export default function VisitLanding({ storeName, isOpen }: VisitLandingProps) {
  const [mode, setMode] = useState<'landing' | 'register' | 'login'>('landing');
  const [geoCoords, setGeoCoords] = useState<GeoCoords | null>(null);

  // 접속하자마자 위치 정보 권한을 요청합니다 (QR 부정 스캔 방지용).
  // 거부/미지원이어도 이 화면 자체는 그대로 진행됩니다 — 실제 등록 차단 여부는
  // 서버에서 좌표 유무에 따라 판단합니다.
  useEffect(() => {
    if (!isOpen) return;
    getCurrentPositionWithRetry().then((result) => setGeoCoords(result.coords));
  }, [isOpen]);

  if (mode === 'register') {
    return <RegisterForm onBack={() => setMode('landing')} geoCoords={geoCoords} />;
  }

  if (mode === 'login') {
    return <LoginForm onBack={() => setMode('landing')} />;
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <div className="w-full max-w-sm text-center space-y-8">
        {/* 상단: 로고 + 타이틀 */}
        <header className="space-y-4">
          <BrandLogo height={72} textClassName="text-3xl" />
          <div>
            <h1 className="text-2xl font-bold text-[#2D5A3D] leading-tight">
              해율 자연의 흐름 전자여권
            </h1>
            <p className="mt-2 text-base text-[#7A7A6E]">
              자연의 흐름을 맛으로 전합니다.
            </p>
          </div>
        </header>

        {storeName && (
          <p className="text-[15px] font-semibold text-[#2D5A3D]">
            {storeName} 방문이 확인되었습니다.
          </p>
        )}

        {!isOpen ? (
          <div className="bg-[#F5F5EC] border-2 border-[#E0E0D0] rounded-2xl p-6 space-y-2">
            <p className="text-[17px] font-bold text-[#44443C] leading-relaxed">
              지금은 매장 운영시간이 아닙니다.
            </p>
            <p className="text-[15px] font-medium text-[#6B6B5E] leading-relaxed">
              매일 오전 10시~오후 9시에<br />
              가입 및 방문 등록을 이용하실 수 있습니다.
            </p>
          </div>
        ) : (
          <>
            {/* 버튼 */}
            <div className="space-y-4">
              <button
                onClick={() => setMode('register')}
                className="w-full py-4 px-6 bg-[#2D5A3D] text-white text-lg font-semibold rounded-2xl
                           shadow-md hover:bg-[#245032] active:scale-[0.98]
                           transition-all duration-200"
                id="btn-register"
              >
                처음 발급하기
              </button>

              <button
                onClick={() => setMode('login')}
                className="w-full py-4 px-6 bg-white text-[#2D5A3D] text-lg font-semibold rounded-2xl
                           border-2 border-[#2D5A3D] shadow-sm
                           hover:bg-[#F5F5EC] active:scale-[0.98]
                           transition-all duration-200"
                id="btn-login"
              >
                기존 전자여권 열기
              </button>
            </div>

            {/* 안내 문구 */}
            <div className="pt-4 px-2">
              <p className="text-[15px] text-[#8C8C80] leading-relaxed">
                앱 설치 없이 간편하게 이용할 수 있습니다.
              </p>
              <p className="mt-2 text-[15px] text-[#8C8C80] leading-relaxed">
                오늘의 방문이 기록되고, 방문할수록<br />
                해율이 준비한 할인권을 받으실 수 있습니다.
              </p>
            </div>
          </>
        )}

        {/* 하단 핵심 문구 */}
        <footer className="pt-6 border-t border-[#E8E4DA]">
          <p className="text-sm text-[#A0A090] leading-relaxed">
            자연을 만난 오늘의 시간이<br />
            해율 전자여권에 기록됩니다.
          </p>
        </footer>
      </div>
    </main>
  );
}
