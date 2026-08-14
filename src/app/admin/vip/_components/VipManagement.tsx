'use client';

import { useState, useEffect, useCallback } from 'react';
import { getVipCustomers, updateCustomerAdminNote, type VipCustomerItem } from '@/app/admin/actions';
import { formatDateKR } from '@/lib/utils';
import AdminNav from '../../_components/AdminNav';

function AdminNoteCell({
  customerId,
  note,
  onSaved,
}: {
  customerId: string;
  note: string | null;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(note || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <p className="text-[#555] whitespace-pre-line">{note || '메모 없음'}</p>
        <button
          type="button"
          onClick={() => {
            setValue(note || '');
            setEditing(true);
          }}
          className="flex-shrink-0 text-xs text-[#2D5A3D] underline"
        >
          수정
        </button>
      </div>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError('');
    const result = await updateCustomerAdminNote(customerId, value);
    setLoading(false);
    if (result.success) {
      setEditing(false);
      onSaved();
    } else {
      setError(result.error || '저장 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="space-y-1 min-w-[200px]">
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="메모를 입력하세요"
        className="w-full px-2 py-1.5 text-sm border-2 border-[#D4D0C8] rounded-lg focus:border-[#2D5A3D] focus:outline-none resize-none"
      />
      {error && <p className="text-[10px] text-[#D4442A]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(false)} disabled={loading} className="text-xs text-[#8C8C80] underline">
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="text-xs font-semibold text-[#2D5A3D] underline disabled:opacity-50"
        >
          {loading ? '저장 중...' : '저장'}
        </button>
      </div>
    </div>
  );
}

export default function VipManagement() {
  const [customers, setCustomers] = useState<VipCustomerItem[] | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const result = await getVipCustomers();
    if (result.success && result.data) {
      setCustomers(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || 'VIP 고객 목록을 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">VIP관리</h1>
          <p className="text-sm text-[#8C8C80]">30회 이상 방문한 해율푸드 VIP 고객을 별도로 관리합니다.</p>
        </header>

        <AdminNav active="vip" />

        {error && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        {!customers ? (
          <div className="h-40 rounded-2xl bg-[#E8E8E0] animate-pulse" />
        ) : customers.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
            <p className="text-[15px] text-[#8C8C80]">아직 해율푸드 VIP 고객이 없습니다.</p>
          </div>
        ) : (
          <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-[#E8E4DA]">
            <table className="w-full text-sm min-w-[920px]">
              <thead>
                <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#8C8C80]">
                  <th className="px-4 py-3 font-medium">고객명</th>
                  <th className="px-4 py-3 font-medium">여권번호</th>
                  <th className="px-4 py-3 font-medium">연락처</th>
                  <th className="px-4 py-3 font-medium">VIP 달성일</th>
                  <th className="px-4 py-3 font-medium text-right">총 방문 횟수</th>
                  <th className="px-4 py-3 font-medium">최근 방문일</th>
                  <th className="px-4 py-3 font-medium">감사 선물</th>
                  <th className="px-4 py-3 font-medium">관리자 메모</th>
                </tr>
              </thead>
              <tbody>
                {customers.map((c) => (
                  <tr key={c.id} className="border-b border-[#F0EDE6] last:border-0 align-top">
                    <td className="px-4 py-3 whitespace-nowrap font-medium text-[#2D5A3D]">{c.name}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#555]">{c.customerNumber}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#555]">{c.phone}</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#333]">
                      {c.vipAchievedAt ? formatDateKR(c.vipAchievedAt) : '-'}
                    </td>
                    <td className="px-4 py-3 text-right whitespace-nowrap text-[#333]">{c.visitCount}회</td>
                    <td className="px-4 py-3 whitespace-nowrap text-[#8C8C80]">
                      {c.recentVisitDate ? formatDateKR(c.recentVisitDate) : '-'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {c.giftUsed ? (
                        <span className="text-xs text-[#8C8C80] font-semibold">사용 완료</span>
                      ) : (
                        <span className="text-xs text-[#B8860B] font-semibold">미사용</span>
                      )}
                    </td>
                    <td className="px-4 py-3 min-w-[220px]">
                      <AdminNoteCell customerId={c.id} note={c.adminNote} onSaved={fetchData} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
