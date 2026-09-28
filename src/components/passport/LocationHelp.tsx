'use client';

import { useState } from 'react';

interface LocationHelpProps {
  /** 처음부터 펼쳐서 보여줄지 (기록이 막혔을 때는 펼침) */
  defaultOpen?: boolean;
}

/**
 * 위치 권한 허용 방법 안내 — 방문 기록은 매장 위치 확인이 필요하므로,
 * 위치를 거부했거나 확인이 안 된 손님에게 휴대폰별 허용 방법과 직원 도움 안내를 보여줍니다.
 */
export default function LocationHelp({ defaultOpen = false }: LocationHelpProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="text-left">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full min-h-[44px] flex items-center justify-between gap-2 text-[15px] font-bold text-[#7A4A16] underline underline-offset-2"
      >
        📍 위치 허용 방법 {open ? '접기' : '보기'}
        <span aria-hidden="true">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-[#44443C]">
          <div className="bg-white rounded-xl px-4 py-3 border border-[#EAC28E]">
            <p className="font-bold text-[#2C2C2C]">갤럭시 · 안드로이드</p>
            <ol className="mt-1 list-decimal pl-5 space-y-0.5">
              <li>화면 위 주소창 왼쪽의 자물쇠(또는 ⓘ)를 누르세요.</li>
              <li>[권한] 또는 [위치]를 눌러 <b>허용</b>으로 바꾸세요.</li>
              <li>화면을 새로고침한 뒤 방문 기록 버튼을 다시 누르세요.</li>
            </ol>
          </div>
          <div className="bg-white rounded-xl px-4 py-3 border border-[#EAC28E]">
            <p className="font-bold text-[#2C2C2C]">아이폰</p>
            <ol className="mt-1 list-decimal pl-5 space-y-0.5">
              <li>[설정] → [개인정보 보호 및 보안] → [위치 서비스]를 켜세요.</li>
              <li>같은 화면에서 [Safari 웹 사이트]를 <b>앱을 사용하는 동안</b>으로 바꾸세요.</li>
              <li>여권 화면으로 돌아와 방문 기록 버튼을 다시 누르세요.</li>
            </ol>
          </div>
          <p className="font-bold text-[#2D5A3D]">잘 안 되시면 직원에게 말씀해 주세요. 바로 도와드릴게요.</p>
        </div>
      )}
    </div>
  );
}
