'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getDashboardStats, getTodayVipVisitors, type DashboardStats, type TodayVipVisitor } from '@/app/admin/actions';
import AdminNav from './AdminNav';

interface AdminDashboardProps {
  username: string;
}

function StatCard({
  label,
  value,
  href,
  accent,
}: {
  label: string;
  value: number;
  href: string;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA]
                 hover:bg-[#F5F5EC] transition-colors duration-200"
    >
      <p className="text-sm text-[#8C8C80]">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent || 'text-[#2D5A3D]'}`}>{value}</p>
    </Link>
  );
}

export default function AdminDashboard({ username }: AdminDashboardProps) {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [vipVisitors, setVipVisitors] = useState<TodayVipVisitor[]>([]);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    const result = await getDashboardStats();
    if (result.success && result.data) {
      setStats(result.data);
    } else if (!result.success) {
      setError(result.error || '통계를 불러올 수 없습니다.');
    }
  }, []);

  const fetchVipVisitors = useCallback(async () => {
    const result = await getTodayVipVisitors();
    if (result.success && result.data) {
      setVipVisitors(result.data);
    }
  }, []);

  useEffect(() => {
    fetchStats();
    fetchVipVisitors();
  }, [fetchStats, fetchVipVisitors]);

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">관리자 대시보드</h1>
          <p className="text-sm text-[#8C8C80]">{username}님 로그인 중</p>
        </header>

        <AdminNav active="dashboard" />

        {vipVisitors.length > 0 && (
          <div className="bg-[#FFFDF0] border-2 border-[#E8D88C] rounded-2xl px-5 py-4">
            <p className="text-[15px] font-semibold text-[#B8860B]">
              오늘 방문한 해율 VIP 고객: {vipVisitors.map((v) => v.name).join(', ')}님
            </p>
            <Link href="/admin/vip" className="text-sm text-[#B8860B] underline">
              VIP관리에서 보기
            </Link>
          </div>
        )}

        {error && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        {!stats ? (
          <div className="grid grid-cols-2 gap-4">
            {[1, 2, 3, 4, 5, 6, 7].map((i) => (
              <div key={i} className="h-24 rounded-2xl bg-[#E8E8E0] animate-pulse" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <StatCard label="오늘 방문" value={stats.todayVisits} href="/admin/customers?filter=todayVisits" />
            <StatCard label="전체 회원" value={stats.totalCustomers} href="/admin/customers" />
            <StatCard
              label="이번달 신규가입"
              value={stats.newCustomersThisMonth}
              href="/admin/customers?filter=newThisMonth"
            />
            <StatCard
              label="미사용 선물"
              value={stats.unclaimedRewards}
              href="/admin/customers?filter=unclaimedRewards"
              accent="text-[#B8860B]"
            />
            <StatCard
              label="오늘 선물 사용"
              value={stats.todayRewardsUsed}
              href="/admin/customers?filter=todayRewardsUsed"
            />
            <StatCard
              label="해율 VIP"
              value={stats.vipCount}
              href="/admin/customers?filter=vip"
              accent="text-[#B8860B]"
            />
            <StatCard
              label="장기 미방문"
              value={stats.longAbsentCount}
              href="/admin/customers?filter=longAbsent&days=30"
              accent="text-[#D4442A]"
            />
          </div>
        )}
      </div>
    </main>
  );
}
