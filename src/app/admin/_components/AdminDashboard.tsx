'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getDashboardStats,
  getTodayVipVisitors,
  getSignupTrend,
  type DashboardStats,
  type TodayVipVisitor,
} from '@/app/admin/actions';
import { getTodayKST, getMonthRange } from '@/lib/utils';
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
      className="block bg-white rounded-2xl p-6 shadow-md border border-[#E8E4DA]
                 hover:shadow-lg hover:scale-105 transition-all duration-200"
    >
      <p className="text-xs font-semibold tracking-[0.08em] text-[#6B6B5E] uppercase">{label}</p>
      <p className={`mt-3 text-3xl font-extrabold ${accent || 'text-[#2D5A3D]'}`}>
        {value.toLocaleString()}
        <span className="ml-2 text-sm font-bold text-[#6B6B5E]">{unit}</span>
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
      className={`block rounded-2xl p-6 shadow-md border transition-all duration-200 hover:shadow-lg hover:scale-105 ${
        isReward
          ? 'bg-gradient-to-br from-[#FFF3D6] to-[#FFF8E8] border-[#F0D98C]'
          : 'bg-white border-[#E8E4DA]'
      }`}
    >
      <p className={`text-xs font-semibold tracking-[0.08em] uppercase ${isReward ? 'text-[#8A5800]' : 'text-[#6B6B5E]'}`}>{label}</p>
      <p className={`mt-3 text-4xl font-extrabold leading-tight ${isReward ? 'text-[#8A5800]' : 'text-[#2D5A3D]'}`}>
        {value.toLocaleString()}
        <span className="ml-2 text-lg font-bold text-[#6B6B5E]">{unit}</span>
      </p>
    </Link>
  );
}

/** 선택한 연월의 신규가입 인원만 조회하는 카드 (다른 StatCard와 같은 크기) */
function MonthlySignupCard({ storeId }: { storeId: string | null }) {
  const [month, setMonth] = useState(getTodayKST().slice(0, 7));
  const [count, setCount] = useState<number | null>(null);
  const [error, setError] = useState('');

  const fetchCount = useCallback(async () => {
    setCount(null);
    const { start, end } = getMonthRange(month);
    const result = await getSignupTrend('month', start, end, storeId);
    if (result.success && result.data) {
      setCount(result.data.total);
      setError('');
    } else if (!result.success) {
      setError(result.error || '조회할 수 없습니다.');
    }
  }, [month, storeId]);

  useEffect(() => {
    fetchCount();
  }, [fetchCount]);

  return (
    <div className="bg-white rounded-2xl p-6 shadow-md border border-[#E8E4DA]">
      <p className="text-xs font-semibold tracking-[0.08em] text-[#6B6B5E] uppercase whitespace-nowrap">
        월별 신규가입({count === null ? '···' : count.toLocaleString()}명)
      </p>
      <input
        type="month"
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="mt-3 w-full rounded-lg border border-[#D4D0C8] px-2 py-1 text-xs text-[#333]"
      />
      {error && <p className="mt-1 text-xs text-[#D4442A]">{error}</p>}
    </div>
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

  const now = new Date();
  const dateStr = now.toLocaleDateString('ko-KR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

  return (
    <main className="flex flex-col min-h-screen px-6 py-8 bg-[#FAFAF8]">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <header className="bg-gradient-to-r from-[#2D5A3D] to-[#1F3D2A] rounded-2xl px-6 py-8 text-white shadow-lg">
          <h1 className="text-3xl font-extrabold mb-1">📊 관리자 대시보드</h1>
          <p className="text-[#E8F0E6] text-sm font-medium">{username}님 로그인 중</p>
          <p className="text-[#D4DDD0] text-xs mt-2 tracking-wide">{dateStr}</p>
        </header>

        <AdminNav active="dashboard" />

        <StoreFilterBar value={storeId} onChange={setStoreId} />

        {vipVisitors.length > 0 && (
          <div className="bg-gradient-to-r from-[#FFFDF0] to-[#FFF8E8] border-2 border-[#E8D88C] rounded-2xl px-6 py-5 shadow-sm">
            <p className="text-[15px] font-semibold text-[#8A5800] mb-2">
              ⭐ 오늘 방문한 VIP 고객: <span className="font-bold">{vipVisitors.map((v) => v.name).join(', ')}님</span>
            </p>
            <Link href="/admin/customers?filter=vip" className="inline-flex text-sm font-semibold text-[#8A5800] hover:text-[#6B4200] underline underline-offset-2">
              VIP 관리에서 상세 보기 →
            </Link>
          </div>
        )}

        {error && (
          <div className="bg-[#FFF8F0] border-2 border-[#F0D4B8] text-[#996633] px-5 py-4 rounded-xl text-[15px] font-medium shadow-sm">
            ⚠️ {error}
          </div>
        )}

        {!stats ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-32 rounded-2xl bg-gradient-to-br from-[#E8E8E0] to-[#D4D0C8] animate-pulse" />
              ))}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-gradient-to-br from-[#E8E8E0] to-[#D4D0C8] animate-pulse" />
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
              <MonthlySignupCard storeId={storeId} />
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
