'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getDashboardStats, getTodayVipVisitors, type DashboardStats, type TodayVipVisitor } from '@/app/admin/actions';
import AdminNav from './AdminNav';
import StoreFilterBar from './StoreFilterBar';

interface AdminDashboardProps {
  username: string;
}

function StatCard({
  label,
  value,
  unit,
  href,
  accent,
}: {
  label: string;
  value: number;
  unit: string;
  href: string;
  accent?: string;
}) {
  return (
    <Link
      href={href}
      className="block bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA]
                 hover:bg-[#F5F5EC] transition-colors duration-200"
    >
      <p className="text-sm text-[#6B6B5E]">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${accent || 'text-[#2D5A3D]'}`}>
        {value.toLocaleString()}
        <span className="ml-1 text-base font-bold">{unit}</span>
      </p>
    </Link>
  );
}

/** 대시보드 최상단 핵심 지표용 큰 숫자 카드 */
function HeroStatCard({
  label,
  value,
  unit,
  href,
  theme,
}: {
  label: string;
  value: number;
  unit: string;
  href: string;
  /** 'reward'면 주황/노랑 계열 배경으로 "혜택" 의미를 표시합니다 */
  theme: 'default' | 'reward';
}) {
  const isReward = theme === 'reward';
  return (
    <Link
      href={href}
      className={`block rounded-2xl p-5 shadow-sm border-2 transition-colors duration-200 ${
        isReward
          ? 'bg-[#FFF3D6] border-[#F0D98C] hover:bg-[#FCEAC0]'
          : 'bg-white border-[#E8E4DA] hover:bg-[#F5F5EC]'
      }`}
    >
      <p className={`text-sm font-semibold ${isReward ? 'text-[#8A5800]' : 'text-[#6B6B5E]'}`}>{label}</p>
      <p className={`mt-2 text-4xl font-extrabold leading-tight ${isReward ? 'text-[#8A5800]' : 'text-[#2D5A3D]'}`}>
        {value.toLocaleString()}
        <span className="ml-1 text-lg font-bold">{unit}</span>
      </p>
    </Link>
  );
}

export default function AdminDashboard({ username }: AdminDashboardProps) {
  const [storeId, setStoreId] = useState<string | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [vipVisitors, setVipVisitors] = useState<TodayVipVisitor[]>([]);
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    const result = await getDashboardStats(storeId);
    if (result.success && result.data) {
      setStats(result.data);
    } else if (!result.success) {
      setError(result.error || '통계를 불러올 수 없습니다.');
    }
  }, [storeId]);

  const fetchVipVisitors = useCallback(async () => {
    const result = await getTodayVipVisitors();
    if (result.success && result.data) {
      setVipVisitors(result.data);
    }
  }, []);

  useEffect(() => {
    setStats(null);
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchVipVisitors();
  }, [fetchVipVisitors]);

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">관리자 대시보드</h1>
          <p className="text-sm text-[#6B6B5E]">{username}님 로그인 중</p>
        </header>

        <AdminNav active="dashboard" />

        <StoreFilterBar value={storeId} onChange={setStoreId} />

        {vipVisitors.length > 0 && (
          <div className="bg-[#FFFDF0] border-2 border-[#E8D88C] rounded-2xl px-5 py-4">
            <p className="text-[15px] font-semibold text-[#8A5800]">
              오늘 방문한 해율푸드 VIP 고객: {vipVisitors.map((v) => v.name).join(', ')}님
            </p>
            <Link href="/admin/vip" className="text-sm text-[#8A5800] underline">
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
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-28 rounded-2xl bg-[#E8E8E0] animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-[#E8E8E0] animate-pulse" />
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* 핵심 지표 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <HeroStatCard
                label="전체 회원수"
                value={stats.totalCustomers}
                unit="명"
                href="/admin/customers"
                theme="default"
              />
              <HeroStatCard
                label="오늘 방문"
                value={stats.todayVisits}
                unit="명"
                href="/admin/customers?filter=todayVisits"
                theme="default"
              />
              <HeroStatCard
                label="이번달 발급 할인권"
                value={stats.monthlyIssuedRewards}
                unit="개"
                href="/admin/rewards"
                theme="reward"
              />
              <HeroStatCard
                label="이번달 사용 할인권"
                value={stats.monthlyUsedRewards}
                unit="개"
                href="/admin/rewards"
                theme="reward"
              />
            </div>

            {/* 상세 지표 */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard
                label="이번달 신규가입"
                value={stats.newCustomersThisMonth}
                unit="명"
                href="/admin/customers?filter=newThisMonth"
              />
              <StatCard
                label="미사용 할인권"
                value={stats.unclaimedRewards}
                unit="개"
                href="/admin/customers?filter=unclaimedRewards"
                accent="text-[#8A5800]"
              />
              <StatCard
                label="오늘 할인권 사용"
                value={stats.todayRewardsUsed}
                unit="개"
                href="/admin/customers?filter=todayRewardsUsed"
              />
              <StatCard
                label="해율푸드 VIP"
                value={stats.vipCount}
                unit="명"
                href="/admin/customers?filter=vip"
                accent="text-[#8A5800]"
              />
              <StatCard
                label="장기 미방문"
                value={stats.longAbsentCount}
                unit="명"
                href="/admin/customers?filter=longAbsent&days=30"
                accent="text-[#D4442A]"
              />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
