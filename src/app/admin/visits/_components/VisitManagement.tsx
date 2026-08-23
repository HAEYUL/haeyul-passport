'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import {
  getTodayVisitors,
  getVisitRecords,
  getDuplicateVisits,
  getVisitCountMismatches,
  cancelVisit,
  addManualVisit,
  getCustomerList,
  getCustomerDetail,
  getStores,
  type VisitRecordItem,
  type DuplicateVisitGroup,
  type VisitCountMismatchItem,
  type CustomerListItem,
} from '@/app/admin/actions';
import type { Store } from '@/types/database';
import { formatDateKR, getTodayKST, maskPhone } from '@/lib/utils';
import { getStoreAdminColor } from '@/lib/storeColors';
import { getVisitTierInfo } from '@/lib/tiers';
import AdminNav from '../../_components/AdminNav';
import StoreFilterBar from '../../_components/StoreFilterBar';

type Section = 'today' | 'all' | 'duplicates' | 'mismatches' | 'manualAdd';

const SECTIONS: { key: Section; label: string; icon: string; desc: string }[] = [
  { key: 'today', label: '오늘 방문자 목록', icon: '📅', desc: '오늘 방문한 고객' },
  { key: 'all', label: '전체 방문 기록', icon: '📋', desc: '전체 방문 기록 조회' },
  { key: 'duplicates', label: '중복 방문 확인', icon: '⚠️', desc: '중복 방문 감지' },
  { key: 'mismatches', label: '비정상 등록 확인', icon: '❌', desc: '데이터 불일치' },
  { key: 'manualAdd', label: '수동 방문 추가', icon: '➕', desc: '수동으로 추가' },
];

const BOM = String.fromCharCode(0xfeff);

function formatTimeKR(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  });
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

