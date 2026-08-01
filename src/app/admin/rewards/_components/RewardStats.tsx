'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRewardStats, type RewardStatItem } from '@/app/admin/actions';
import AdminNav from '../../_components/AdminNav';

export default function RewardStats() {
  const [stats, setStats] = useState<RewardStatItem[] | null>(null);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    const result = await getRewardStats();
    if (result.success && result.data) {
      setStats(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '선물 현황을 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  const totals = (stats || []).reduce(
    (acc, s) => ({
      issued: acc.issued + s.totalIssued,
      used: acc.used + s.totalUsed,
      unused: acc.unused + s.totalUnused,
    }),
    { issued: 0, used: 0, unused: 0 }
  );

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">선물현황</h1>
          <p className="text-sm text-[#8C8C80]">방문 선물이 얼마나 발급·누적되고, 사용됐는지 확인할 수 있습니다.</p>
        </header>

        <AdminNav active="rewards" />

        {error && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        {!stats ? (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-[#E8E8E0] animate-pulse" />
            ))}
          </div>
        ) : (
          <>
            {/* 전체 합계 */}
            <div className="grid grid-cols-3 gap-4">
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA]">
                <p className="text-sm text-[#8C8C80]">총 발급</p>
                <p className="mt-2 text-3xl font-bold text-[#2D5A3D]">{totals.issued}</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA]">
                <p className="text-sm text-[#8C8C80]">사용됨</p>
                <p className="mt-2 text-3xl font-bold text-[#8C8C80]">{totals.used}</p>
              </div>
              <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA]">
                <p className="text-sm text-[#8C8C80]">미사용</p>
                <p className="mt-2 text-3xl font-bold text-[#B8860B]">{totals.unused}</p>
              </div>
            </div>

            {/* 선물별 상세 */}
            <div className="bg-white rounded-2xl shadow-sm border border-[#E8E4DA] overflow-x-auto">
              <table className="w-full text-[15px] min-w-[420px]">
                <thead>
                  <tr className="border-b border-[#F0EDE6] text-left text-sm text-[#8C8C80]">
                    <th className="px-5 py-3 font-medium">선물</th>
                    <th className="px-3 py-3 font-medium text-right">발급</th>
                    <th className="px-3 py-3 font-medium text-right">사용</th>
                    <th className="px-5 py-3 font-medium text-right">미사용</th>
                  </tr>
                </thead>
                <tbody>
                  {stats.map((s) => (
                    <tr key={s.rewardId} className="border-b border-[#F0EDE6] last:border-0">
                      <td className="px-5 py-4">
                        <p className="font-medium text-[#333]">{s.rewardName}</p>
                        <p className="text-xs text-[#AAA]">{s.requiredVisits}회 방문</p>
                      </td>
                      <td className="px-3 py-4 text-right text-[#2D5A3D] font-semibold">{s.totalIssued}</td>
                      <td className="px-3 py-4 text-right text-[#8C8C80]">{s.totalUsed}</td>
                      <td className="px-5 py-4 text-right text-[#B8860B] font-semibold">{s.totalUnused}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <div className="pb-8" />
      </div>
    </main>
  );
}
