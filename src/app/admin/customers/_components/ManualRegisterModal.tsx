'use client';

import { useState, useEffect } from 'react';
import { adminRegisterCustomer, getStores } from '@/app/admin/actions';
import { getTodayKST, isValidPhone } from '@/lib/utils';
import type { Store } from '@/types/database';

interface ManualRegisterModalProps {
  onClose: () => void;
  onRegistered: () => void;
}

/**
 * 매장 밖에서 만난 단골손님을 관리자가 대신 등록하는 모달.
 * QR 스캔·위치 확인 없이 관리자 로그인 자체를 신뢰의 근거로 삼습니다.
 */
export default function ManualRegisterModal({ onClose, onRegistered }: ManualRegisterModalProps) {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [storeId, setStoreId] = useState('');
  const [marketingConsent, setMarketingConsent] = useState(false);
  const [consentConfirmed, setConsentConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ customerNumber: string } | null>(null);

  useEffect(() => {
    getStores().then((res) => {
      if (res.success && res.data) {
        setStores(res.data);
        if (res.data.length > 0) {
          setStoreId((prev) => prev || res.data![0].id);
        }
      }
    });
  }, []);

  async function handleSubmit() {
    if (!name.trim()) {
      setError('성함을 입력해 주세요.');
      return;
    }
    if (!isValidPhone(phone)) {
      setError('올바른 휴대전화 번호를 입력해 주세요.');
      return;
    }
    if (!birthDate) {
      setError('생년월일을 입력해 주세요.');
      return;
    }
    if (!storeId) {
      setError('가입 매장을 선택해 주세요.');
      return;
    }
    if (!consentConfirmed) {
      setError('개인정보 수집·이용 동의를 받았는지 확인해 주세요.');
      return;
    }

    setLoading(true);
    setError('');
    const res = await adminRegisterCustomer({ name, phone, birthDate, storeId, marketingConsent });
    setLoading(false);

    if (res.success && res.data) {
      setResult({ customerNumber: res.data.customerNumber });
      onRegistered();
    } else {
      setError(res.error || '등록 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#2D5A3D]">신규 회원 등록 (매장 밖 가입)</h2>

        {result ? (
          <div className="space-y-4">
            <p className="text-[15px] text-[#333]">
              {name}님({result.customerNumber}) 등록이 완료되었습니다.
              <br />
              실제 매장 방문 시 QR을 찍으면 그때부터 방문 기록이 쌓입니다.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full px-4 py-2.5 rounded-xl bg-[#2D5A3D] text-white font-semibold
                         hover:bg-[#245032] transition-colors duration-200"
            >
              닫기
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-[#6B6B5E] leading-relaxed">
              매장 밖에서 만난 단골손님을 QR/위치 확인 없이 바로 등록합니다. 실제 방문 기록은 만들지
              않으니, 이후 매장에서 QR을 찍으면 그때부터 방문횟수가 쌓입니다.
            </p>

            <div>
              <label htmlFor="mr-name" className="block text-sm font-medium text-[#333] mb-1.5">
                성함
              </label>
              <input
                id="mr-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="예: 홍길동"
                className="w-full px-3.5 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                           bg-white placeholder-[#B0B0A0] focus:border-[#2D5A3D] focus:outline-none
                           transition-colors duration-200"
              />
            </div>

            <div>
              <label htmlFor="mr-phone" className="block text-sm font-medium text-[#333] mb-1.5">
                휴대전화 번호
              </label>
              <input
                id="mr-phone"
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="예: 010-1234-5678"
                className="w-full px-3.5 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                           bg-white placeholder-[#B0B0A0] focus:border-[#2D5A3D] focus:outline-none
                           transition-colors duration-200"
              />
            </div>

            <div>
              <label htmlFor="mr-birth" className="block text-sm font-medium text-[#333] mb-1.5">
                생년월일
              </label>
              <input
                id="mr-birth"
                type="date"
                value={birthDate}
                max={getTodayKST()}
                onChange={(e) => setBirthDate(e.target.value)}
                className="w-full px-3.5 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                           bg-white focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
              />
            </div>

            <div>
              <label htmlFor="mr-store" className="block text-sm font-medium text-[#333] mb-1.5">
                가입 매장
              </label>
              <select
                id="mr-store"
                value={storeId}
                onChange={(e) => setStoreId(e.target.value)}
                className="w-full px-3.5 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                           bg-white focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
              >
                {!stores && <option>불러오는 중...</option>}
                {stores?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>

            <label className="flex items-center gap-2 text-sm text-[#333]">
              <input
                type="checkbox"
                checked={marketingConsent}
                onChange={(e) => setMarketingConsent(e.target.checked)}
                className="w-4 h-4"
              />
              혜택·소식 문자 수신에 동의함
            </label>

            <label className="flex items-start gap-2 text-sm text-[#333] bg-[#F8F7F2] rounded-xl px-3.5 py-3">
              <input
                type="checkbox"
                checked={consentConfirmed}
                onChange={(e) => setConsentConfirmed(e.target.checked)}
                className="w-4 h-4 mt-0.5 flex-shrink-0"
              />
              <span>본인에게 개인정보(이름·전화번호·생년월일) 수집·이용에 대한 동의를 직접 받았음을 확인합니다.</span>
            </label>

            {error && (
              <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-[#D4D0C8] text-[#2D5A3D]
                           font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={loading}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#2D5A3D] text-white font-semibold
                           hover:bg-[#245032] transition-colors duration-200
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? '등록 중...' : '등록'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
