'use client';

import { useState, useEffect, useCallback } from 'react';
import { getDashboardStats, type DashboardStats } from '@/app/admin/actions';
import AdminNav from './AdminNav';

interface AdminDashboardProps {
  username: string;
}

function StatCard({ label, value, accent }: { label: string; value: number; accent?: string }) {
  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA]">
      <p className="text-sm text-[#8C8C80]">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent || 'text-[#2D5A3D]'}`}>{value}</p>
    </div>
  );
}

export default function AdminDashboard({ username }: AdminDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    const result = await getDashboardStats();
    if (result.success && result.data) {
      setStats(result.data);
    } else if (!result.success) {
      setError(result.error || '통계를 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">관리자 대시보드</h1>
          <p className="text-sm text-[#8C8C80]">{username}님 로그인 중</p>
        </header>

        <AdminNav active="dashboard" />

        {error && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        {!stats ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-[#E8E8E0] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="오늘 방문" value={stats.todayVisits} />
            <StatCard label="전체 회원" value={stats.totalCustomers} />
            <StatCard label="이번달 신규가입" value={stats.newCustomersThisMonth} />
            <StatCard label="미사용 선물" value={stats.unclaimedRewards} accent="text-[#B8860B]" />
          </div>
        )}
      </div>
    </main>
  );
}
