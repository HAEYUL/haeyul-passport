'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getRewardStats,
  getAvailableRewards,
  getUsedRewards,
  getRewardCustomerList,
  restoreReward,
  getRewardRules,
  createRewardRule,
  updateRewardRule,
  deleteRewardRule,
  type RewardStatItem,
  type RewardUsageItem,
  type RewardCustomerItem,
  type RewardRuleAdminItem,
  type RewardRuleInput,
} from '@/app/admin/actions';
import { formatDateKR } from '@/lib/utils';
import AdminNav from '../../_components/AdminNav';
import StoreFilterBar from '../../_components/StoreFilterBar';

type Section = 'stats' | 'available' | 'used' | 'catalog';

const SECTIONS: { key: Section; label: string; icon: string; desc: string }[] = [
  { key: 'stats', label: '등급별 통계', icon: '📈', desc: '할인권의 발급·사용 현황' },
  { key: 'available', label: '사용 가능한 할인권', icon: '✅', desc: '사용 가능한 할인권 목록' },
  { key: 'used', label: '사용 완료 할인권', icon: '✔️', desc: '사용이 완료된 할인권' },
  { key: 'catalog', label: '할인권 규칙 관리', icon: '⚙️', desc: '할인권 규칙 설정' },
];

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

function ruleLabel(s: { thresholdVisits: number; isRepeating: boolean; repeatInterval: number | null }) {
  if (s.isRepeating && s.repeatInterval) {
    return `해율VIP ${s.repeatInterval}회마다`;
  }
  return `${s.thresholdVisits}회 방문`;
}

