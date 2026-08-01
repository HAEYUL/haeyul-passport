'use client';

import { useState } from 'react';
import { updateMarketingConsent } from '@/app/actions';
import { formatDateKR } from '@/lib/utils';
import type { Customer } from '@/types/database';

interface MyInfoProps {
  customer: Customer;
  onBack: () => void;
  onUpdated: () => void;
}

export default function MyInfo({ customer, onBack, onUpdated }: MyInfoProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleToggleConsent() {
    setLoading(true);
    setError('');

    const result = await updateMarketingConsent(!customer.marketing_consent);

    setLoading(false);

    if (result.success) {
      onUpdated();
    } else {
      setError(result.error || '변경 중 오류가 발생했습니다.');
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
        <h1 className="text-2xl font-bold text-[#2D5A3D]">내 정보</h1>

        {error && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        {/* 회원 정보 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] space-y-3">
          <div className="flex justify-between">
            <span className="text-[15px] text-[#8C8C80]">성함</span>
            <span className="text-[15px] font-medium text-[#333]">{customer.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[15px] text-[#8C8C80]">회원번호</span>
            <span className="text-[15px] font-medium text-[#333]">{customer.customer_number}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-[15px] text-[#8C8C80]">휴대전화 번호</span>
            <span className="text-[15px] font-medium text-[#333]">{customer.phone}</span>
          </div>
          {customer.birth_date && (
            <div className="flex justify-between">
              <span className="text-[15px] text-[#8C8C80]">생년월일</span>
              <span className="text-[15px] font-medium text-[#333]">
                {formatDateKR(customer.birth_date)}
              </span>
            </div>
          )}
          <div className="flex justify-between">
            <span className="text-[15px] text-[#8C8C80]">가입일</span>
            <span className="text-[15px] font-medium text-[#333]">
              {formatDateKR(customer.created_at)}
            </span>
          </div>
        </div>

        {/* 마케팅 수신 동의 */}
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-medium text-[#333]">혜택 및 소식 수신</p>
              <p className="mt-1 text-sm text-[#8C8C80]">
                {customer.marketing_consent ? '동의 중입니다.' : '동의하지 않고 있습니다.'}
              </p>
            </div>
            <button
              onClick={handleToggleConsent}
              disabled={loading}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition-colors duration-200
                         disabled:cursor-not-allowed disabled:opacity-60
                         ${
                           customer.marketing_consent
                             ? 'bg-white text-[#8C8C80] border border-[#D4D0C8] hover:bg-[#F5F5EC]'
                             : 'bg-[#2D5A3D] text-white hover:bg-[#245032]'
                         }`}
            >
              {loading ? '처리 중...' : customer.marketing_consent ? '동의 취소' : '동의하기'}
            </button>
          </div>
        </div>

        <div className="pb-8" />
      </div>
    </main>
  );
}
