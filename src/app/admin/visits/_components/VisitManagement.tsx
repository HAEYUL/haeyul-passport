'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getTodayVisitors,
  getVisitRecords,
  getDuplicateVisits,
  getVisitCountMismatches,
  cancelVisit,
  addManualVisit,
  getCustomerList,
  getStores,
  type VisitRecordItem,
  type DuplicateVisitGroup,
  type VisitCountMismatchItem,
  type CustomerListItem,
} from '@/app/admin/actions';
import type { Store } from '@/types/database';
import { formatDateKR, getTodayKST } from '@/lib/utils';
import AdminNav from '../../_components/AdminNav';
import StoreFilterBar from '../../_components/StoreFilterBar';

type Section = 'today' | 'all' | 'duplicates' | 'mismatches' | 'manualAdd';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'today', label: '오늘 방문자 목록' },
  { key: 'all', label: '전체 방문 기록' },
  { key: 'duplicates', label: '중복 방문 확인' },
  { key: 'mismatches', label: '비정상 등록 확인' },
  { key: 'manualAdd', label: '수동 방문 추가' },
];

function formatTimeKR(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('ko-KR', {
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Asia/Seoul',
  });
}

function TabButton({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
        active
          ? 'bg-[#2D5A3D] text-white'
          : 'bg-white text-[#2D5A3D] border-2 border-[#D4D0C8] hover:bg-[#F5F5EC]'
      }`}
    >
      {label}
    </button>
  );
}

/**
 * 취소 버튼 + 인라인 사유 입력을 담당하는 공용 컴포넌트
 */
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
          className="text-xs text-[#8C8C80] underline"
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

function VisitRecordTable({
  records,
  onChanged,
}: {
  records: VisitRecordItem[];
  onChanged: () => void;
}) {
  if (records.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
        <p className="text-[15px] text-[#8C8C80]">방문 기록이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-[#E8E4DA]">
      <table className="w-full text-sm min-w-[680px]">
        <thead>
          <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#8C8C80]">
            <th className="px-4 py-3 font-medium">방문일</th>
            <th className="px-4 py-3 font-medium">방문시각</th>
            <th className="px-4 py-3 font-medium">고객명</th>
            <th className="px-4 py-3 font-medium">여권번호</th>
            <th className="px-4 py-3 font-medium">연락처</th>
            <th className="px-4 py-3 font-medium">상태</th>
            <th className="px-4 py-3 font-medium text-right">관리</th>
          </tr>
        </thead>
        <tbody>
          {records.map((r) => (
            <tr key={r.id} className="border-b border-[#F0EDE6] last:border-0">
              <td className="px-4 py-3 whitespace-nowrap text-[#333]">{formatDateKR(r.visitDate)}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#555]">{formatTimeKR(r.visitTime)}</td>
              <td className="px-4 py-3 whitespace-nowrap font-medium text-[#2D5A3D]">{r.customerName}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#555]">{r.customerNumber}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#555]">{r.phone}</td>
              <td className="px-4 py-3 whitespace-nowrap">
                {r.isCancelled ? (
                  <span className="text-xs text-[#AAA]">
                    취소됨{r.cancelReason ? ` · ${r.cancelReason}` : ''}
                  </span>
                ) : (
                  <span className="text-xs text-[#2D5A3D] font-semibold">정상</span>
                )}
              </td>
              <td className="px-4 py-3 text-right">
                {!r.isCancelled && <CancelVisitControl visitId={r.id} onCancelled={onChanged} />}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TodayVisitorsSection({ storeId }: { storeId: string | null }) {
  const [records, setRecords] = useState<VisitRecordItem[] | null>(null);
  const [error, setError] = useState('');

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
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#8C8C80]">오늘({formatDateKR(getTodayKST())}) 방문한 고객 목록입니다.</p>
      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}
      {!records ? (
        <div className="h-40 rounded-2xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <VisitRecordTable records={records} onChanged={fetchData} />
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
          className="flex-1 min-w-[200px] px-4 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                     bg-white placeholder-[#B0B0A0] focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
        />
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="px-3 py-2.5 text-sm border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
        />
        <span className="self-center text-[#AAA] text-sm">~</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="px-3 py-2.5 text-sm border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
        />
      </div>

      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}

      {!records ? (
        <div className="h-40 rounded-2xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <VisitRecordTable records={records} onChanged={fetchData} />
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
      <p className="text-sm text-[#8C8C80]">
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
                  <p className="text-sm text-[#8C8C80]">
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
      <p className="text-sm text-[#8C8C80]">
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
              <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#8C8C80]">
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
      <p className="text-sm text-[#8C8C80]">
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
              className="text-sm text-[#AAA] underline"
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
                      <span className="ml-2 text-sm text-[#8C8C80]">
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

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">방문관리</h1>
          <p className="text-sm text-[#8C8C80]">방문 기록을 조회하고, 이상 여부를 점검할 수 있습니다.</p>
        </header>

        <AdminNav active="visits" />

        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <TabButton key={s.key} label={s.label} active={section === s.key} onClick={() => setSection(s.key)} />
          ))}
        </div>

        {(section === 'today' || section === 'all') && (
          <StoreFilterBar value={storeId} onChange={setStoreId} />
        )}

        {section === 'today' && <TodayVisitorsSection storeId={storeId} />}
        {section === 'all' && <AllVisitRecordsSection storeId={storeId} />}
        {section === 'duplicates' && <DuplicateVisitsSection />}
        {section === 'mismatches' && <MismatchesSection />}
        {section === 'manualAdd' && <ManualAddSection />}
      </div>
    </main>
  );
}