function StatsSection({ storeId }: { storeId: string | null }) {
  const [stats, setStats] = useState<RewardStatItem[] | null>(null);
  const [selectedMetric, setSelectedMetric] = useState<{
    key: 'issued' | 'used' | 'unused';
    title: string;
    filter?: { ruleThresholdVisits?: number; amount?: number; isRepeating?: boolean; repeatInterval?: number | null };
  } | null>(null);
  const [metricCustomers, setMetricCustomers] = useState<RewardCustomerItem[] | null>(null);
  const [metricError, setMetricError] = useState('');
  const [error, setError] = useState('');

  const fetchStats = useCallback(async () => {
    const result = await getRewardStats(storeId);
    if (result.success && result.data) {
      setStats(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '할인권 현황을 불러올 수 없습니다.');
    }
  }, [storeId]);

  const fetchMetricCustomers = useCallback(async () => {
    if (!selectedMetric) return;
    const result = await getRewardCustomerList({
      kind: selectedMetric.key,
      storeId,
      ...selectedMetric.filter,
    });
    if (result.success) {
      setMetricCustomers(result.data ?? []);
      setMetricError('');
    } else {
      setMetricCustomers([]);
      setMetricError(result.error || '고객 목록을 불러올 수 없습니다.');
    }
  }, [selectedMetric, storeId]);

  useEffect(() => {
    setStats(null);
    fetchStats();
  }, [fetchStats]);

  useEffect(() => {
    fetchMetricCustomers();
  }, [fetchMetricCustomers]);

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

  function openMetric(key: 'issued' | 'used' | 'unused', title: string, filter?: { ruleThresholdVisits?: number; amount?: number; isRepeating?: boolean; repeatInterval?: number | null }) {
    setSelectedMetric({ key, title, filter });
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => openMetric('issued', '총 발급 고객 목록')}
          className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA] text-left hover:bg-[#F5F5EC] transition-colors hover:border-[#D4D0C8]"
        >
          <p className="text-sm text-[#6B6B5E]">총 발급</p>
          <p className="mt-2 text-3xl font-bold text-[#2D5A3D] leading-none">{totals.issued}</p>
        </button>
        <button
          type="button"
          onClick={() => openMetric('used', '사용된 할인권 고객 목록')}
          className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA] text-left hover:bg-[#F5F5EC] transition-colors hover:border-[#D4D0C8]"
        >
          <p className="text-sm text-[#6B6B5E]">사용됨</p>
          <p className="mt-2 text-3xl font-bold text-[#6B6B5E] leading-none">{totals.used}</p>
        </button>
        <button
          type="button"
          onClick={() => openMetric('unused', '미사용 할인권 고객 목록')}
          className="bg-white rounded-2xl p-5 shadow-sm border border-[#E8E4DA] text-left hover:bg-[#F5F5EC] transition-colors hover:border-[#D4D0C8]"
        >
          <p className="text-sm text-[#6B6B5E]">미사용</p>
          <p className="mt-2 text-3xl font-bold text-[#8A5800] leading-none">{totals.unused}</p>
        </button>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-[#E8E4DA] overflow-x-auto">
        <table className="w-full text-[15px] min-w-[420px]">
          <thead>
            <tr className="border-b border-[#F0EDE6] text-left text-sm text-[#6B6B5E]">
              <th className="px-5 py-3 font-medium">할인권</th>
              <th className="px-3 py-3 font-medium text-right">발급</th>
              <th className="px-3 py-3 font-medium text-right">사용</th>
              <th className="px-5 py-3 font-medium text-right">미사용</th>
            </tr>
          </thead>
          <tbody>
            {stats.map((s) => (
              <tr key={s.ruleId} className="border-b border-[#F0EDE6] last:border-0 hover:bg-[#F9F6F2] transition-colors">
                <td className="px-5 py-4">
                  <p className="font-medium text-[#333]">{s.amount.toLocaleString()}원 할인권</p>
                  <p className="text-xs text-[#6B6B5E]">{ruleLabel(s)}</p>
                </td>
                <td className="px-3 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => openMetric('issued', `${s.amount.toLocaleString()}원 할인권 발급 고객`, { ruleThresholdVisits: s.thresholdVisits, amount: s.amount, isRepeating: s.isRepeating, repeatInterval: s.repeatInterval })}
                    className="inline-flex min-w-[2.5rem] justify-center rounded-md border border-[#D4D0C8] bg-[#F5F5EC] px-2 py-1 text-sm font-semibold text-[#2D5A3D] hover:bg-[#EEF2EA]"
                  >
                    {s.totalIssued}
                  </button>
                </td>
                <td className="px-3 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => openMetric('used', `${s.amount.toLocaleString()}원 할인권 사용 고객`, { ruleThresholdVisits: s.thresholdVisits, amount: s.amount, isRepeating: s.isRepeating, repeatInterval: s.repeatInterval })}
                    className="inline-flex min-w-[2.5rem] justify-center rounded-md border border-[#D4D0C8] bg-[#F5F5EC] px-2 py-1 text-sm font-semibold text-[#6B6B5E] hover:bg-[#F0F1EE]"
                  >
                    {s.totalUsed}
                  </button>
                </td>
                <td className="px-5 py-4 text-right">
                  <button
                    type="button"
                    onClick={() => openMetric('unused', `${s.amount.toLocaleString()}원 할인권 미사용 고객`, { ruleThresholdVisits: s.thresholdVisits, amount: s.amount, isRepeating: s.isRepeating, repeatInterval: s.repeatInterval })}
                    className="inline-flex min-w-[2.5rem] justify-center rounded-md border border-[#EAD9B5] bg-[#FFF9F0] px-2 py-1 text-sm font-semibold text-[#8A5800] hover:bg-[#FDEFD8]"
                  >
                    {s.totalUnused}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {selectedMetric && (
        <div className="rounded-2xl border border-[#E8E4DA] bg-white p-4 shadow-sm">
          <div className="mb-3 flex items-center justify-between gap-3 border-b border-[#F0EDE6] pb-3">
            <h3 className="text-lg font-bold text-[#2D5A3D]">{selectedMetric.title}</h3>
            <button type="button" onClick={() => setSelectedMetric(null)} className="text-sm text-[#6B6B5E] underline">
              닫기
            </button>
          </div>

          {metricError && (
            <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
              {metricError}
            </div>
          )}

          {!metricCustomers ? (
            <div className="h-28 rounded-xl bg-[#E8E8E0] animate-pulse" />
          ) : metricCustomers.length === 0 ? (
            <p className="text-[15px] text-[#6B6B5E]">해당 조건에 맞는 고객이 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[#F0EDE6] text-left text-[11px] font-semibold tracking-[0.03em] text-[#6B6B5E]">
                    <th className="px-3 py-2">고객명</th>
                    <th className="px-3 py-2">여권번호</th>
                    <th className="px-3 py-2">연락처</th>
                    <th className="px-3 py-2">할인권</th>
                    <th className="px-3 py-2">상태</th>
                    <th className="px-3 py-2">발급매장</th>
                    {selectedMetric.key === 'used' && <th className="px-3 py-2">사용매장</th>}
                  </tr>
                </thead>
                <tbody>
                  {metricCustomers.map((customer) => (
                    <tr key={customer.id} className="border-b border-[#F0EDE6] last:border-0 hover:bg-[#F9F6F2] transition-colors">
                      <td className="px-3 py-2.5 font-medium text-[#2D5A3D]">{customer.customerName}</td>
                      <td className="px-3 py-2.5 text-[#555]">{customer.customerNumber}</td>
                      <td className="px-3 py-2.5 text-[#555]">{customer.phone}</td>
                      <td className="px-3 py-2.5 text-[#333]">{customer.amount.toLocaleString()}원</td>
                      <td className="px-3 py-2.5">
                        <span className={`inline-flex rounded-full px-2 py-1 text-[11px] font-semibold ${customer.status === 'used' ? 'bg-[#F0F7F2] text-[#2D5A3D]' : 'bg-[#FFF8F0] text-[#8A5800]'}`}>
                          {customer.status === 'used' ? '사용됨' : '미사용'}
                        </span>
                      </td>
                      <td className="px-3 py-2.5 text-[#555]">{customer.issuedStoreName}</td>
                      {selectedMetric.key === 'used' && <td className="px-3 py-2.5 text-[#555]">{customer.usedStoreName || '-'}</td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
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
        <button type="button" onClick={() => setRestoring(false)} disabled={loading} className="text-xs text-[#6B6B5E] underline">
          닫기
        </button>
        <button type="button" onClick={handleConfirm} disabled={loading} className="text-xs font-semibold text-[#2D5A3D] underline disabled:opacity-50">
          {loading ? '처리 중...' : '복원 확정'}
        </button>
      </div>
    </div>
  );
}

function RewardUsageSection({ statusFilter, storeId }: { statusFilter: 'available' | 'used'; storeId: string | null }) {
  const [items, setItems] = useState<RewardUsageItem[] | null>(null);
  const [error, setError] = useState('');

  const fetchData = useCallback(async () => {
    const result = statusFilter === 'used' ? await getUsedRewards(storeId) : await getAvailableRewards(storeId);
    if (result.success && result.data) {
      setItems(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '할인권 목록을 불러올 수 없습니다.');
    }
  }, [statusFilter, storeId]);

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
        <p className="text-[15px] text-[#6B6B5E]">
          {statusFilter === 'used' ? '사용 완료된 할인권이 없습니다.' : '사용 가능한 할인권이 없습니다.'}
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-[#E8E4DA]">
      <table className="w-full text-sm min-w-[720px]">
        <thead>
          <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#6B6B5E]">
            <th className="px-4 py-3 font-medium">고객명</th>
            <th className="px-4 py-3 font-medium">여권번호</th>
            <th className="px-4 py-3 font-medium">할인권</th>
            <th className="px-4 py-3 font-medium">발급일 / 발급매장</th>
            {statusFilter === 'used' && <th className="px-4 py-3 font-medium">사용일 / 사용매장</th>}
            {statusFilter === 'used' && <th className="px-4 py-3 font-medium text-right">관리</th>}
          </tr>
        </thead>
        <tbody>
          {items.map((it) => (
            <tr key={it.id} className="border-b border-[#F0EDE6] last:border-0">
              <td className="px-4 py-3 whitespace-nowrap font-medium text-[#2D5A3D]">{it.customerName}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#555]">{it.customerNumber}</td>
              <td className="px-4 py-3 whitespace-nowrap text-[#333]">
                {it.amount.toLocaleString()}원 <span className="text-xs text-[#6B6B5E]">({it.thresholdVisits}회)</span>
              </td>
              <td className="px-4 py-3 whitespace-nowrap text-[#6B6B5E]">
                {formatDateKR(it.issuedAt)} · {it.issuedStoreName}
              </td>
              {statusFilter === 'used' && (
                <td className="px-4 py-3 whitespace-nowrap text-[#6B6B5E]">
                  {it.usedAt ? formatDateKR(it.usedAt) : '-'}
                  {it.usedStoreName && ` · ${it.usedStoreName}`}
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

const emptyRuleForm: RewardRuleInput = {
  thresholdVisits: 0,
  amount: 0,
  isRepeating: false,
  repeatInterval: null,
};

function RuleForm({
  initial,
  submitLabel,
  onCancel,
  onSubmit,
}: {
  initial: RewardRuleInput;
  submitLabel: string;
  onCancel?: () => void;
  onSubmit: (input: RewardRuleInput) => Promise<{ success: boolean; error?: string }>;
}) {
  const [thresholdVisits, setThresholdVisits] = useState(String(initial.thresholdVisits || ''));
  const [amount, setAmount] = useState(String(initial.amount || ''));
  const [isRepeating, setIsRepeating] = useState(initial.isRepeating);
  const [repeatInterval, setRepeatInterval] = useState(String(initial.repeatInterval || ''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit() {
    setLoading(true);
    setError('');
    const result = await onSubmit({
      thresholdVisits: Number(thresholdVisits),
      amount: Number(amount),
      isRepeating,
      repeatInterval: isRepeating ? Number(repeatInterval) : null,
    });
    setLoading(false);
    if (!result.success) {
      setError(result.error || '저장 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-[#6B6B5E] mb-1">기준 방문 횟수</label>
          <input
            type="number"
            value={thresholdVisits}
            onChange={(e) => setThresholdVisits(e.target.value)}
            className="w-full px-3 py-2 text-[15px] border-2 border-[#D4D0C8] rounded-xl focus:border-[#2D5A3D] focus:outline-none"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-[#6B6B5E] mb-1">할인 금액 (원)</label>
          <input
            type="number"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="w-full px-3 py-2 text-[15px] border-2 border-[#D4D0C8] rounded-xl focus:border-[#2D5A3D] focus:outline-none"
          />
        </div>
      </div>
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id={`repeating-${submitLabel}`}
          checked={isRepeating}
          onChange={(e) => setIsRepeating(e.target.checked)}
          className="w-4 h-4"
        />
        <label htmlFor={`repeating-${submitLabel}`} className="text-sm text-[#333]">
          기준 횟수 이후 반복 발급
        </label>
      </div>
      {isRepeating && (
        <div>
          <label className="block text-xs font-medium text-[#6B6B5E] mb-1">반복 주기 (몇 회마다)</label>
          <input
            type="number"
            value={repeatInterval}
            onChange={(e) => setRepeatInterval(e.target.value)}
            className="w-full px-3 py-2 text-[15px] border-2 border-[#D4D0C8] rounded-xl focus:border-[#2D5A3D] focus:outline-none"
          />
        </div>
      )}
      {error && <p className="text-sm text-[#D4442A]">{error}</p>}
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" onClick={onCancel} disabled={loading} className="px-4 py-2 text-sm text-[#6B6B5E] underline">
            취소
          </button>
        )}
        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading}
          className="px-4 py-2 text-sm font-semibold bg-[#2D5A3D] text-white rounded-xl disabled:opacity-50"
        >
          {loading ? '저장 중...' : submitLabel}
        </button>
      </div>
    </div>
  );
}

function RuleRow({ item, onChanged }: { item: RewardRuleAdminItem; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');

  async function handleDelete() {
    setDeleting(true);
    setError('');
    const result = await deleteRewardRule(item.id);
    setDeleting(false);
    if (result.success) {
      onChanged();
    } else {
      setError(result.error || '삭제 중 오류가 발생했습니다.');
    }
  }

  if (editing) {
    return (
      <li className="bg-white rounded-2xl p-5 shadow-sm border border-[#2D5A3D]">
        <RuleForm
          initial={{
            thresholdVisits: item.thresholdVisits,
            amount: item.amount,
            isRepeating: item.isRepeating,
            repeatInterval: item.repeatInterval,
          }}
          submitLabel="저장"
          onCancel={() => setEditing(false)}
          onSubmit={async (input) => {
            const result = await updateRewardRule(item.id, input);
            if (result.success) {
              setEditing(false);
              onChanged();
            }
            return result;
          }}
        />
      </li>
    );
  }

  return (
    <li
      className={`bg-white rounded-2xl p-5 shadow-sm border-2 space-y-3 ${
        item.isActive ? 'border-[#E8E4DA]' : 'border-[#E8E4DA] opacity-50'
      }`}
    >
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-2xl font-extrabold leading-tight">
          <span className="text-[#232320]">{ruleLabel(item)}</span>
          <span className="mx-2 text-[#6B6B5E]">→</span>
          <span className="text-[#2D5A3D]">{item.amount.toLocaleString()}원</span>
        </p>
        {item.isActive && (
          <div className="flex gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="min-h-[44px] px-5 py-2.5 rounded-xl bg-[#2D5A3D] text-white text-base font-bold
                         hover:bg-[#245032] transition-colors duration-200"
            >
              수정
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={deleting}
              className="min-h-[44px] px-5 py-2.5 rounded-xl border-2 border-[#F0C4B8] text-[#D4442A] text-base font-bold
                         hover:bg-[#FFF5F0] transition-colors duration-200 disabled:opacity-50"
            >
              {deleting ? '삭제 중...' : '삭제'}
            </button>
          </div>
        )}
      </div>
      {!item.isActive && <p className="text-sm font-semibold text-[#8A5800]">삭제됨(비활성)</p>}
      {error && <p className="text-sm text-[#D4442A]">{error}</p>}
    </li>
  );
}

function CatalogSection() {
  const [items, setItems] = useState<RewardRuleAdminItem[] | null>(null);
  const [error, setError] = useState('');
  const [adding, setAdding] = useState(false);

  const fetchData = useCallback(async () => {
    const result = await getRewardRules();
    if (result.success && result.data) {
      setItems(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '할인권 규칙을 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6B6B5E]">
        방문 횟수에 따른 할인권 금액 규칙을 관리합니다. 규칙을 삭제해도 이미 발급된 할인권에는 영향이
        없으며, 새 할인권만 더 이상 발급되지 않습니다.
      </p>
      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}

      {adding ? (
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#2D5A3D]">
          <RuleForm
            initial={emptyRuleForm}
            submitLabel="추가"
            onCancel={() => setAdding(false)}
            onSubmit={async (input) => {
              const result = await createRewardRule(input);
              if (result.success) {
                setAdding(false);
                fetchData();
              }
              return result;
            }}
          />
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="w-full py-3 px-4 border-2 border-dashed border-[#D4D0C8] text-[#2D5A3D] text-sm font-semibold rounded-xl hover:bg-[#F5F5EC]"
        >
          + 새 할인권 규칙 추가
        </button>
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
            <RuleRow key={item.id} item={item} onChanged={fetchData} />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function RewardStats() {
  const [section, setSection] = useState<Section>('stats');
  const [storeId, setStoreId] = useState<string | null>(null);
  const currentSection = SECTIONS.find((s) => s.key === section);

  return (
    <main className="flex flex-col min-h-screen px-6 py-8 bg-[#FAFAF8]">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <header className="bg-gradient-to-r from-[#2D5A3D] to-[#1F3D2A] rounded-2xl px-6 py-8 text-white shadow-lg">
          <h1 className="text-3xl font-extrabold mb-1">🎁 할인권관리</h1>
          <p className="text-[#E8F0E6] text-sm font-medium">방문 할인권의 발급·사용 현황을 확인하고 관리할 수 있습니다.</p>
        </header>

        <AdminNav active="rewards" />

        <div className="flex flex-wrap gap-2.5">
          {SECTIONS.map((s) => (
            <TabButton key={s.key} label={s.label} icon={s.icon} active={section === s.key} onClick={() => setSection(s.key)} />
          ))}
        </div>

        {section !== 'catalog' && <StoreFilterBar value={storeId} onChange={setStoreId} />}

        <div className="bg-white rounded-2xl p-6 shadow-md border border-[#E8E4DA]">
          <div className="mb-5 pb-4 border-b border-[#F0EDE6]">
            <h2 className="text-lg font-bold text-[#2D5A3D]">{currentSection?.icon} {currentSection?.label}</h2>
            <p className="text-sm text-[#6B6B5E] mt-1">{currentSection?.desc}</p>
          </div>

          {section === 'stats' && <StatsSection storeId={storeId} />}
          {section === 'available' && <RewardUsageSection statusFilter="available" storeId={storeId} />}
          {section === 'used' && <RewardUsageSection statusFilter="used" storeId={storeId} />}
          {section === 'catalog' && <CatalogSection />}
        </div>

        <div className="pb-8" />
      </div>
    </main>
  );
}
