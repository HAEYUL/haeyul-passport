'use client';

import { useState, useRef } from 'react';
import RegisterForm from './RegisterForm';
import LoginForm from './LoginForm';
import BrandLogo from '@/components/BrandLogo';
import { getCurrentPositionWithRetry, type GeoCoords } from '@/lib/geolocation';
import { STORE_NAMES, STORE_ACCENTS, DEFAULT_STORE_ACCENT } from '@/lib/storeAccents';

interface VisitLandingProps {
  /** QR 스캔으로 확인된 매장 이름. 확인 안 됐으면 null */
  storeName: string | null;
  /** 지금이 매장 운영시간(오전 10시~오후 9시) 이내인지 */
  isOpen: boolean;
  /** 가입 축하 할인권 금액(원). 규칙이 꺼져 있으면 null */
  signupGiftAmount: number | null;
}

/**
 * 가입 첫 화면 세 매장 안내 문구 — 어떤 음식을 파는 곳인지 한 줄로.
 * 앞부분(음식 소개)은 보통 굵기, 상호는 더 굵고 크게 보여줍니다.
 */
const LANDING_STORE_LABELS: Record<string, { lead: string; name: string }> = {
  '해율만두전골': { lead: '자연보양전골은', name: '해율만두전골' },
  '곤드레밥집': { lead: '건강한 밥상은 수지', name: '곤드레밥집' },
  '정담명가 남원추어탕': { lead: '추어탕은 수지', name: '정담명가 남원추어탕' },
};

/**
 * QR 접속 후 첫 화면
 * - 처음 발급하기
 * - 기존 여권 열기
 */
export default function VisitLanding({ storeName, isOpen, signupGiftAmount }: VisitLandingProps) {
  const [mode, setMode] = useState<'landing' | 'register' | 'login'>('landing');
  const [geoCoords, setGeoCoords] = useState<GeoCoords | null>(null);
  const geoRequestedRef = useRef(false);

  // 위치 정보 권한은 "처음 발급하기"를 누른 뒤에 요청합니다 (QR 부정 스캔 방지용).
  // 화면이 뜨자마자 이유 없이 팝업이 뜨면 거부하기 쉽고, 기존 여권 열기(로그인)에는
  // 위치가 필요 없기 때문입니다. 가입 정보를 입력하는 동안 좌표를 받아 둡니다.
  // 거부/미지원이어도 가입은 그대로 진행되며, 차단 여부는 서버에서 판단합니다.
  function startRegister() {
    if (!geoRequestedRef.current) {
      geoRequestedRef.current = true;
      getCurrentPositionWithRetry().then((result) => setGeoCoords(result.coords));
    }
    setMode('register');
  }

  if (mode === 'register') {
    return <RegisterForm onBack={() => setMode('landing')} geoCoords={geoCoords} />;
  }

  if (mode === 'login') {
    return <LoginForm onBack={() => setMode('landing')} />;
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-10">
      <div className="w-full max-w-sm text-center space-y-6">
        {/* 상단: 로고 + 타이틀 */}
        <header className="space-y-2">
          {/* 로고 글자("해율푸드여권")가 제목을 대신합니다 */}
          <h1>
            <BrandLogo height={64} textClassName="text-3xl" />
          </h1>
          <p className="text-lg font-bold text-[#44443C]">
            해율푸드의 세 가지 건강한 한식
          </p>
        </header>

        {storeName && (
          <p className="text-[17px] font-bold text-[#2D5A3D]">
            ✓ {storeName} 방문이 확인되었어요
          </p>
        )}

        {/* 세 매장 안내 — 세 매장 방문기록이 한 여권에 함께 쌓인다는 사실만 짧게 보여줍니다 */}
        <section className="bg-white rounded-2xl border-2 border-[#E0DCD0] px-4 py-4 space-y-3">
          <p className="text-[17px] font-bold text-[#2C2C2C] leading-snug">
            세 매장 방문기록이 함께 쌓여요
          </p>
          <ul className="space-y-2">
            {STORE_NAMES.map((name) => {
              const accent = STORE_ACCENTS[name] ?? DEFAULT_STORE_ACCENT;
              const isCurrent = name === storeName;
              const label = LANDING_STORE_LABELS[name];
              return (
                <li
                  key={name}
                  className="flex flex-wrap items-center justify-center gap-x-2 gap-y-1 rounded-xl py-2.5 px-3 border-l-[6px] text-center"
                  style={{ backgroundColor: accent.bg, borderLeftColor: accent.border }}
                >
                  <span className="text-base font-medium" style={{ color: accent.text }}>
                    {label && <>{label.lead} </>}
                    <strong className="text-[17px] font-extrabold">{label?.name ?? name}</strong>
                  </span>
                  {isCurrent && (
                    <span
                      className="flex-shrink-0 rounded-full px-2.5 py-1 text-[13px] font-bold text-white"
                      style={{ backgroundColor: accent.border }}
                    >
                      지금 여기
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="text-lg font-extrabold text-[#2D5A3D]">
            음식은 달라도, 정성은 같습니다.
          </p>
        </section>

        {/* 가입 즉시 혜택 — 가입을 망설이는 손님에게 잘 보이도록 가입 버튼 바로 위에 둡니다 (운영시간 밖에도 안내) */}
        {signupGiftAmount && (
          <div className="rounded-2xl border-2 border-[#D2BFF0] bg-[#F1EAFB] px-4 py-3 space-y-0.5">
            <p className="text-lg font-extrabold text-[#5B3A96]">
              🎁 지금 가입하면 {signupGiftAmount.toLocaleString()}원 할인권을 드려요
            </p>
            <p className="text-sm font-semibold text-[#5B3A96]">다음 방문부터 1개월 동안 사용하실 수 있어요</p>
          </div>
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
            <div className="space-y-3">
              <button
                onClick={startRegister}
                className="w-full min-h-[56px] py-4 px-6 bg-[#2D5A3D] text-white text-lg font-semibold rounded-2xl
                           shadow-md hover:bg-[#245032] active:scale-[0.98]
                           transition-all duration-200"
                id="btn-register"
              >
                처음 발급하기
              </button>

              <button
                onClick={() => setMode('login')}
                className="w-full min-h-[56px] py-4 px-6 bg-white text-[#2D5A3D] text-lg font-semibold rounded-2xl
                           border-2 border-[#2D5A3D] shadow-sm
                           hover:bg-[#F5F5EC] active:scale-[0.98]
                           transition-all duration-200"
                id="btn-login"
              >
                기존 여권 열기
              </button>
            </div>

            {/* 안내 문구 */}
            <div className="px-2 space-y-2">
              <p className="text-[15px] font-medium text-[#55534A] leading-relaxed">
                방문할수록 할인권이 쌓여요.
              </p>
              <p className="text-sm text-[#8C8C80] leading-relaxed">
                앱 설치 없이 바로 쓸 수 있어요.<br />
                발급할 때 방문 확인을 위해<br />
                위치 확인을 요청해요.
              </p>
            </div>
          </>
        )}
      </div>
    </main>
  );
}
