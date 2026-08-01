'use client';

import { useState } from 'react';
import { registerCustomer } from '@/app/actions';

interface RegisterFormProps {
  onBack: () => void;
}

/**
 * 신규회원 가입 폼
 * 기획서 섹션 5 기준
 *
 * 가입 성공 시 /welcome으로 이동합니다. registerCustomer가 로그인 세션을
 * 설정하기 때문에, 이 화면(/visit)에 그대로 머물러 성공 상태를 보여주면
 * 세션이 생긴 것을 감지한 /visit의 리다이렉트 로직에 의해 화면이 곧바로
 * /passport로 덮여버립니다. 그래서 성공 화면은 별도 라우트로 분리했습니다.
 */
export default function RegisterForm({ onBack }: RegisterFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  // 개인정보 동의 체크
  const [privacyConsent, setPrivacyConsent] = useState(false);
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [showPrivacyDetail, setShowPrivacyDetail] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const form = e.currentTarget;
    const formData = new FormData(form);
    formData.set('privacy_consent', privacyConsent.toString());
    formData.set('marketing_consent', marketingConsent.toString());

    const result = await registerCustomer(formData);

    if (result.success) {
      window.location.href = '/welcome';
      return;
    }

    setIsLoading(false);
    setError(result.error || '가입 중 오류가 발생했습니다.');
  }

  // ─── 가입 폼 화면 ─────────────────────────
  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* 뒤로 가기 */}
        <button
          onClick={onBack}
          className="flex items-center text-[#2D5A3D] text-base font-medium"
          type="button"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </button>

        {/* 타이틀 */}
        <header>
          <h1 className="text-2xl font-bold text-[#2D5A3D]">
            전자여권 발급
          </h1>
          <p className="mt-2 text-[15px] text-[#8C8C80]">
            아래 정보를 입력하시면<br />
            해율 자연의 흐름 전자여권이 발급됩니다.
          </p>
        </header>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        {/* 가입 폼 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 성함 (필수) */}
          <div>
            <label htmlFor="input-name" className="block text-base font-medium text-[#333] mb-2">
              성함 <span className="text-red-500">*</span>
            </label>
            <input
              id="input-name"
              name="name"
              type="text"
              required
              placeholder="예: 홍길동"
              autoComplete="name"
              className="w-full px-4 py-3.5 text-[17px] border-2 border-[#D4D0C8] rounded-xl
                         bg-white placeholder-[#B0B0A0]
                         focus:border-[#2D5A3D] focus:outline-none
                         transition-colors duration-200"
            />
          </div>

          {/* 휴대전화 번호 (필수) */}
          <div>
            <label htmlFor="input-phone" className="block text-base font-medium text-[#333] mb-2">
              휴대전화 번호 <span className="text-red-500">*</span>
            </label>
            <input
              id="input-phone"
              name="phone"
              type="tel"
              required
              placeholder="예: 010-1234-5678"
              autoComplete="tel"
              inputMode="numeric"
              className="w-full px-4 py-3.5 text-[17px] border-2 border-[#D4D0C8] rounded-xl
                         bg-white placeholder-[#B0B0A0]
                         focus:border-[#2D5A3D] focus:outline-none
                         transition-colors duration-200"
            />
          </div>

          {/* 생년월일 (선택) */}
          <div>
            <label htmlFor="input-birth" className="block text-base font-medium text-[#333] mb-2">
              생년월일 <span className="text-sm text-[#AAA]">(선택)</span>
            </label>
            <input
              id="input-birth"
              name="birth_date"
              type="date"
              className="w-full px-4 py-3.5 text-[17px] border-2 border-[#D4D0C8] rounded-xl
                         bg-white text-[#555]
                         focus:border-[#2D5A3D] focus:outline-none
                         transition-colors duration-200"
            />
          </div>

          {/* 구분선 */}
          <hr className="border-[#E8E4DA]" />

          {/* 개인정보 동의 (필수) */}
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <input
                id="check-privacy"
                type="checkbox"
                checked={privacyConsent}
                onChange={(e) => setPrivacyConsent(e.target.checked)}
                className="mt-1 w-5 h-5 accent-[#2D5A3D] flex-shrink-0 cursor-pointer"
              />
              <label htmlFor="check-privacy" className="text-[15px] text-[#333] leading-snug cursor-pointer">
                <span className="text-red-500">[필수]</span>{' '}
                개인정보 수집·이용에 동의합니다.
                <button
                  type="button"
                  onClick={() => setShowPrivacyDetail(!showPrivacyDetail)}
                  className="ml-1 text-[#2D5A3D] underline text-sm"
                >
                  내용 보기
                </button>
              </label>
            </div>

            {/* 개인정보 동의 상세 */}
            {showPrivacyDetail && (
              <div className="bg-[#F5F5EC] rounded-xl p-4 text-sm text-[#666] leading-relaxed">
                <p className="font-semibold text-[#333] mb-2">개인정보 수집·이용 안내</p>
                <ul className="space-y-1 list-disc list-inside">
                  <li>수집 항목: 성함, 휴대전화 번호, 방문 기록</li>
                  <li>수집 목적: 방문 기록 관리 및 선물 제공</li>
                  <li>보유 기간: 회원 탈퇴 시까지</li>
                  <li>동의를 거부할 수 있으며, 거부 시 서비스 이용이 제한됩니다.</li>
                </ul>
                <p className="mt-3 text-xs text-[#999]">
                  ※ 본 내용은 시험 운영용 임시 문구입니다.<br />
                  실제 운영 전 법률 전문가의 검토가 필요합니다.
                </p>
              </div>
            )}

            {/* 마케팅 동의 (선택) */}
            <div className="flex items-start gap-3">
              <input
                id="check-marketing"
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="mt-1 w-5 h-5 accent-[#2D5A3D] flex-shrink-0 cursor-pointer"
              />
              <label htmlFor="check-marketing" className="text-[15px] text-[#333] leading-snug cursor-pointer">
                <span className="text-[#AAA]">[선택]</span>{' '}
                혜택 및 소식 수신에 동의합니다.
              </label>
            </div>
          </div>

          {/* 가입 버튼 */}
          <button
            type="submit"
            disabled={isLoading || !privacyConsent}
            className={`w-full py-4 px-6 text-lg font-semibold rounded-2xl shadow-md
                       transition-all duration-200
                       ${
                         privacyConsent
                           ? 'bg-[#2D5A3D] text-white hover:bg-[#245032] active:scale-[0.98]'
                           : 'bg-[#CCC] text-white cursor-not-allowed'
                       }`}
            id="btn-submit-register"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                처리 중...
              </span>
            ) : (
              '전자여권 발급하기'
            )}
          </button>
        </form>

        {/* 하단 안내 */}
        <p className="text-center text-sm text-[#AAA] pb-8">
          가입 시 첫 방문이 자동으로 기록됩니다.
        </p>
      </div>
    </main>
  );
}
