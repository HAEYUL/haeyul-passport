'use client';

import type { ActiveNotice } from '@/app/actions';

interface NoticeDetailProps {
  notice: ActiveNotice;
  onBack: () => void;
}

const KIND_LABEL: Record<ActiveNotice['kind'], string> = {
  notice: '알림',
  event: '이벤트',
};

export default function NoticeDetail({ notice, onBack }: NoticeDetailProps) {
  const isEvent = notice.kind === 'event';

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-sm mx-auto space-y-5">
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

        <div className="space-y-2">
          <span
            className={`inline-flex items-center px-3 py-1 rounded-full text-[13px] font-bold text-white ${
              isEvent ? 'bg-[#C15B82]' : 'bg-[#4E7DB5]'
            }`}
          >
            {KIND_LABEL[notice.kind]}
          </span>
          <h1 className="text-xl font-bold text-[#2C2C2C] leading-snug">{notice.title}</h1>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA]">
          <p className="text-[16px] text-[#3A3A34] leading-relaxed whitespace-pre-line">
            {notice.body}
          </p>
        </div>
      </div>
    </main>
  );
}
