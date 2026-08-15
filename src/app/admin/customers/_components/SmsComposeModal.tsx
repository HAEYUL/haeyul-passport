'use client';

import { useState } from 'react';
import { sendSmsToCustomers, type SmsSendResult } from '@/app/admin/actions';
import { estimateSmsByteLength, SMS_BYTE_LIMIT } from '@/lib/utils';

interface SmsComposeModalProps {
  customerIds: string[];
  /** 선택된 고객 중 마케팅 수신동의(marketing_consent)를 한 인원 수 */
  consentedCount: number;
  onClose: () => void;
}

export default function SmsComposeModal({ customerIds, consentedCount, onClose }: SmsComposeModalProps) {
  const [messageType, setMessageType] = useState<'info' | 'ad'>('info');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SmsSendResult | null>(null);
  const [error, setError] = useState('');

  const byteLength = estimateSmsByteLength(message);
  const isLms = byteLength > SMS_BYTE_LIMIT;
  const targetCount = messageType === 'ad' ? consentedCount : customerIds.length;
  const excludedPreview = messageType === 'ad' ? customerIds.length - consentedCount : 0;

  async function handleSend() {
    if (!message.trim()) {
      setError('문자 내용을 입력해 주세요.');
      return;
    }
    setSending(true);
    setError('');
    const res = await sendSmsToCustomers(customerIds, message, messageType);
    setSending(false);
    if (res.success && res.data) {
      setResult(res.data);
    } else {
      setError(res.error || '문자 발송에 실패했습니다.');
    }
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50">
      <div className="bg-white rounded-2xl shadow-lg w-full max-w-md p-6 space-y-4">
        <h2 className="text-lg font-bold text-[#2D5A3D]">문자 보내기</h2>

        {result ? (
          <div className="space-y-4">
            <p className="text-[15px] text-[#333]">
              발송 완료: 성공 {result.successCount}건, 실패 {result.errorCount}건
              {messageType === 'ad' && result.excludedCount > 0 && (
                <> (마케팅 미동의로 {result.excludedCount}명 제외됨)</>
              )}
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
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setMessageType('info')}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors duration-200 ${
                  messageType === 'info'
                    ? 'bg-[#2D5A3D] text-white border-[#2D5A3D]'
                    : 'bg-white text-[#2D5A3D] border-[#D4D0C8]'
                }`}
              >
                공지 (정보성)
              </button>
              <button
                type="button"
                onClick={() => setMessageType('ad')}
                className={`flex-1 px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors duration-200 ${
                  messageType === 'ad'
                    ? 'bg-[#2D5A3D] text-white border-[#2D5A3D]'
                    : 'bg-white text-[#2D5A3D] border-[#D4D0C8]'
                }`}
              >
                광고 (마케팅)
              </button>
            </div>

            <p className="text-sm text-[#6B6B5E]">
              받는 사람 {targetCount}명
              {messageType === 'ad' && excludedPreview > 0 && (
                <span className="text-[#8A5800]"> (마케팅 미동의 {excludedPreview}명 자동 제외)</span>
              )}
            </p>

            {messageType === 'ad' && (
              <p className="text-xs text-[#6B6B5E] bg-[#FFF8F0] border border-[#F0D4B8] rounded-lg px-3 py-2">
                문자 앞에 &quot;(광고)&quot;, 끝에 무료수신거부 안내가 자동으로 추가됩니다.
              </p>
            )}

            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={5}
              placeholder="문자 내용을 입력하세요"
              className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                         bg-white placeholder-[#B0B0A0] focus:border-[#2D5A3D] focus:outline-none
                         transition-colors duration-200 resize-none"
            />
            <p className="text-xs text-[#6B6B5E] text-right">
              {byteLength}byte {isLms ? '(장문 LMS로 발송됩니다)' : '(단문 SMS)'}
            </p>

            {error && (
              <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-sm">
                {error}
              </div>
            )}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={sending}
                className="flex-1 px-4 py-2.5 rounded-xl border-2 border-[#D4D0C8] text-[#2D5A3D]
                           font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={sending || targetCount === 0}
                className="flex-1 px-4 py-2.5 rounded-xl bg-[#2D5A3D] text-white font-semibold
                           hover:bg-[#245032] transition-colors duration-200
                           disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {sending ? '발송 중...' : `${targetCount}명에게 발송`}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
