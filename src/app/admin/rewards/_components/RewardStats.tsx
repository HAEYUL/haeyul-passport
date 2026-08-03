'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getRewardStats,
  getAvailableRewards,
  getUsedRewards,
  restoreReward,
  getRewardCatalogForAdmin,
  updateRewardCatalogItem,
  type RewardStatItem,
  type RewardUsageItem,
  type RewardCatalogAdminItem,
} from '@/app/admin/actions';
import { formatDateKR } from '@/lib/utils';
import AdminNav from '../../_components/AdminNav';

type Section = 'stats' | 'available' | 'used' | 'catalog';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'stats', label: '등급별 통계' },
  { key: 'available', label: '사용 가능한 선물' },
  { key: 'used', label: '사용 완료 선물' },
  { key: 'catalog', label: '선물 기준 관리' },
];

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

function StatsSection() {
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

  if (error) {
    return (
      <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
        {error}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="space-y-2">
        {[1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-16 rounded-xl bg-[#E8E8E0] animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
    </div>
  );
}

function RestoreRewardControl({
  customerRewardId,
  onRestored,
}: {
  customerRewardId: string;
  onRestored: () => void;
}) {
  const [restoring, setRestoring] = useState(false);
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!restoring) {
    return (
      <button type="button" onClick={() => setRestoring(true)} className="text-xs text-[#2D5A3D] underline">
        복원
      </button>
    );
  }

  async function handleConfirm() {
    setLoading(true);
    setError('');
    const result = await restoreReward(customerRewardId, reason);
    setLoading(false);
    if (result.success) {
      onRestored();
    } else {
      setError(result.error || '복원 처리 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <input
        type="text"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="복원 사유"
        className="w-40 px-2 py-1 text-xs border border-[#D4D0C8] rounded-lg focus:border-[#2D5A3D] focus:outline-none"
      />
      {error && <p className="text-[10px] text-[#D4442A]">{error}</p>}
      <div className="flex gap-1">
        <button type="button" onClick={() => setRestoring(false)} disabled={loading} className="text-xs text-[#8C8C80] underline">
          닫기
        </button>
        <button type="button" onClick={handleConfirm} disabled={loading} className="text-xs font-semibold text-[#2D5A3D] underline disabled:opacity-50">
          {loading ? '처리 중...' : '복원 확정'}
        </button>
      </div>
    </div>
  );
}

function RewardUsageSection({ statusFilter }: { statusFilter: 'available' | 'used' }) {
  const [items, setItems] = useState<RewardUsageItem[] | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const result = statusFilter === 'used' ? await getUsedRewards() : await getAvailableRewards();
    if (result.success && result.data) {
      setItems(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '선물 목록을 불러올 수 없습니다.');
    }
  }, [statusFilter]);

  useEffect(() => {
    setItems(null);
    fetchData();
  }, [fetchData]);

  if (error) {
    return (
      <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
        {error}
      </div>
    );
  }

  if (!items) {
    return <div className="h-40 rounded-2xl bg-[#E8E8E0] animate-pulse" />;
  }

  if (items.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
        <p className="text-[15px] text-[#8C8C80]">
          {statusFilter === 'used' ? '사용 완료된 선물이 없습니다.' : '사용 가능한 선물이 없습니다.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-[#E8E4DA]">
      <table className="w-full text-sm min-w-[640px]">
        <thead>
          <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#8C8C80]">
            <th className="px-4 py-3 font-medium">고객명</th>
            <th className="px-4 py-3 font-medium">여권번호</th>
            <th className="px-4 py-3 font-medium">선물명</th>
            <th className="px-4 py-3 font-medium">발급일</th>
            {statusFilter === 'used' && <th className="px-4 py-3 font-medium">사용일</th>}
            {statusFilter === 'used' && <th className="px-4 py-3 font-medium text-right">관리</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-[#F0EDE6] last:border-0">
              <td className="px-4 py-3 whitespace-nowrap font-medium text-[#2D5A3D]">{it.customerName}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#555]">{it.customerNumber}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#333]">{it.rewardName}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#8C8C80]">{formatDateKR(it.issuedAt)}</td>
              {statusFilter === 'used' && (
                <td className="px-4 py-3 whitespace-nowrap text-[#8C8C80]">
                  {it.usedAt ? formatDateKR(it.usedAt) : '-'}
                </td>
              )}
              {statusFilter === 'used' && (
                <td className="px-4 py-3 text-right">
                  <RestoreRewardControl customerRewardId={it.id} onRestored={fetchData} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CatalogEditRow({
  item,
  onSaved,
}: {
  item: RewardCatalogAdminItem;
  onSaved: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (!editing) {
    return (
      <li className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA] space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-[#2D5A3D]">{item.requiredVisits}회 방문</span>
          <button
            type="button"
            onClick={() => {
              setName(item.name);
              setDescription(item.description || '');
              setEditing(true);
            }}
            className="text-sm text-[#2D5A3D] underline"
          >
            수정
          </button>
        </div>
        <p className="text-[15px] font-medium text-[#333]">{item.name}</p>
        {item.description && <p className="text-sm text-[#8C8C80] leading-relaxed">{item.description}</p>}
      </li>
    );
  }

  async function handleSave() {
    setLoading(true);
    setError('');
    const result = await updateRewardCatalogItem(item.id, { name, description });
    setLoading(false);
    if (result.success) {
      setEditing(false);
      onSaved();
    } else {
      setError(result.error || '저장 중 오류가 발생했습니다.');
    }
  }

  return (
    <li className="bg-white rounded-2xl p-5 shadow-sm border border-[#2D5A3D] space-y-3">
      <span className="text-sm font-semibold text-[#2D5A3D]">{item.requiredVisits}회 방문</span>
      <div>
        <label className="block text-xs font-medium text-[#8C8C80] mb-1">선물명</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full px-3 py-2 text-[15px] border-2 border-[#D4D0C8] rounded-xl focus:border-[#2D5A3D] focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-[#8C8C80] mb-1">설명</label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={2}
          className="w-full px-3 py-2 text-[15px] border-2 border-[#D4D0C8] rounded-xl focus:border-[#2D5A3D] focus:outline-none resize-none"
        />
      </div>
      {error && <p className="text-sm text-[#D4442A]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setEditing(false)}
          disabled={loading}
          className="px-4 py-2 text-sm text-[#8C8C80] underline"
        >
          취소
        </button>
        <button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="px-4 py-2 text-sm font-semibold bg-[#2D5A3D] text-white rounded-xl disabled:opacity-50"
        >
          {loading ? '저장 중...' : '저장'}
        </button>
      </div>
    </li>
  );
}

function CatalogSection() {
  const [items, setItems] = useState<RewardCatalogAdminItem[] | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const result = await getRewardCatalogForAdmin();
    if (result.success && result.data) {
      setItems(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '선물 기준을 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#8C8C80]">
        선물명과 설명을 이 화면에서 바로 수정할 수 있습니다. 방문 횟수 기준(3/5/10/20/30회)은 등급
        체계와 함께 관리되므로 여기서는 변경할 수 없습니다.
      </p>
      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}
      {!items ? (
        <div className="space-y-2">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-20 rounded-2xl bg-[#E8E8E0] animate-pulse" />
          ))}
        </div>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <CatalogEditRow key={item.id} item={item} onSaved={fetchData} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RewardStats() {
  const [section, setSection] = useState<Section>('stats');

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">선물관리</h1>
          <p className="text-sm text-[#8C8C80]">방문 선물의 발급·사용 현황을 확인하고 관리할 수 있습니다.</p>
        </header>

        <AdminNav active="rewards" />

        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <TabButton key={s.key} label={s.label} active={section === s.key} onClick={() => setSection(s.key)} />
          ))}
        </div>

        {section === 'stats' && <StatsSection />}
        {section === 'available' && <RewardUsageSection statusFilter="available" />}
        {section === 'used' && <RewardUsageSection statusFilter="used" />}
        {section === 'catalog' && <CatalogSection />}

        <div className="pb-8" />
      </div>
    </main>
  );
}
