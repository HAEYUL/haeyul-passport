'use client';

import { useState, useEffect } from 'react';
import { getVisitHistory, type VisitHistoryData } from '@/app/actions';
import { formatDateKR } from '@/lib/utils';

interface VisitHistoryProps {
  onBack: () => void;
}

/**
 * 방문기록 화면
 * 기획서 섹션 9 기준
 */
export default function VisitHistory({ onBack }: VisitHistoryProps) {
  const [data, setData] = useState<VisitHistoryData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const result = await getVisitHistory();
      if (result.success && result.data) {
        setData(result.data);
      }
      setLoading(false);
    }
    fetch();
  }, []);

  if (loading) {
    return (
      <main className="flex flex-col min-h-screen px-6 py-8">
        <div className="w-full max-w-sm mx-auto space-y-4">
          <div className="w-32 h-6 rounded bg-[#E8E8E0] animate-pulse" />
          <div className="w-full h-24 rounded-2xl bg-[#E8E8E0] animate-pulse" />
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="w-full h-12 rounded-xl bg-[#E8E8E0] animate-pulse" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-6">
        <p className="text-[#666]">방문 기록을 불러올 수 없습니다.</p>
        <button onClick={onBack} className="mt-4 text-[#2D5A3D] underline text-base">
          돌아가기
        </button>
      </main>
    );
  }

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-sm mx-auto space-y-6">
        {/* 뒤로 가기 */}
        <button
          onClick={onBack}
          className="flex items-center text-[#2D5A3D] text-base font-medium"
        >
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          돌아가기
        </button>

        {/* 타이틀 */}
        <h1 className="text-2xl font-bold text-[#2D5A3D]">방문기록 ({data.totalVisits}회)</h1>

        {/* 요약 카드 */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA] space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[15px] text-[#8C8C80]">총 방문 횟수</span>
            <span className="text-xl font-bold text-[#2D5A3D]">{data.totalVisits}회</span>
          </div>
          {data.firstVisitDate && (
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-[#8C8C80]">최초 가입일</span>
              <span className="text-base text-[#555]">{formatDateKR(data.firstVisitDate)}</span>
            </div>
          )}
          {data.recentVisitDate && (
            <div className="flex items-center justify-between">
              <span className="text-[15px] text-[#8C8C80]">최근 방문일</span>
              <span className="text-base text-[#555]">{formatDateKR(data.recentVisitDate)}</span>
            </div>
          )}
        </div>

        {/* 방문 날짜 목록 */}
        <div className="space-y-2">
          <h2 className="text-base font-semibold text-[#555]">전체 방문 날짜</h2>
          {data.visits.length === 0 ? (
            <p className="text-[15px] text-[#AAA] py-4 text-center">
              아직 방문 기록이 없습니다.
            </p>
          ) : (
            <ul className="space-y-2">
              {data.visits.map((visit, index) => (
                <li
                  key={`${visit.visit_date}-${visit.visit_time}`}
                  className="flex items-center justify-between bg-white rounded-xl px-4 py-3
                             border border-[#F0EDE6]"
                >
                  <div className="flex items-center gap-3">
                    <span className="w-8 h-8 rounded-full bg-[#F0F7F2] flex items-center justify-center
                                     text-sm font-semibold text-[#2D5A3D]">
                      {data.totalVisits - index}
                    </span>
                    <span className="text-base text-[#333]">
                      {formatDateKR(visit.visit_date)}
                    </span>
                  </div>
                  <span className="text-sm text-[#8C8C80]">{visit.storeName}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* 하단 여백 */}
        <div className="pb-8" />
      </div>
    </main>
  );
}
