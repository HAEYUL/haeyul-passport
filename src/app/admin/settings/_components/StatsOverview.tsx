'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getVisitTrend,
  getSignupTrend,
  getNewVsReturningTrend,
  getTierBreakdown,
  getRewardStats,
  getVipConversionTrend,
  getLongAbsentBuckets,
  getLongAbsentCustomers,
  type TrendResult,
  type NewReturningPoint,
  type TierBreakdownItem,
  type RewardStatItem,
  type VipConversionResult,
  type LongAbsentBuckets,
  type LongAbsentBucketKey,
  type LongAbsentCustomerItem,
} from '@/app/admin/actions';
import { formatDateKR } from '@/lib/utils';
import { LineChart, BarChart, DonutChart, CHART_COLORS, getTierColor } from './charts';
import StoreFilterBar from '../../_components/StoreFilterBar';

type Period = 'day' | 'week' | 'month';

const PERIOD_OPTIONS: { key: Period; label: string }[] = [
  { key: 'day', label: '일' },
  { key: 'week', label: '주' },
  { key: 'month', label: '월' },
];

function ChartCard({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA] space-y-4">
      <div>
        <h3 className="text-base font-semibold text-[#2D5A3D]">{title}</h3>
        {description && <p className="text-xs text-[#6B6B5E] mt-0.5">{description}</p>}
      </div>
      {children}
    </section>
  );
}

function TrendStatRow({
  total,
  previousTotal,
  average,
  unit = '',
}: {
  total: number;
  previousTotal: number;
  average: number;
  unit?: string;
}) {
  const diff = total - previousTotal;
  const diffColor = diff > 0 ? '#006300' : diff < 0 ? '#d03b3b' : '#898781';
  return (
    <div className="grid grid-cols-3 gap-3 text-center sm:text-left">
      <div>
        <p className="text-xs text-[#6B6B5E]">전체</p>
        <p className="text-xl font-bold text-[#2D5A3D]">
          {total}
          {unit}
        </p>
      </div>
      <div>
        <p className="text-xs text-[#6B6B5E]">이전 기간 대비</p>
        <p className="text-xl font-bold" style={{ color: diffColor }}>
          {diff > 0 ? '+' : ''}
          {diff}
          {unit}
        </p>
      </div>
      <div>
        <p className="text-xs text-[#6B6B5E]">평균</p>
        <p className="text-xl font-bold text-[#2D5A3D]">
          {average}
          {unit}
        </p>
      </div>
    </div>
  );
}

function PeriodSelector({
  period,
  onPeriodChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
}: {
  period: Period;
  onPeriodChange: (p: Period) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (v: string) => void;
  onDateToChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DA]">
      <div className="flex gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.key}
            type="button"
            onClick={() => onPeriodChange(opt.key)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
              period === opt.key
                ? 'bg-[#2D5A3D] text-white'
                : 'bg-white text-[#2D5A3D] border-2 border-[#D4D0C8] hover:bg-[#F5F5EC]'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 text-sm">
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => onDateFromChange(e.target.value)}
          className="px-3 py-2 border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
        />
        <span className="text-[#6B6B5E]">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => onDateToChange(e.target.value)}
          className="px-3 py-2 border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
        />
        {(dateFrom || dateTo) && (
          <button
            type="button"
            onClick={() => {
              onDateFromChange('');
              onDateToChange('');
            }}
            className="text-xs text-[#6B6B5E] underline"
          >
            초기화
          </button>
        )}
      </div>
    </div>
  );
}