function exportVisitCsv(records: VisitRecordItem[], title: string) {
  const headers = ['순번', '성함', '여권번호', '연락처', '방문매장', '방문시간', '총 방문횟수', '등급', 'QR위치정보', '취소'];
  const rows = records.map((r, index) => {
    const tier = getVisitTierInfo(r.visitCount || 0);
    const locationStatus = r.locationVerified === 'success' ? `확인됨${r.distanceMeters != null ? ` (${r.distanceMeters}m)` : ''}` : r.locationVerified === 'failed' ? `반경 밖${r.distanceMeters != null ? ` (${r.distanceMeters}m)` : ''}` : '확인 안 됨';
    return [
      String(index + 1),
      r.customerName,
      r.customerNumber,
      r.phone,
      r.storeName,
      formatTimeKR(r.visitTime),
      `${r.visitCount || 0}회`,
      tier.label,
      locationStatus,
      r.isCancelled ? '취소' : '정상',
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${title}_${getTodayKST()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function TabButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  icon?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
        active
          ? 'bg-[#2D5A3D] text-white shadow-md'
          : 'bg-white text-[#2D5A3D] border border-[#E8E4DA] hover:bg-[#F5F5EC] hover:border-[#D4D0C8]'
      }`}
    >
      {icon && <span>{icon}</span>}
      {label}
    </button>
  );
}

function CancelVisitControl({
  visitId,
  onCancelled,
}: {
  visitId: string;
  onCancelled: () => void;
}) {
  const [canceling, setCanceling] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!canceling) {
    return (
      <button
        type="button"
        onClick={() => setCanceling(true)}
        className="text-xs text-[#D4442A] underline"
      >
        취소
      </button>
    );
  }

  async function handleConfirm() {
    setLoading(true);
    setError('');
    const result = await cancelVisit(visitId, reason);
    setLoading(false);
    if (result.success) {
      onCancelled();
    } else {
      setError(result.error || '취소 처리 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="취소 사유"
        className="w-40 px-2 py-1 text-xs border border-[#D4D0C8] rounded-lg focus:border-[#2D5A3D] focus:outline-none"
      />
      {error && <p className="text-[10px] text-[#D4442A]">{error}</p>}
      <div className="flex gap-1">
        <button
          type="button"
          onClick={() => setCanceling(false)}
          disabled={loading}
          className="text-xs text-[#6B6B5E] underline"
        >
          닫기
        </button>
        <button
          type="button"
          onClick={handleConfirm}
          disabled={loading}
          className="text-xs font-semibold text-[#D4442A] underline disabled:opacity-50"
        >
          {loading ? '처리 중...' : '취소 확정'}
        </button>
      </div>
    </div>
  );
}

function LocationBadge({ status, distanceMeters }: { status: VisitRecordItem['locationVerified']; distanceMeters: number | null }) {
  if (status === 'success') {
    return (
      <span className="text-xs text-[#2D5A3D] font-semibold whitespace-nowrap">
        확인됨{distanceMeters != null && ` (${distanceMeters}m)`}
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="px-2 py-0.5 rounded-full text-xs font-bold text-white bg-[#D4442A] whitespace-nowrap">
        반경 밖{distanceMeters != null && ` (${distanceMeters}m)`}
      </span>
    );
  }
  return <span className="text-xs text-[#6B6B5E] whitespace-nowrap">확인 안 됨</span>;
}

function CustomerDetailPanel({ customerId, onClose }: { customerId: string | null; onClose: () => void }) {
  const [detail, setDetail] = useState<Awaited<ReturnType<typeof getCustomerDetail>>['data'] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!customerId) {
      setDetail(null);
      setError('');
      return;
    }

    let ignore = false;
    const fetchDetail = async () => {
      const result = await getCustomerDetail(customerId);
      if (ignore) return;
      if (result.success && result.data) {
        setDetail(result.data);
        setError('');
      } else {
        setError(result.error || '고객 정보를 불러올 수 없습니다.');
      }
    };

    fetchDetail();
    return () => {
      ignore = true;
    };
  }, [customerId]);

  if (!customerId) {
    return null;
  }

  return (
    <div className="rounded-2xl border border-[#E8E4DA] bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-[#F0EDE6]">
        <div>
          <p className="text-[11px] uppercase tracking-[0.12em] text-[#6B6B5E]">고객 정보</p>
          <h3 className="text-xl font-bold text-[#2D5A3D]">{detail?.customer.name ?? '고객 정보'}</h3>
        </div>
        <button type="button" onClick={onClose} className="text-sm text-[#6B6B5E] underline">
          닫기
        </button>
      </div>

      {error && (
        <div className="mt-4 bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}

      {!detail ? (
        <div className="mt-4 h-28 rounded-xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <div className="mt-4 space-y-4 text-[15px] text-[#333]">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-[#F8F7F2] p-3">
              <p className="text-[11px] text-[#6B6B5E]">여권번호</p>
              <p className="mt-1 font-semibold text-[#2D5A3D]">{detail.customer.customer_number}</p>
            </div>
            <div className="rounded-xl bg-[#F8F7F2] p-3">
              <p className="text-[11px] text-[#6B6B5E]">연락처</p>
              <p className="mt-1 font-semibold">{maskPhone(detail.customer.phone)}</p>
            </div>
            <div className="rounded-xl bg-[#F8F7F2] p-3">
              <p className="text-[11px] text-[#6B6B5E]">총 방문횟수</p>
              <p className="mt-1 font-semibold">{detail.customer.visit_count}회</p>
            </div>
            <div className="rounded-xl bg-[#F8F7F2] p-3">
              <p className="text-[11px] text-[#6B6B5E]">등급</p>
              <p className="mt-1 font-semibold">{getVisitTierInfo(detail.customer.visit_count).label}</p>
            </div>
          </div>

          <div className="rounded-xl bg-[#F8F7F2] p-3">
            <p className="text-[11px] text-[#6B6B5E]">최근 방문 매장</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {detail.visits.slice(0, 5).map((visit, idx) => (
                <span key={`${visit.visitDate}-${idx}`} className="rounded-full bg-white border border-[#E8E4DA] px-2.5 py-1 text-[11px] text-[#2D5A3D]">
                  {visit.storeName}
                </span>
              ))}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <Link href={`/admin/customers/${customerId}`} className="inline-flex items-center text-sm font-semibold text-[#2D5A3D] underline">
              상세 페이지로 이동
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function VisitRecordTable({
  records,
  onChanged,
  selectedCustomerId,
  onCustomerClick,
}: {
  records: VisitRecordItem[];
  onChanged: () => void;
  selectedCustomerId: string | null;
  onCustomerClick: (customerId: string) => void;
}) {
  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
        <p className="text-[15px] text-[#6B6B5E]">방문 기록이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-2xl border border-[#E8E4DA] bg-white shadow-sm">
      <table className="min-w-[1200px] w-full text-[13px]">
        <thead className="bg-[#F6F3ED]">
          <tr className="border-b border-[#E8E4DA] text-left text-[11px] font-semibold tracking-[0.02em] text-[#6B6B5E]">
            <th className="px-3 py-2.5">순번</th>
            <th className="px-3 py-2.5">성함</th>
            <th className="px-3 py-2.5">여권번호</th>
            <th className="px-3 py-2.5">연락처</th>
            <th className="px-3 py-2.5">방문매장</th>
            <th className="px-3 py-2.5">방문시간</th>
            <th className="px-3 py-2.5">총 방문횟수</th>
            <th className="px-3 py-2.5">등급</th>
            <th className="px-3 py-2.5">QR위치정보</th>
            <th className="px-3 py-2.5 text-right">취소</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r, index) => {
            const color = getStoreAdminColor(r.storeName);
            const tier = getVisitTierInfo(r.visitCount || 0);
            const selected = selectedCustomerId === r.customerId;
            return (
              <tr
                key={r.id}
                className={`border-b border-[#F0EDE6] last:border-0 hover:bg-[#F9F6F2] transition-colors ${selected ? 'bg-[#F3F8F4]' : ''}`}
                onClick={() => onCustomerClick(r.customerId)}
                style={{ cursor: 'pointer' }}
              >
                <td className="px-3 py-2.5 whitespace-nowrap text-[#555]">{index + 1}</td>
                <td className="px-3 py-2.5 whitespace-nowrap font-semibold text-[#2D5A3D]">{r.customerName}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-[#555]">{r.customerNumber}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-[#555]">{maskPhone(r.phone)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span
                    className="inline-flex rounded-full border px-2 py-1 text-[11px] font-semibold"
                    style={{
                      borderColor: color.border,
                      backgroundColor: color.bg,
                      color: color.text,
                    }}
                  >
                    {r.storeName}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap text-[#333]">{formatTimeKR(r.visitTime)}</td>
                <td className="px-3 py-2.5 whitespace-nowrap text-[#333]">{r.visitCount || 0}회</td>
                <td className="px-3 py-2.5 whitespace-nowrap">
                  <span className="inline-flex items-center rounded-full border border-[#D4D0C8] bg-[#F5F5EC] px-2 py-1 text-[11px] font-semibold text-[#2D5A3D]">
                    {tier.label}
                  </span>
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  <LocationBadge status={r.locationVerified} distanceMeters={r.distanceMeters} />
                </td>
                <td className="px-3 py-2.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                  {r.isCancelled ? (
                    <span className="text-[11px] text-[#6B6B5E]">{r.cancelReason ? `취소됨 · ${r.cancelReason}` : '취소됨'}</span>
                  ) : (
                    <CancelVisitControl visitId={r.id} onCancelled={onChanged} />
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TodayVisitorsSection({ storeId }: { storeId: string | null }) {
  const [records, setRecords] = useState<VisitRecordItem[] | null>(null);
  const [error, setError] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const result = await getTodayVisitors(storeId);
    if (result.success && result.data) {
      setRecords(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '방문자 목록을 불러올 수 없습니다.');
    }
  }, [storeId]);

  useEffect(() => {
    setRecords(null);
    setSelectedCustomerId(null);
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm text-[#6B6B5E]">오늘({formatDateKR(getTodayKST())}) 방문한 고객 목록입니다.</p>
        {records && records.length > 0 && (
          <button
            type="button"
            onClick={() => exportVisitCsv(records, '오늘_방문자_목록')}
            className="px-3 py-2 text-sm font-semibold text-[#2D5A3D] border border-[#D4D0C8] rounded-xl bg-white hover:bg-[#F5F5EC] transition-colors"
          >
            엑셀로 다운로드
          </button>
        )}
      </div>

      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}

      {!records ? (
        <div className="h-40 rounded-2xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <>
          <VisitRecordTable
            records={records}
            onChanged={fetchData}
            selectedCustomerId={selectedCustomerId}
            onCustomerClick={setSelectedCustomerId}
          />
          <CustomerDetailPanel customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(null)} />
        </>
      )}
    </div>
  );
}

function AllVisitRecordsSection({ storeId }: { storeId: string | null }) {
  const [query, setQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [records, setRecords] = useState<VisitRecordItem[] | null>(null);
  const [error, setError] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    const result = await getVisitRecords(query, dateFrom || undefined, dateTo || undefined, storeId);
    if (result.success && result.data) {
      setRecords(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '방문 기록을 불러올 수 없습니다.');
    }
  }, [query, dateFrom, dateTo, storeId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchData();
    }, 300);
    return () => clearTimeout(timer);
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 · 전화번호 검색"
          className="flex-1 min-w-[200px] px-4 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white placeholder-[#B0B0A0] focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2.5 text-sm border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
        />
        <span className="self-center text-[#6B6B5E] text-sm">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2.5 text-sm border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
        />
        {records && records.length > 0 && (
          <button
            type="button"
            onClick={() => exportVisitCsv(records, '전체_방문_기록')}
            className="px-3 py-2 text-sm font-semibold text-[#2D5A3D] border border-[#D4D0C8] rounded-xl bg-white hover:bg-[#F5F5EC] transition-colors"
          >
            엑셀로 다운로드
          </button>
        )}
      </div>

      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}

      {!records ? (
        <div className="h-40 rounded-2xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <>
          <VisitRecordTable
            records={records}
            onChanged={fetchData}
            selectedCustomerId={selectedCustomerId}
            onCustomerClick={setSelectedCustomerId}
          />
          <CustomerDetailPanel customerId={selectedCustomerId} onClose={() => setSelectedCustomerId(null)} />
        </>
      )}
    </div>
  );
}

function DuplicateVisitsSection() {
  const [groups, setGroups] = useState<DuplicateVisitGroup[] | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const result = await getDuplicateVisits();
    if (result.success && result.data) {
      setGroups(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '중복 방문 정보를 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6B6B5E]">
        같은 고객이 같은 날짜에 취소되지 않은 방문 기록을 2건 이상 가진 경우입니다.
      </p>
      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}
      {!groups ? (
        <div className="h-40 rounded-2xl bg-[#E8E8E0] animate-pulse" />
      ) : groups.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
          <p className="text-[15px] text-[#2D5A3D]">중복 방문 기록이 없습니다.</p>
        </div>
      ) : (
        <ul className="space-y-3">
          {groups.map((g) => (
            <li
              key={`${g.customerId}_${g.visitDate}`}
              className="bg-white rounded-2xl p-5 shadow-sm border border-[#F0D4B8] space-y-3"
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-base font-semibold text-[#2D5A3D]">{g.customerName}</p>
                  <p className="text-sm text-[#6B6B5E]">
                    {g.customerNumber} · {g.phone}
                  </p>
                </div>
                <p className="text-sm font-semibold text-[#D4442A]">{formatDateKR(g.visitDate)}</p>
              </div>
              <ul className="space-y-1">
                {g.visits.map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-sm text-[#555]">
                    <span>{formatTimeKR(v.visitTime)}</span>
                    <CancelVisitControl visitId={v.id} onCancelled={fetchData} />
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MismatchesSection() {
  const [items, setItems] = useState<VisitCountMismatchItem[] | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const result = await getVisitCountMismatches();
    if (result.success && result.data) {
      setItems(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '데이터를 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6B6B5E]">
        고객의 기록된 방문 횟수와 실제 방문 기록 건수가 다른 경우입니다. 일반 로그인 등으로 방문
        횟수가 잘못 올라가거나 누락된 경우를 확인할 수 있습니다.
      </p>
      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}
      {!items ? (
        <div className="h-40 rounded-2xl bg-[#E8E8E0] animate-pulse" />
      ) : items.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
          <p className="text-[15px] text-[#2D5A3D]">일치하지 않는 데이터가 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-[#E8E4DA]">
          <table className="w-full text-sm min-w-[560px]">
            <thead>
              <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#6B6B5E]">
                <th className="px-4 py-3 font-medium">고객명</th>
                <th className="px-4 py-3 font-medium">여권번호</th>
                <th className="px-4 py-3 font-medium">연락처</th>
                <th className="px-4 py-3 font-medium text-right">기록된 방문횟수</th>
                <th className="px-4 py-3 font-medium text-right">실제 방문기록수</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.customerId} className="border-b border-[#F0EDE6] last:border-0">
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-[#2D5A3D]">{it.customerName}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#555]">{it.customerNumber}</td>
                  <td className="px-4 py-3 whitespace-nowrap text-[#555]">{it.phone}</td>
                  <td className="px-4 py-3 text-right text-[#333]">{it.recordedVisitCount}회</td>
                  <td className="px-4 py-3 text-right font-semibold text-[#D4442A]">
                    {it.actualVisitCount}회
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ManualAddSection() {
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<CustomerListItem[]>([]);
  const [selected, setSelected] = useState<CustomerListItem | null>(null);
  const [visitDate, setVisitDate] = useState(getTodayKST());
  const [reason, setReason] = useState('');
  const [stores, setStores] = useState<Store[] | null>(null);
  const [storeId, setStoreId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  useEffect(() => {
    getStores().then((result) => {
      if (result.success && result.data) {
        setStores(result.data);
        if (result.data.length > 0) {
          setStoreId((prev) => prev || result.data![0].id);
        }
      }
    });
  }, []);

  useEffect(() => {
    if (selected || !query.trim()) {
      setCandidates([]);
      return;
    }
    const timer = setTimeout(async () => {
      const result = await getCustomerList(query, 'all');
      if (result.success && result.data) {
        setCandidates(result.data.slice(0, 8));
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [query, selected]);

  async function handleSubmit() {
    if (!selected) {
      setError('고객을 선택해 주세요.');
      return;
    }
    if (!storeId) {
      setError('매장을 선택해 주세요.');
      return;
    }
    setLoading(true);
    setError('');
    setSuccess('');

    const result = await addManualVisit(selected.id, visitDate, reason, storeId);

    setLoading(false);
    if (result.success) {
      setSuccess(`${selected.name} 고객의 ${formatDateKR(visitDate)} 방문이 추가되었습니다.`);
      setSelected(null);
      setQuery('');
      setReason('');
      setVisitDate(getTodayKST());
    } else {
      setError(result.error || '방문 추가 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-[#6B6B5E]">
        QR 스캔 없이 매장에서 직접 방문을 등록해야 하는 경우 관리자가 수동으로 추가할 수 있습니다.
      </p>

      <div>
        <label className="block text-sm font-medium text-[#555] mb-1">고객 선택</label>
        {selected ? (
          <div className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-[#E8E4DA]">
            <span className="text-[15px] text-[#2D5A3D] font-medium">
              {selected.name} ({selected.customerNumber} · {selected.phone})
            </span>
            <button
              type="button"
              onClick={() => setSelected(null)}
              className="text-sm text-[#6B6B5E] underline"
            >
              변경
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="이름 · 전화번호 검색"
              className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                         bg-white placeholder-[#B0B0A0] focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
            />
            {candidates.length > 0 && (
              <ul className="bg-white rounded-xl border border-[#E8E4DA] divide-y divide-[#F0EDE6] overflow-hidden">
                {candidates.map((c) => (
                  <li key={c.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelected(c);
                        setCandidates([]);
                      }}
                      className="w-full text-left px-4 py-3 hover:bg-[#F5F5EC] transition-colors duration-200"
                    >
                      <span className="text-[15px] text-[#2D5A3D] font-medium">{c.name}</span>
                      <span className="ml-2 text-sm text-[#6B6B5E]">
                        {c.customerNumber} · {c.phone}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <div>
        <label className="block text-sm font-medium text-[#555] mb-1">방문 매장</label>
        <select
          value={storeId}
          onChange={(e) => setStoreId(e.target.value)}
          className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
        >
          {!stores ? (
            <option value="">불러오는 중...</option>
          ) : (
            stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))
          )}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-[#555] mb-1">방문 날짜</label>
        <input
          type="date"
          value={visitDate}
          onChange={(e) => setVisitDate(e.target.value)}
          max={getTodayKST()}
          className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-[#555] mb-1">추가 사유</label>
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="예: QR 스캔 오류로 직원이 직접 등록"
          className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                     bg-white placeholder-[#B0B0A0] focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
        />
      </div>

      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}
      {success && (
        <div className="bg-[#F0F7F2] border border-[#C4DCC9] text-[#2D5A3D] px-4 py-3 rounded-xl text-[15px]">
          {success}
        </div>
      )}

      <button
        type="button"
        onClick={handleSubmit}
        disabled={loading}
        className="w-full py-3 px-4 bg-[#2D5A3D] text-white text-base font-semibold rounded-xl
                   shadow-sm hover:bg-[#245032] transition-colors duration-200 disabled:bg-[#999] disabled:cursor-not-allowed"
      >
        {loading ? '추가 중...' : '방문 추가'}
      </button>
    </div>
  );
}

export default function VisitManagement() {
  const [section, setSection] = useState<Section>('today');
  const [storeId, setStoreId] = useState<string | null>(null);

  const currentSection = SECTIONS.find((s) => s.key === section);

  return (
    <main className="flex flex-col min-h-screen px-6 py-8 bg-[#FAFAF8]">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <header className="bg-gradient-to-r from-[#2D5A3D] to-[#1F3D2A] rounded-2xl px-6 py-8 text-white shadow-lg">
          <h1 className="text-3xl font-extrabold mb-1">📋 방문관리</h1>
          <p className="text-[#E8F0E6] text-sm font-medium">방문 기록을 조회하고, 이상 여부를 점검할 수 있습니다.</p>
        </header>

        <AdminNav active="visits" />

        <div className="flex flex-wrap gap-2.5">
          {SECTIONS.map((s) => (
            <TabButton key={s.key} label={s.label} icon={s.icon} active={section === s.key} onClick={() => setSection(s.key)} />
          ))}
        </div>

        {(section === 'today' || section === 'all') && (
          <StoreFilterBar value={storeId} onChange={setStoreId} />
        )}

        <div className="bg-white rounded-2xl p-6 shadow-md border border-[#E8E4DA]">
          <div className="mb-5 pb-4 border-b border-[#F0EDE6]">
            <h2 className="text-lg font-bold text-[#2D5A3D]">{currentSection?.icon} {currentSection?.label}</h2>
            <p className="text-sm text-[#6B6B5E] mt-1">{currentSection?.desc}</p>
          </div>

          {section === 'today' && <TodayVisitorsSection storeId={storeId} />}
          {section === 'all' && <AllVisitRecordsSection storeId={storeId} />}
          {section === 'duplicates' && <DuplicateVisitsSection />}
          {section === 'mismatches' && <MismatchesSection />}
          {section === 'manualAdd' && <ManualAddSection />}
        </div>
      </div>
    </main>
  );
}
