'use client';

import { useState } from 'react';
import Link from 'next/link';
import { updateMarketingConsent, updateBirthDate, withdrawCustomer } from '@/app/actions';
import { formatDateKR, isoDateToBirthDigits } from '@/lib/utils';
import BirthDateKeypad from '@/components/BirthDateKeypad';
import type { Customer } from '@/types/database';

interface MyInfoProps {
  customer: Customer;
  onBack: () => void;
  onUpdated: () => void;
  onLogout: () => void;
}

export default function MyInfo({ customer, onBack, onUpdated, onLogout }: MyInfoProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [editingBirthDate, setEditingBirthDate] = useState(false);
  const [birthDigits, setBirthDigits] = useState(customer.birth_date ? isoDateToBirthDigits(customer.birth_date) : '');
  const [birthDateSaving, setBirthDateSaving] = useState(false);
  const [birthDateError, setBirthDateError] = useState('');

  const [showWithdrawConfirm, setShowWithdrawConfirm] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [withdrawError, setWithdrawError] = useState('');

  async function handleWithdraw() {
    setWithdrawing(true);
    setWithdrawError('');

    const result = await withdrawCustomer();

    if (result.success) {
      window.location.href = '/';
      return;
    }

    setWithdrawing(false);
    setShowWithdrawConfirm(false);
    setWithdrawError(result.error || '탈퇴 처리 중 오류가 발생했습니다.');
  }

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

  function startEditBirthDate() {
    setBirthDigits(customer.birth_date ? isoDateToBirthDigits(customer.birth_date) : '');
    setBirthDateError('');
    setEditingBirthDate(true);
  }

  async function handleSaveBirthDate() {
    setBirthDateSaving(true);
    setBirthDateError('');

    const result = await updateBirthDate(birthDigits);

    setBirthDateSaving(false);

    if (result.success) {
      setEditingBirthDate(false);
      onUpdated();
    } else {
      setBirthDateError(result.error || '변경 중 오류가 발생했습니다.');
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
          <div className="border-t border-[#F0EDE6] pt-3">
            {editingBirthDate ? (
              <div className="space-y-3">
                <BirthDateKeypad value={birthDigits} onChange={setBirthDigits} required />
                {birthDateError && <p className="text-sm text-[#D4442A]">{birthDateError}</p>}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={() => setEditingBirthDate(false)}
                    disabled={birthDateSaving}
                    className="flex-1 py-2.5 px-4 bg-white text-[#8C8C80] text-sm font-medium rounded-xl
                               border border-[#D4D0C8] hover:bg-[#F5F5EC] transition-colors duration-200
                               disabled:cursor-not-allowed"
                    type="button"
                  >
                    취소
                  </button>
                  <button
                    onClick={handleSaveBirthDate}
                    disabled={birthDateSaving || birthDigits.length !== 6}
                    className="flex-1 py-2.5 px-4 bg-[#2D5A3D] text-white text-sm font-semibold rounded-xl
                               hover:bg-[#245032] transition-colors duration-200 disabled:opacity-60"
                    type="button"
                  >
                    {birthDateSaving ? '저장 중...' : '저장'}
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <span className="text-[15px] text-[#8C8C80]">생년월일</span>
                <div className="flex items-center gap-2">
                  <span className="text-[15px] font-medium text-[#333]">
                    {customer.birth_date ? formatDateKR(customer.birth_date) : '미입력'}
                  </span>
                  <button
                    onClick={startEditBirthDate}
                    className="text-sm font-semibold text-[#2D5A3D] underline"
                    type="button"
                  >
                    수정
                  </button>
                </div>
              </div>
            )}
          </div>
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

        {/* 로그아웃 */}
        <button
          onClick={onLogout}
          type="button"
          className="w-full min-h-[52px] py-3 px-4 rounded-xl text-base font-bold text-[#A8391F] bg-[#FFF0EA]
                     border-2 border-[#F0C4B8] hover:bg-[#FCDFD3] transition-colors duration-200"
          id="btn-logout"
        >
          로그아웃
        </button>

        {withdrawError && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
            {withdrawError}
          </div>
        )}

        {/* 개인정보처리방침 / 회원 탈퇴 */}
        <div className="flex items-center justify-center gap-4 pt-2">
          <Link href="/privacy-policy" className="text-sm text-[#8C8C80] underline">
            개인정보처리방침
          </Link>
          <span className="text-[#D4D0C8]">|</span>
          <button
            onClick={() => setShowWithdrawConfirm(true)}
            type="button"
            className="text-sm text-[#8C8C80] underline"
          >
            회원 탈퇴
          </button>
        </div>

        <div className="pb-8" />
      </div>

      {/* 회원 탈퇴 확인 모달 */}
      {showWithdrawConfirm && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-6 py-8">
          <div className="w-full max-w-sm bg-white rounded-2xl p-6 space-y-5 shadow-lg">
            <div className="space-y-2">
              <p className="text-xl font-bold text-[#2D5A3D]">정말 탈퇴하시겠습니까?</p>
              <p className="text-[15px] font-medium text-[#7A4A16] bg-[#FFF3E4] border border-[#EAC28E] rounded-xl px-4 py-3">
                탈퇴하면 방문기록·할인권을 포함한 모든 정보가 즉시 삭제되며,
                삭제된 정보는 복구할 수 없습니다.
              </p>
            </div>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => setShowWithdrawConfirm(false)}
                disabled={withdrawing}
                className="flex-1 min-h-[52px] py-3 px-4 bg-white text-[#55534A] text-base font-bold rounded-xl
                           border-2 border-[#D4D0C8] active:scale-[0.98] transition-all duration-200
                           disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="flex-1 min-h-[52px] py-3 px-4 bg-[#A8391F] text-white text-base font-bold rounded-xl
                           shadow-sm hover:bg-[#8C2E18] active:scale-[0.98] transition-all duration-200
                           disabled:cursor-not-allowed disabled:opacity-60"
              >
                {withdrawing ? '처리 중...' : '탈퇴하기'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
