'use client';

import { useState, useEffect, useCallback } from 'react';
import QRCode from 'qrcode';
import { getQrStatus, reissueQr, type QrStatusInfo } from '@/app/admin/actions';
import { formatDateKR } from '@/lib/utils';

function buildVisitUrl(token: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL || window.location.origin;
  return `${base}/visit?key=${token}`;
}

export default function QrManagement() {
  const [status, setStatus] = useState<QrStatusInfo | null>(null);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [qrError, setQrError] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [reissuing, setReissuing] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');

  const fetchStatus = useCallback(async () => {
    const result = await getQrStatus();
    if (result.success && result.data) {
      setStatus(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || 'QR 상태를 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  useEffect(() => {
    if (!status) return;

    let cancelled = false;
    setQrDataUrl(null);
    setQrError('');

    QRCode.toDataURL(buildVisitUrl(status.token), { width: 480, margin: 2 })
      .then((url) => {
        if (!cancelled) setQrDataUrl(url);
      })
      .catch(() => {
        if (!cancelled) setQrError('QR 이미지를 생성하는 중 오류가 발생했습니다.');
      });

    return () => {
      cancelled = true;
    };
  }, [status]);

  async function handleReissueConfirm() {
    setReissuing(true);
    setError('');
    const result = await reissueQr();
    setReissuing(false);
    setConfirming(false);

    if (result.success && result.data) {
      setStatus(result.data);
      setSuccessMessage('QR이 재발급되었습니다. 기존 QR은 더 이상 사용할 수 없습니다.');
    } else if (!result.success) {
      setError(result.error || '재발급 중 오류가 발생했습니다.');
    }
  }

  function handleDownload() {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `해율_방문QR_${formatDateKR(new Date().toISOString())}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  function handlePrint() {
    if (!status) return;
    const url = buildVisitUrl(status.token);
    window.open(`/admin/settings/qr-print?url=${encodeURIComponent(url)}`, '_blank');
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#8C8C80]">
        매장 방문등록용 QR을 관리합니다. 재발급하면 기존 QR은 즉시 사용할 수 없게 됩니다.
      </p>

      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-[#F0F7F2] border border-[#C4DCC9] text-[#2D5A3D] px-4 py-3 rounded-xl text-[15px]">
          {successMessage}
        </div>
      )}

      {!status ? (
        <div className="h-64 rounded-2xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] space-y-5">
          <div className="flex flex-col items-center gap-3">
            {qrError ? (
              <div className="w-60 h-60 flex items-center justify-center bg-[#FFF8F0] border border-[#F0D4B8] rounded-xl text-sm text-[#996633] text-center px-4">
                {qrError}
              </div>
            ) : !qrDataUrl ? (
              <div className="w-60 h-60 rounded-xl bg-[#E8E8E0] animate-pulse" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="방문등록 QR코드" className="w-60 h-60" />
            )}
          </div>

          <div className="border-t border-[#F0EDE6] pt-4 space-y-2">
            <div className="flex items-center justify-between text-[15px]">
              <span className="text-[#8C8C80]">상태</span>
              <span className="font-semibold text-[#2D5A3D]">사용 중</span>
            </div>
            <div className="flex items-center justify-between text-[15px]">
              <span className="text-[#8C8C80]">생성일</span>
              <span className="text-[#333]">{formatDateKR(status.createdAt)}</span>
            </div>
            <div className="flex items-center justify-between text-[15px]">
              <span className="text-[#8C8C80]">최근 재발급일</span>
              <span className="text-[#333]">
                {status.lastReissuedAt ? formatDateKR(status.lastReissuedAt) : '재발급한 적 없음'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={handleDownload}
              disabled={!qrDataUrl}
              className="py-3 px-4 bg-[#2D5A3D] text-white text-sm font-semibold rounded-xl
                         hover:bg-[#245032] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              QR 다운로드
            </button>
            <button
              type="button"
              onClick={handlePrint}
              disabled={!qrDataUrl}
              className="py-3 px-4 bg-white text-[#2D5A3D] text-sm font-semibold rounded-xl
                         border-2 border-[#D4D0C8] hover:bg-[#F5F5EC] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              QR 인쇄
            </button>
          </div>

          {!confirming ? (
            <button
              type="button"
              onClick={() => {
                setSuccessMessage('');
                setConfirming(true);
              }}
              className="w-full py-3 px-4 bg-white text-[#D4442A] text-sm font-semibold rounded-xl
                         border-2 border-[#F0D4B8] hover:bg-[#FFF8F0] transition-colors duration-200"
            >
              QR 재발급
            </button>
          ) : (
            <div className="bg-[#FFF8F0] border border-[#F0D4B8] rounded-xl p-4 space-y-3">
              <p className="text-[15px] text-[#996633] leading-relaxed whitespace-pre-line">
                QR을 재발급하면 기존 QR은 즉시 사용할 수 없습니다.{'\n'}계속하시겠습니까?
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setConfirming(false)}
                  disabled={reissuing}
                  className="flex-1 py-2.5 px-4 bg-white text-[#8C8C80] text-sm font-semibold rounded-xl border-2 border-[#D4D0C8]"
                >
                  취소
                </button>
                <button
                  type="button"
                  onClick={handleReissueConfirm}
                  disabled={reissuing}
                  className="flex-1 py-2.5 px-4 bg-[#D4442A] text-white text-sm font-semibold rounded-xl disabled:opacity-50"
                >
                  {reissuing ? '재발급 중...' : '재발급 확인'}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
