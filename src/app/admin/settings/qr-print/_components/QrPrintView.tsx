'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import QRCode from 'qrcode';
import BrandLogo from '@/components/BrandLogo';

export default function QrPrintView() {
  const searchParams = useSearchParams();
  const url = searchParams.get('url') || '';
  const storeName = searchParams.get('storeName') || '';

  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!url) {
      setError('QR 정보를 찾을 수 없습니다. QR관리 화면에서 다시 열어 주세요.');
      return;
    }
    let cancelled = false;
    QRCode.toDataURL(url, { width: 640, margin: 2 })
      .then((dataUrl) => {
        if (!cancelled) setQrDataUrl(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setError('QR 이미지를 생성하는 중 오류가 발생했습니다.');
      });
    return () => {
      cancelled = true;
    };
  }, [url]);

  return (
    <>
      <style>{`
        @page { size: A4; margin: 24mm; }
        @media print {
          .print-hidden { display: none !important; }
        }
      `}</style>
      <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
        <div className="print-hidden mb-8">
          <button
            type="button"
            onClick={() => window.print()}
            disabled={!qrDataUrl}
            className="py-3 px-6 bg-[#2D5A3D] text-white text-base font-semibold rounded-xl
                       hover:bg-[#245032] transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            인쇄하기
          </button>
        </div>

        {error ? (
          <p className="text-[15px] text-[#996633]">{error}</p>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <BrandLogo height={64} textClassName="text-2xl" />
            {storeName && (
              <p className="text-xl font-semibold text-[#2D5A3D]">{storeName}</p>
            )}
            {!qrDataUrl ? (
              <div className="w-[420px] h-[420px] rounded-xl bg-[#E8E8E0] animate-pulse" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={qrDataUrl} alt="방문등록 QR코드" className="w-[420px] h-[420px]" />
            )}
          </div>
        )}
      </main>
    </>
  );
}
