'use client';

import { useState, useEffect, useCallback } from 'react';
import { getRewardUsageByPeriod, type RewardUsageByPeriodResult } from '@/app/admin/actions';
import { getTodayKST, getMonthRange, startOfWeekKST, addDaysToDateString, addMonthsToDateString, formatDateKR } from '@/lib/utils';
import StoreFilterBar from '../../_components/StoreFilterBar';

type PeriodType = 'week' | 'month' | 'custom';

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

const BOM = String.fromCharCode(0xfeff);

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function PeriodTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
        active ? 'bg-[#2D5A3D] text-white' : 'bg-white text-[#2D5A3D] border-2 border-[#D4D0C8] hover:bg-[#F5F5EC]'
      }`}
    >
      {label}
    </button>
  );
}

/** 이번 주(월~일)/이번 달/직접 선택 기간을 고르면, 매장별·금액별 할인권 "사용" 수량과
 * 금액을 대조표로 보여줍니다. 매장 POS의 할인 기록과 맞춰보는 용도입니다. */
export default function RewardReconciliation() {
  const today = getTodayKST();
  const thisMonth = today.slice(0, 7);

  const [periodType, setPeriodType] = useState<PeriodType>('week');
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [customFrom, setCustomFrom] = useState(today);
  const [customTo, setCustomTo] = useState(today);
  const [storeId, setStoreId] = useState<string | null>(null);
  const [data, setData] = useState<RewardUsageByPeriodResult | null>(null);
  const [error, setError] = useState('');

  let dateFrom: string;
  let dateTo: string;
  let rangeLabel: string;

  if (periodType === 'week') {
    const anchor = addDaysToDateString(today, weekOffset * 7);
    dateFrom = startOfWeekKST(anchor);
    dateTo = addDaysToDateString(dateFrom, 6);
    rangeLabel = `${formatDateKR(dateFrom)} ~ ${formatDateKR(dateTo)}`;
  } else if (periodType === 'month') {
    const anchorMonth = addMonthsToDateString(`${thisMonth}-01`, monthOffset).slice(0, 7);
    const range = getMonthRange(anchorMonth);
    dateFrom = range.start;
    dateTo = range.end;
    rangeLabel = `${anchorMonth.slice(0, 4)}년 ${Number(anchorMonth.slice(5, 7))}월`;
  } else {
    dateFrom = customFrom;
    dateTo = customTo;
    rangeLabel = `${formatDateKR(dateFrom)} ~ ${formatDateKR(dateTo)}`;
  }

  const fetchData = useCallback(async () => {
    setData(null);
    const result = await getRewardUsageByPeriod(dateFrom, dateTo, storeId);
    if (result.success && result.data) {
      setData(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '집계를 불러올 수 없습니다.');
    }
  }, [dateFrom, dateTo, storeId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  function handleDownload() {
    if (!data) return;
    const headers = ['금액', ...data.stores.map((s) => s.storeName), '합계'];
    const rows = data.amounts.map((amount) => {
      const counts = data.stores.map((s) => s.byAmount.find((b) => b.amount === amount)?.count ?? 0);
      const rowTotal = counts.reduce((sum, c) => sum + c, 0);
      return [`${amount.toLocaleString()}원`, ...counts.map(String), String(rowTotal)];
    });
    const totalCountRow = ['합계(건수)', ...data.stores.map((s) => String(s.totalCount)), String(data.stores.reduce((sum, s) => sum + s.totalCount, 0))];
    const totalAmountRow = [
      '합계(할인금액)',
      ...data.stores.map((s) => `${s.totalAmount.toLocaleString()}원`),
      `${data.stores.reduce((sum, s) => sum + s.totalAmount, 0).toLocaleString()}원`,
    ];
    downloadCsv(`할인권사용대사_${dateFrom}_${dateTo}.csv`, headers, [...rows, totalCountRow, totalAmountRow]);
  }

  const grandTotalCount = (data?.stores || []).reduce((sum, s) => sum + s.totalCount, 0);
  const grandTotalAmount = (data?.stores || []).reduce((sum, s) => sum + s.totalAmount, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <PeriodTab
          label="이번 주"
          active={periodType === 'week'}
          onClick={() => {
            setPeriodType('week');
            setWeekOffset(0);
          }}
        />
        <PeriodTab
          label="이번 달"
          active={periodType === 'month'}
          onClick={() => {
            setPeriodType('month');
            setMonthOffset(0);
          }}
        />
        <PeriodTab label="직접 선택" active={periodType === 'custom'} onClick={() => setPeriodType('custom')} />
      </div>

      {periodType === 'week' && (
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setWeekOffset((v) => v - 1)}
            className="px-3 py-1.5 rounded-lg border border-[#D4D0C8] text-[#2D5A3D] hover:bg-[#F5F5EC]"
          >
            ◀ 이전 주
          </button>
          <span className="font-semibold text-[#333]">{rangeLabel}</span>
          <button
            type="button"
            onClick={() => setWeekOffset((v) => v + 1)}
            disabled={weekOffset >= 0}
            className="px-3 py-1.5 rounded-lg border border-[#D4D0C8] text-[#2D5A3D] hover:bg-[#F5F5EC] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            다음 주 ▶
          </button>
        </div>
      )}

      {periodType === 'month' && (
        <div className="flex items-center gap-2 text-sm">
          <button
            type="button"
            onClick={() => setMonthOffset((v) => v - 1)}
            className="px-3 py-1.5 rounded-lg border border-[#D4D0C8] text-[#2D5A3D] hover:bg-[#F5F5EC]"
          >
            ◀ 이전 달
          </button>
          <span className="font-semibold text-[#333]">{rangeLabel}</span>
          <button
            type="button"
            onClick={() => setMonthOffset((v) => v + 1)}
            disabled={monthOffset >= 0}
            className="px-3 py-1.5 rounded-lg border border-[#D4D0C8] text-[#2D5A3D] hover:bg-[#F5F5EC] disabled:opacity-30 disabled:cursor-not-allowed"
          >
            다음 달 ▶
          </button>
        </div>
      )}

      {periodType === 'custom' && (
        <div className="flex items-center gap-1.5 text-sm">
          <input
            type="date"
            value={customFrom}
            max={customTo}
            onChange={(e) => setCustomFrom(e.target.value)}
            className="rounded-lg border border-[#D4D0C8] px-2 py-1.5 text-[#333]"
          />
          <span className="text-[#8C8C80]">~</span>
          <input
            type="date"
            value={customTo}
            min={customFrom}
            max={today}
            onChange={(e) => setCustomTo(e.target.value)}
            className="rounded-lg border border-[#D4D0C8] px-2 py-1.5 text-[#333]"
          />
        </div>
      )}

      <StoreFilterBar value={storeId} onChange={setStoreId} />

      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}

      {!data ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-16 rounded-xl bg-[#E8E8E0] animate-pulse" />
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#F8F7F2] p-4">
              <p className="text-xs text-[#6B6B5E]">사용된 할인권 수량</p>
              <p className="mt-1 text-xl font-bold text-[#2D5A3D]">{grandTotalCount.toLocaleString()}건</p>
            </div>
            <div className="rounded-xl bg-[#FFF3D6] p-4">
              <p className="text-xs text-[#8A5800]">총 할인 금액</p>
              <p className="mt-1 text-xl font-bold text-[#8A5800]">{grandTotalAmount.toLocaleString()}원</p>
            </div>
          </div>

          {data.amounts.length === 0 ? (
            <p className="text-sm text-[#8C8C80] py-4 text-center">선택하신 기간에 사용된 할인권이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto bg-white rounded-2xl border border-[#E8E4DA]">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#6B6B5E]">
                    <th className="px-4 py-3 font-medium">금액</th>
                    {data.stores.map((s) => (
                      <th key={s.storeId} className="px-4 py-3 font-medium text-right">
                        {s.storeName}
                      </th>
                    ))}
                    {data.stores.length > 1 && <th className="px-4 py-3 font-medium text-right">합계</th>}
                  </tr>
                </thead>
                <tbody>
                  {data.amounts.map((amount) => {
                    const counts = data.stores.map((s) => s.byAmount.find((b) => b.amount === amount)?.count ?? 0);
                    const rowTotal = counts.reduce((sum, c) => sum + c, 0);
                    return (
                      <tr key={amount} className="border-b border-[#F0EDE6] last:border-0">
                        <td className="px-4 py-3 whitespace-nowrap text-[#333] font-semibold">
                          {amount.toLocaleString()}원
                        </td>
                        {counts.map((c, i) => (
                          <td key={data.stores[i].storeId} className="px-4 py-3 text-right text-[#333]">
                            {c}건
                          </td>
                        ))}
                        {data.stores.length > 1 && (
                          <td className="px-4 py-3 text-right font-semibold text-[#2D5A3D]">{rowTotal}건</td>
                        )}
                      </tr>
                    );
                  })}
                  <tr className="border-t-2 border-[#E8E4DA] bg-[#F8F7F2] font-semibold">
                    <td className="px-4 py-3 text-[#333]">합계(건수)</td>
                    {data.stores.map((s) => (
                      <td key={s.storeId} className="px-4 py-3 text-right text-[#333]">
                        {s.totalCount}건
                      </td>
                    ))}
                    {data.stores.length > 1 && (
                      <td className="px-4 py-3 text-right text-[#2D5A3D]">{grandTotalCount}건</td>
                    )}
                  </tr>
                  <tr className="bg-[#FFF3D6] font-semibold">
                    <td className="px-4 py-3 text-[#8A5800]">합계(할인금액)</td>
                    {data.stores.map((s) => (
                      <td key={s.storeId} className="px-4 py-3 text-right text-[#8A5800]">
                        {s.totalAmount.toLocaleString()}원
                      </td>
                    ))}
                    {data.stores.length > 1 && (
                      <td className="px-4 py-3 text-right text-[#8A5800]">{grandTotalAmount.toLocaleString()}원</td>
                    )}
                  </tr>
                </tbody>
              </table>
            </div>
          )}

          <button
            type="button"
            onClick={handleDownload}
            disabled={data.amounts.length === 0}
            className="px-5 py-3 rounded-xl text-sm font-semibold bg-white text-[#2D5A3D] border border-[#E8E4DA]
                       hover:bg-[#F5F5EC] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-sm"
          >
            📊 이 표 엑셀로 저장
          </button>
        </>
      )}
    </div>
  );
}
