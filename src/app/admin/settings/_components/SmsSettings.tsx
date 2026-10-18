'use client';

import { useState } from 'react';
import { checkSmsConnection, sendTestSms, type SmsConnectionStatus } from '@/app/admin/actions';

/**
 * 문자 발송 연결 확인 — 알리고는 등록된 고정 IP에서만 발송을 받으므로
 * 중계 서비스(ALIGO_PROXY_URL)를 거쳐 나가는 IP와 알리고 연결 상태를 확인하고, 테스트 문자를 보냅니다.
 */
export default function SmsSettings() {
  const [status, setStatus] = useState<SmsConnectionStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');

  const [phone, setPhone] = useState('');
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState('');
  const [sendMessage, setSendMessage] = useState('');

  async function handleCheck() {
    setChecking(true);
    setCheckError('');
    const result = await checkSmsConnection();
    setChecking(false);
    if (result.success && result.data) {
      setStatus(result.data);
    } else {
      setCheckError(result.error || '연결 확인 중 오류가 발생했습니다.');
    }
  }

  async function handleSend() {
    if (!window.confirm(`${phone} 번호로 테스트 문자 1건을 보낼까요? (알리고 잔액이 차감됩니다)`)) return;
    setSending(true);
    setSendError('');
    setSendMessage('');
    const result = await sendTestSms(phone);
    setSending(false);
    if (result.success) {
      setSendMessage('테스트 문자를 보냈습니다. 휴대폰에서 받았는지 확인해 주세요.');
    } else {
      setSendError(result.error || '문자 발송 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="space-y-6">
      <section className="bg-white rounded-2xl border-2 border-[#E0DCD0] p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[#2D5A3D]">1. 알리고 연결 확인</h2>
          <p className="text-sm text-[#6B6B5E] leading-relaxed">
            문자를 보내지 않고 연결만 확인합니다. 알리고는 미리 등록한 IP에서만 발송을 받아요.
            아래 &lsquo;나가는 IP&rsquo;가 알리고에 등록된 IP여야 합니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleCheck}
          disabled={checking}
          className="min-h-[44px] px-5 rounded-xl bg-[#2D5A3D] text-white text-sm font-semibold hover:bg-[#245032] disabled:bg-[#999]"
        >
          {checking ? '확인 중...' : '연결 확인'}
        </button>

        {checkError && <p className="text-sm font-semibold text-[#B3261E]">{checkError}</p>}

        {status && (
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm">
            <dt className="font-semibold text-[#44443C]">중계 서비스</dt>
            <dd className={status.proxyConfigured ? 'text-[#1F4A2E] font-semibold' : 'text-[#B3261E] font-semibold'}>
              {status.proxyConfigured
                ? '설정됨'
                : '설정 안 됨 — Vercel 환경변수에 ALIGO_PROXY_URL(또는 Fixie 연동의 FIXIE_URL)이 있는지 확인하고 다시 배포해 주세요'}
            </dd>

            <dt className="font-semibold text-[#44443C]">나가는 IP</dt>
            <dd className="text-[#44443C]">
              {status.outboundIp ?? '확인 실패'}
              {status.proxyConfigured && status.outboundIp && (
                <span className="ml-2 text-[#6B6B5E]">(중계 서비스의 고정 IP 중 하나여야 합니다)</span>
              )}
            </dd>

            <dt className="font-semibold text-[#44443C]">알리고 연결</dt>
            <dd>
              {status.aligoError ? (
                <span className="text-[#B3261E] font-semibold">{status.aligoError}</span>
              ) : (
                <span className="text-[#1F4A2E] font-semibold">
                  정상 — 남은 잔액으로 단문 {status.remainSms?.toLocaleString()}건 · 장문{' '}
                  {status.remainLms?.toLocaleString()}건 발송 가능
                </span>
              )}
            </dd>
          </dl>
        )}
      </section>

      <section className="bg-white rounded-2xl border-2 border-[#E0DCD0] p-6 space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[#2D5A3D]">2. 테스트 문자 보내기</h2>
          <p className="text-sm text-[#6B6B5E] leading-relaxed">
            입력한 번호로 &ldquo;[해율여권] 문자 발송 테스트입니다.&rdquo; 문자 1건을 실제로 보냅니다.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <label htmlFor="sms-test-phone" className="sr-only">
            받을 휴대전화 번호
          </label>
          <input
            id="sms-test-phone"
            type="tel"
            inputMode="numeric"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="010-1234-5678"
            className="min-h-[44px] flex-1 min-w-[200px] px-4 rounded-xl border-2 border-[#D4D0C8] text-base"
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={sending || !phone.trim()}
            className="min-h-[44px] px-5 rounded-xl bg-[#2D5A3D] text-white text-sm font-semibold hover:bg-[#245032] disabled:bg-[#999]"
          >
            {sending ? '보내는 중...' : '테스트 문자 보내기'}
          </button>
        </div>

        {sendError && <p className="text-sm font-semibold text-[#B3261E] leading-relaxed">{sendError}</p>}
        {sendMessage && <p className="text-sm font-semibold text-[#1F4A2E]">{sendMessage}</p>}
      </section>
    </div>
  );
}
