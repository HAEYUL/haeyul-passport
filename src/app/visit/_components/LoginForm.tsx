'use client';

import { useState } from 'react';
import { loginCustomer } from '@/app/actions';
import BirthDateKeypad from '@/components/BirthDateKeypad';

interface LoginFormProps {
  onBack: () => void;
}

/**
 * 기존회원 접속 폼
 * 기획서 섹션 6 기준
 */
export default function LoginForm({ onBack }: LoginFormProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [birthDigits, setBirthDigits] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    const formData = new FormData(e.currentTarget);
    formData.set('birth_date_digits', birthDigits);

    const result = await loginCustomer(formData);

    setIsLoading(false);

    if (result.success && result.data) {
      // 세션은 서버에서 쿠키로 관리됨
      window.location.href = '/passport';
    } else {
      setError(result.error || '로그인 중 오류가 발생했습니다.');
    }
  }

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
            기존 전자여권 열기
          </h1>
          <p className="mt-2 text-[15px] text-[#8C8C80]">
            가입하신 성함, 휴대전화 번호, 생년월일을<br />
            입력해 주세요.
          </p>
        </header>

        {/* 에러 메시지 */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        {/* 로그인 폼 */}
        <form onSubmit={handleSubmit} className="space-y-5">
          {/* 성함 */}
          <div>
            <label htmlFor="login-name" className="block text-base font-medium text-[#333] mb-2">
              성함
            </label>
            <input
              id="login-name"
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

          {/* 휴대전화 번호 */}
          <div>
            <label htmlFor="login-phone" className="block text-base font-medium text-[#333] mb-2">
              휴대전화 번호
            </label>
            <input
              id="login-phone"
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

          {/* 생년월일 6자리 (본인확인) */}
          <BirthDateKeypad value={birthDigits} onChange={setBirthDigits} required />
          <p className="text-sm text-[#8C8C80] leading-relaxed -mt-2">
            처음 등록하신 분은 이번에 입력하신 생년월일이 그대로 등록되며,
            다음부터는 같은 기기에서 별도 입력 없이 자동으로 열립니다.
          </p>

          {/* 로그인 버튼 */}
          <button
            type="submit"
            disabled={isLoading || birthDigits.length !== 6}
            className="w-full py-4 px-6 bg-[#2D5A3D] text-white text-lg font-semibold rounded-2xl
                       shadow-md hover:bg-[#245032] active:scale-[0.98]
                       transition-all duration-200 disabled:bg-[#CCC] disabled:cursor-not-allowed"
            id="btn-submit-login"
          >
            {isLoading ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin w-5 h-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                확인 중...
              </span>
            ) : (
              '전자여권 열기'
            )}
          </button>
        </form>

        {/* 안내 */}
        <div className="text-center space-y-2 pt-4">
          <p className="text-[15px] text-[#AAA]">
            아직 전자여권이 없으신가요?
          </p>
          <button
            onClick={onBack}
            className="text-[#2D5A3D] font-medium text-base underline"
            type="button"
          >
            처음 발급하기
          </button>
        </div>
      </div>
    </main>
  );
}