function VisitTrendSection({ period, dateFrom, dateTo, storeId }: { period: Period; dateFrom?: string; dateTo?: string; storeId: string | null }) {
  const [data, setData] = useState<TrendResult | null>(null);

  const fetchData = useCallback(async () => {
    const result = await getVisitTrend(period, dateFrom || undefined, dateTo || undefined, storeId);
    if (result.success && result.data) setData(result.data);
  }, [period, dateFrom, dateTo, storeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <ChartCard title="방문 수" description="선택한 기간의 일별/주별/월별 방문 추이입니다.">
      {!data ? (
        <div className="h-48 rounded-xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <>
          <TrendStatRow total={data.total} previousTotal={data.previousTotal} average={data.average} unit="회" />
          <LineChart
            labels={data.points.map((p) => p.label)}
            series={[{ label: '방문 수', color: CHART_COLORS.slot1, values: data.points.map((p) => p.count) }]}
          />
        </>
      )}
    </ChartCard>
  );
}

function SignupTrendSection({ period, dateFrom, dateTo, storeId }: { period: Period; dateFrom?: string; dateTo?: string; storeId: string | null }) {
  const [data, setData] = useState<TrendResult | null>(null);

  const fetchData = useCallback(async () => {
    const result = await getSignupTrend(period, dateFrom || undefined, dateTo || undefined, storeId);
    if (result.success && result.data) setData(result.data);
  }, [period, dateFrom, dateTo, storeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <ChartCard title="신규가입자 수" description="선택한 기간에 새로 가입한 고객 수입니다.">
      {!data ? (
        <div className="h-48 rounded-xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <>
          <TrendStatRow total={data.total} previousTotal={data.previousTotal} average={data.average} unit="명" />
          <LineChart
            labels={data.points.map((p) => p.label)}
            series={[{ label: '신규가입자', color: CHART_COLORS.slot2, values: data.points.map((p) => p.count) }]}
          />
        </>
      )}
    </ChartCard>
  );
}

function NewVsReturningSection({ period, dateFrom, dateTo, storeId }: { period: Period; dateFrom?: string; dateTo?: string; storeId: string | null }) {
  const [data, setData] = useState<NewReturningPoint[] | null>(null);

  const fetchData = useCallback(async () => {
    const result = await getNewVsReturningTrend(period, dateFrom || undefined, dateTo || undefined, storeId);
    if (result.success && result.data) setData(result.data);
  }, [period, dateFrom, dateTo, storeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const totalNew = data?.reduce((sum, p) => sum + p.newCount, 0) || 0;
  const totalReturning = data?.reduce((sum, p) => sum + p.returningCount, 0) || 0;

  return (
    <ChartCard title="재방문 고객 수" description="기간 내 방문 고객을 신규 방문과 재방문으로 나눠 비교합니다.">
      {!data ? (
        <div className="h-48 rounded-xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <>
          <div className="flex gap-6 text-sm">
            <p className="text-[#6B6B5E]">
              신규 <span className="font-bold text-[#2D5A3D]">{totalNew}명</span>
            </p>
            <p className="text-[#6B6B5E]">
              재방문 <span className="font-bold text-[#2D5A3D]">{totalReturning}명</span>
            </p>
          </div>
          <BarChart
            items={data.map((p) => ({
              label: p.label,
              values: [
                { seriesLabel: '신규', value: p.newCount, color: CHART_COLORS.slot1 },
                { seriesLabel: '재방문', value: p.returningCount, color: CHART_COLORS.slot3 },
              ],
            }))}
          />
        </>
      )}
    </ChartCard>
  );
}

function TierBreakdownSection({ storeId }: { storeId: string | null }) {
  const [data, setData] = useState<TierBreakdownItem[] | null>(null);

  useEffect(() => {
    setData(null);
    getTierBreakdown(storeId).then((result) => {
      if (result.success && result.data) setData(result.data);
    });
  }, [storeId]);

  return (
    <ChartCard title="등급별 회원 수" description="현재 활성 회원을 등급별로 나눈 현황입니다.">
      {!data ? (
        <div className="h-48 rounded-xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <DonutChart
          slices={data.map((t, i) => ({ label: t.label, value: t.count, color: getTierColor(i) }))}
        />
      )}
    </ChartCard>
  );
}

function RewardUsageSection({ storeId }: { storeId: string | null }) {
  const [data, setData] = useState<RewardStatItem[] | null>(null);

  useEffect(() => {
    setData(null);
    getRewardStats(storeId).then((result) => {
      if (result.success && result.data) setData(result.data);
    });
  }, [storeId]);

  return (
    <ChartCard title="할인권 발급·사용률" description="방문 횟수별 할인권의 발급/사용 현황과 사용률입니다.">
      {!data ? (
        <div className="h-48 rounded-xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <>
          <BarChart
            items={data.map((r) => ({
              label: `${r.thresholdVisits}회`,
              values: [
                { seriesLabel: '발급', value: r.totalIssued, color: CHART_COLORS.slot1 },
                { seriesLabel: '사용완료', value: r.totalUsed, color: CHART_COLORS.slot3 },
                { seriesLabel: '미사용', value: r.totalUnused, color: CHART_COLORS.slot4 },
              ],
            }))}
          />
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[480px]">
              <thead>
                <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#6B6B5E]">
                  <th className="px-3 py-2 font-medium">할인권</th>
                  <th className="px-3 py-2 font-medium text-right">발급 수</th>
                  <th className="px-3 py-2 font-medium text-right">사용 완료</th>
                  <th className="px-3 py-2 font-medium text-right">미사용</th>
                  <th className="px-3 py-2 font-medium text-right">사용률</th>
                </tr>
              </thead>
              <tbody>
                {data.map((r) => {
                  const rate = r.totalIssued > 0 ? Math.round((r.totalUsed / r.totalIssued) * 1000) / 10 : 0;
                  return (
                    <tr key={r.ruleId} className="border-b border-[#F0EDE6] last:border-0">
                      <td className="px-3 py-2 text-[#333]">
                        {r.amount.toLocaleString()}원
                        <span className="text-xs text-[#6B6B5E] ml-1">({r.thresholdVisits}회)</span>
                      </td>
                      <td className="px-3 py-2 text-right text-[#2D5A3D] font-semibold">{r.totalIssued}</td>
                      <td className="px-3 py-2 text-right text-[#6B6B5E]">{r.totalUsed}</td>
                      <td className="px-3 py-2 text-right text-[#8A5800]">{r.totalUnused}</td>
                      <td className="px-3 py-2 text-right font-semibold text-[#333]">{rate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </ChartCard>
  );
}

function VipConversionSection({ period, dateFrom, dateTo, storeId }: { period: Period; dateFrom?: string; dateTo?: string; storeId: string | null }) {
  const [data, setData] = useState<VipConversionResult | null>(null);

  const fetchData = useCallback(async () => {
    const result = await getVipConversionTrend(period, dateFrom || undefined, dateTo || undefined, storeId);
    if (result.success && result.data) setData(result.data);
  }, [period, dateFrom, dateTo, storeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <ChartCard title="VIP 전환 수" description="누적 방문 30회를 달성해 해율푸드 VIP가 된 고객 수입니다.">
      {!data ? (
        <div className="h-48 rounded-xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <>
          <div className="flex gap-6 text-sm">
            <p className="text-[#6B6B5E]">
              선택 기간 신규 VIP <span className="font-bold text-[#8A5800]">{data.total}명</span>
            </p>
            <p className="text-[#6B6B5E]">
              전체 VIP <span className="font-bold text-[#8A5800]">{data.totalVipCount}명</span>
            </p>
          </div>
          <LineChart
            labels={data.points.map((p) => p.label)}
            series={[{ label: 'VIP 전환', color: CHART_COLORS.slot5, values: data.points.map((p) => p.count) }]}
          />
        </>
      )}
    </ChartCard>
  );
}

const BUCKET_LABELS: Record<LongAbsentBucketKey, string> = {
  from30to59: '30~59일 미방문',
  from60to89: '60~89일 미방문',
  from90plus: '90일 이상 미방문',
};

function LongAbsentDrilldown({
  bucket,
  storeId,
  onClose,
}: {
  bucket: LongAbsentBucketKey;
  storeId: string | null;
  onClose: () => void;
}) {
  const [items, setItems] = useState<LongAbsentCustomerItem[] | null>(null);

  useEffect(() => {
    setItems(null);
    getLongAbsentCustomers(bucket, storeId).then((result) => {
      if (result.success && result.data) setItems(result.data);
    });
  }, [bucket, storeId]);

  return (
    <div className="border-t border-[#F0EDE6] pt-4 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-[#2D5A3D]">{BUCKET_LABELS[bucket]} 고객 명단</h4>
        <button type="button" onClick={onClose} className="text-xs text-[#6B6B5E] underline">
          닫기
        </button>
      </div>
      {!items ? (
        <div className="h-24 rounded-xl bg-[#E8E8E0] animate-pulse" />
      ) : items.length === 0 ? (
        <p className="text-sm text-[#6B6B5E]">해당하는 고객이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#6B6B5E]">
                <th className="px-3 py-2 font-medium">고객명</th>
                <th className="px-3 py-2 font-medium">현재 등급</th>
                <th className="px-3 py-2 font-medium text-right">누적 방문</th>
                <th className="px-3 py-2 font-medium">최근 방문일</th>
                <th className="px-3 py-2 font-medium text-right">미방문 일수</th>
                <th className="px-3 py-2 font-medium text-right">사용 가능 할인권</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.customerId} className="border-b border-[#F0EDE6] last:border-0">
                  <td className="px-3 py-2 font-medium text-[#2D5A3D] whitespace-nowrap">{it.name}</td>
                  <td className="px-3 py-2 whitespace-nowrap text-[#333]">{it.tierLabel}</td>
                  <td className="px-3 py-2 text-right text-[#333]">{it.visitCount}회</td>
                  <td className="px-3 py-2 whitespace-nowrap text-[#6B6B5E]">
                    {it.recentVisitDate ? formatDateKR(it.recentVisitDate) : '-'}
                  </td>
                  <td className="px-3 py-2 text-right text-[#D4442A] font-semibold">{it.daysSinceVisit}일</td>
                  <td className="px-3 py-2 text-right text-[#8A5800]">{it.availableRewards}개</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function LongAbsentSection({ storeId }: { storeId: string | null }) {
  const [data, setData] = useState<LongAbsentBuckets | null>(null);
  const [openBucket, setOpenBucket] = useState<LongAbsentBucketKey | null>(null);

  useEffect(() => {
    setData(null);
    setOpenBucket(null);
    getLongAbsentBuckets(storeId).then((result) => {
      if (result.success && result.data) setData(result.data);
    });
  }, [storeId]);

  const bucketKeys: LongAbsentBucketKey[] = ['from30to59', 'from60to89', 'from90plus'];

  return (
    <ChartCard title="장기 미방문 고객" description="최근 방문일 기준으로 구간을 나눠 보여줍니다. 항목을 누르면 명단을 볼 수 있습니다.">
      {!data ? (
        <div className="h-32 rounded-xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            {bucketKeys.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setOpenBucket(openBucket === key ? null : key)}
                className={`p-4 rounded-xl border-2 text-left transition-colors duration-200 ${
                  openBucket === key ? 'border-[#2D5A3D] bg-[#F0F7F2]' : 'border-[#E8E4DA] bg-white hover:bg-[#F5F5EC]'
                }`}
              >
                <p className="text-xs text-[#6B6B5E]">{BUCKET_LABELS[key]}</p>
                <p className="text-2xl font-bold text-[#D4442A] mt-1">{data[key]}명</p>
              </button>
            ))}
          </div>
          {openBucket && <LongAbsentDrilldown bucket={openBucket} storeId={storeId} onClose={() => setOpenBucket(null)} />}
        </>
      )}
    </ChartCard>
  );
}

export default function StatsOverview() {
  const [period, setPeriod] = useState<Period>('day');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);

  return (
    <div className="space-y-4">
      <StoreFilterBar value={storeId} onChange={setStoreId} />

      <PeriodSelector
        period={period}
        onPeriodChange={setPeriod}
        dateFrom={dateFrom}
        dateTo={dateTo}
        onDateFromChange={setDateFrom}
        onDateToChange={setDateTo}
      />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <VisitTrendSection period={period} dateFrom={dateFrom} dateTo={dateTo} storeId={storeId} />
        <SignupTrendSection period={period} dateFrom={dateFrom} dateTo={dateTo} storeId={storeId} />
        <NewVsReturningSection period={period} dateFrom={dateFrom} dateTo={dateTo} storeId={storeId} />
        <TierBreakdownSection storeId={storeId} />
        <VipConversionSection period={period} dateFrom={dateFrom} dateTo={dateTo} storeId={storeId} />
        <div className="lg:col-span-2">
          <RewardUsageSection storeId={storeId} />
        </div>
        <div className="lg:col-span-2">
          <LongAbsentSection storeId={storeId} />
        </div>
      </div>
    </div>
  );
}
