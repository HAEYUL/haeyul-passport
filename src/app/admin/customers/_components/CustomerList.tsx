'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  getCustomerList,
  getTierBreakdown,
  updateCustomerAdminNote,
  type CustomerListItem,
  type CustomerListFilter,
  type TierBreakdownItem,
} from '@/app/admin/actions';
import { formatDateKR, getTodayKST, maskPhone } from '@/lib/utils';
import { getAllTiers, getVisitTierInfo, type VisitTierKey } from '@/lib/tiers';
import { getStoreAdminColor } from '@/lib/storeColors';
import AdminNav from '../../_components/AdminNav';
import StoreFilterBar from '../../_components/StoreFilterBar';
import SmsComposeModal from './SmsComposeModal';

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
          onClick={(e) => {
            e.stopPropagation();
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
    <div className="space-y-1 min-w-[200px]" onClick={(e) => e.stopPropagation()}>
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={2}
        placeholder="메모를 입력하세요"
        className="w-full px-2 py-1.5 text-sm border-2 border-[#D4D0C8] rounded-lg focus:border-[#2D5A3D] focus:outline-none resize-none"
      />
      {error && <p className="text-[10px] text-[#D4442A]">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={() => setEditing(false)} disabled={loading} className="text-xs text-[#6B6B5E] underline">
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

const FILTER_INFO: Record<CustomerListFilter, { title: string; description: string }> = {
  all: {
    title: '고객관리',
    description: '이름, 전화번호로 검색할 수 있습니다.',
  },
  todayVisits: {
    title: '오늘 방문 고객',
    description: '오늘 매장을 방문한 고객 목록입니다.',
  },
  newThisMonth: {
    title: '이번달 신규가입 고객',
    description: '이번 달에 새로 가입한 고객 목록입니다.',
  },
  unclaimedRewards: {
    title: '미사용 할인권 보유 고객',
    description: '아직 사용하지 않은 할인권을 가지고 있는 고객 목록입니다.',
  },
  todayRewardsUsed: {
    title: '오늘 할인권 사용 고객',
    description: '오늘 할인권을 사용한 고객 목록입니다.',
  },
  vip: {
    title: '해율푸드 VIP 고객',
    description: '해율푸드 VIP 등급(최고 등급)에 도달한 고객 목록입니다.',
  },
  longAbsent: {
    title: '장기 미방문 고객',
    description: '기준 일수 이상 매장을 방문하지 않은 고객 목록입니다.',
  },
  tier: {
    title: '등급별 고객',
    description: '등급을 선택하면 해당 등급 고객 목록을 볼 수 있습니다.',
  },
  birthdayThisMonth: {
    title: '이번달 생일 고객',
    description: '이번 달이 생일인 고객 목록입니다.',
  },
  visitedStore: {
    title: '매장별 방문 고객',
    description: '위에서 매장을 선택하면, 가입 매장과 무관하게 그 매장을 한 번이라도 방문한 고객 전체를 볼 수 있습니다. (신메뉴 안내 등 매장별 문자 발송에 사용)',
  },
  missingBirthDate: {
    title: '생년월일 미입력 고객',
    description: '생년월일을 등록하지 않아 생일쿠폰을 받을 수 없는 고객 목록입니다. 등록을 유도하는 안내 문자에 활용하세요.',
  },
};

const LONG_ABSENT_DAY_OPTIONS = [30, 60, 90] as const;
const TIER_KEYS: VisitTierKey[] = ['sprout', 'leaf', 'tree', 'forest', 'vip'];

function isCustomerListFilter(value: string | null): value is CustomerListFilter {
  return (
    value === 'todayVisits' ||
    value === 'newThisMonth' ||
    value === 'unclaimedRewards' ||
    value === 'todayRewardsUsed' ||
    value === 'vip' ||
    value === 'longAbsent' ||
    value === 'tier' ||
    value === 'birthdayThisMonth' ||
    value === 'visitedStore' ||
    value === 'missingBirthDate'
  );
}

function isVisitTierKey(value: string | null): value is VisitTierKey {
  return !!value && TIER_KEYS.includes(value as VisitTierKey);
}

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// CSV를 엑셀에서 열 때 한글이 깨지지 않도록 붙이는 UTF-8 BOM
const BOM = String.fromCharCode(0xfeff);

function exportCustomersCsv(customers: CustomerListItem[], isVip: boolean) {
  const headers = ['성함', '여권번호', '연락처', '방문 횟수', '등급', '가입일', '최근 방문일', '혜택·소식 수신동의'];
  if (isVip) {
    headers.push('VIP 달성일', '감사 할인권', '관리자 메모');
  }
  const rows = customers.map((c) => {
    const row = [
      c.name,
      c.customerNumber,
      c.phone,
      `${c.visitCount}회`,
      getVisitTierInfo(c.visitCount).label,
      formatDateKR(c.createdAt),
      c.recentVisitDate ? formatDateKR(c.recentVisitDate) : '-',
      c.marketingConsent ? '동의' : '미동의',
    ];
    if (isVip) {
      row.push(
        c.vipAchievedAt ? formatDateKR(c.vipAchievedAt) : '-',
        c.giftUsed ? '사용 완료' : '미사용',
        c.adminNote || ''
      );
    }
    return row;
  });

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `고객명단_${getTodayKST()}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export default function CustomerList() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const filter: CustomerListFilter = isCustomerListFilter(searchParams.get('filter'))
    ? (searchParams.get('filter') as CustomerListFilter)
    : 'all';

  const tierKey = isVisitTierKey(searchParams.get('tierKey')) ? (searchParams.get('tierKey') as VisitTierKey) : undefined;
  const isTierMenu = filter === 'tier' && !tierKey;

  const parsedDays = Number(searchParams.get('days'));
  const longAbsentDays = LONG_ABSENT_DAY_OPTIONS.includes(parsedDays as 30 | 60 | 90)
    ? parsedDays
    : LONG_ABSENT_DAY_OPTIONS[0];

  const [query, setQuery] = useState('');
  const [storeId, setStoreId] = useState<string | null>(null);
  const [marketingConsent, setMarketingConsent] = useState<boolean | null>(null);
  const [customers, setCustomers] = useState<CustomerListItem[] | null>(null);
  const [tierBreakdown, setTierBreakdown] = useState<TierBreakdownItem[] | null>(null);
  const [error, setError] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showSmsModal, setShowSmsModal] = useState(false);

  const fetchCustomers = useCallback(async (q: string) => {
    setCustomers(null);
    const result = await getCustomerList(q, filter, longAbsentDays, tierKey, storeId, marketingConsent);
    if (result.success && result.data) {
      setCustomers(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '고객 목록을 불러올 수 없습니다.');
    }
  }, [filter, longAbsentDays, tierKey, storeId, marketingConsent]);

  const fetchTierBreakdown = useCallback(async () => {
    setTierBreakdown(null);
    const result = await getTierBreakdown(storeId);
    if (result.success && result.data) {
      setTierBreakdown(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '등급 정보를 불러올 수 없습니다.');
    }
  }, [storeId]);

  useEffect(() => {
    if (isTierMenu) {
      fetchTierBreakdown();
    } else {
      fetchCustomers('');
    }
  }, [isTierMenu, fetchTierBreakdown, fetchCustomers]);

  useEffect(() => {
    if (isTierMenu) return;
    const timer = setTimeout(() => {
      fetchCustomers(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetchCustomers, isTierMenu]);

  // 새 목록이 로드되면 기본값으로 전체 선택 상태로 만듭니다.
  useEffect(() => {
    if (customers) {
      setSelectedIds(new Set(customers.map((c) => c.id)));
    }
  }, [customers]);

  function toggleSelectAll() {
    if (!customers) return;
    setSelectedIds((prev) => (prev.size === customers.length ? new Set() : new Set(customers.map((c) => c.id))));
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  let title = FILTER_INFO[filter].title;
  let description = FILTER_INFO[filter].description;
  if (filter === 'tier' && tierKey) {
    const tierDef = getAllTiers().find((t) => t.key === tierKey);
    if (tierDef) {
      title = `${tierDef.label} 등급 고객`;
      description = `현재 ${tierDef.label} 등급인 고객 목록입니다.`;
    }
  }

  return (
    <main className="flex flex-col min-h-screen px-6 py-8 bg-[#FAFAF8]">
      <div className="w-full max-w-4xl mx-auto space-y-6">
        <header className="bg-gradient-to-r from-[#2D5A3D] to-[#1F3D2A] rounded-2xl px-6 py-8 text-white shadow-lg">
          <h1 className="text-3xl font-extrabold mb-1">👥 {title}</h1>
          <p className="text-[#E8F0E6] text-sm font-medium">{description}</p>
          {filter !== 'all' && (
            <Link href="/admin/customers" className="inline-flex text-sm font-semibold text-[#B8E8C8] hover:text-white underline underline-offset-2 mt-2">
              ← 전체 고객으로 돌아가기
            </Link>
          )}
        </header>

        <AdminNav active="customers" />

        <StoreFilterBar value={storeId} onChange={setStoreId} />

        {!isTierMenu && (
          <div className="flex flex-wrap gap-2">
            {([
              { label: '수신동의 전체', value: null },
              { label: '수신동의', value: true },
              { label: '수신미동의', value: false },
            ] as const).map((opt) => (
              <button
                key={String(opt.value)}
                type="button"
                onClick={() => setMarketingConsent(opt.value)}
                className={`min-h-[44px] inline-flex items-center px-4 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                  marketingConsent === opt.value
                    ? 'bg-[#2D5A3D] text-white'
                    : 'bg-white text-[#2D5A3D] border-2 border-[#D4D0C8] hover:bg-[#F5F5EC]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        )}

        {!isTierMenu && (
          <div className="flex flex-wrap gap-2.5">
            <Link
              href="/admin/customers?filter=tier"
              className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 inline-flex items-center gap-1 ${
                filter === 'tier'
                  ? 'bg-[#2D5A3D] text-white shadow-md'
                  : 'bg-white text-[#2D5A3D] border border-[#E8E4DA] hover:bg-[#F5F5EC] hover:border-[#D4D0C8]'
              }`}
            >
              📊 등급
            </Link>
            <Link
              href="/admin/customers?filter=birthdayThisMonth"
              className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 inline-flex items-center gap-1 ${
                filter === 'birthdayThisMonth'
                  ? 'bg-[#2D5A3D] text-white shadow-md'
                  : 'bg-white text-[#2D5A3D] border border-[#E8E4DA] hover:bg-[#F5F5EC] hover:border-[#D4D0C8]'
              }`}
            >
              🎂 이번달 생일
            </Link>
            <Link
              href="/admin/customers?filter=visitedStore"
              className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 inline-flex items-center gap-1 ${
                filter === 'visitedStore'
                  ? 'bg-[#2D5A3D] text-white shadow-md'
                  : 'bg-white text-[#2D5A3D] border border-[#E8E4DA] hover:bg-[#F5F5EC] hover:border-[#D4D0C8]'
              }`}
            >
              🏪 매장별 방문자
            </Link>
            <Link
              href="/admin/customers?filter=missingBirthDate"
              className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 inline-flex items-center gap-1 ${
                filter === 'missingBirthDate'
                  ? 'bg-[#2D5A3D] text-white shadow-md'
                  : 'bg-white text-[#2D5A3D] border border-[#E8E4DA] hover:bg-[#F5F5EC] hover:border-[#D4D0C8]'
              }`}
            >
              🎈 생일 미입력
            </Link>
          </div>
        )}

        {filter === 'longAbsent' && (
          <div className="flex flex-wrap gap-2.5">
            {LONG_ABSENT_DAY_OPTIONS.map((days) => (
              <Link
                key={days}
                href={`/admin/customers?filter=longAbsent&days=${days}`}
                className={`px-5 py-3 rounded-xl text-sm font-semibold transition-all duration-200 ${
                  longAbsentDays === days
                    ? 'bg-[#2D5A3D] text-white shadow-md'
                    : 'bg-white text-[#2D5A3D] border border-[#E8E4DA] hover:bg-[#F5F5EC] hover:border-[#D4D0C8]'
                }`}
              >
                {days}일 이상
              </Link>
            ))}
          </div>
        )}

        {!isTierMenu && (
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="이름 · 전화번호로 검색..."
            className="w-full px-5 py-3.5 text-[16px] border-2 border-[#E8E4DA] rounded-xl
                       bg-white placeholder-[#A8A89C]
                       focus:border-[#2D5A3D] focus:ring-2 focus:ring-[#2D5A3D] focus:ring-opacity-20 focus:outline-none transition-all duration-200 shadow-sm"
          />
        )}

        {error && (
          <div className="bg-[#FFF8F0] border-2 border-[#F0D4B8] text-[#996633] px-5 py-4 rounded-xl text-[15px] font-medium shadow-sm">
            ⚠️ {error}
          </div>
        )}

        {isTierMenu ? (
          !tierBreakdown ? (
            <div className="space-y-2">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 rounded-xl bg-[#E8E8E0] animate-pulse" />
              ))}
            </div>
          ) : (
            <ul className="space-y-2">
              {tierBreakdown.map((t) => (
                <li key={t.key}>
                  <Link
                    href={`/admin/customers?filter=tier&tierKey=${t.key}`}
                    className="flex items-center justify-between bg-white rounded-xl px-5 py-4
                               border border-[#E8E4DA] hover:bg-[#F5F5EC] transition-colors duration-200"
                  >
                    <span className="text-base font-semibold text-[#2D5A3D]">{t.label}</span>
                    <span className="text-lg font-bold text-[#2D5A3D]">{t.count}명</span>
                  </Link>
                </li>
              ))}
            </ul>
          )
        ) : (
          <>
            <div className="flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => customers && customers.length > 0 && exportCustomersCsv(customers, filter === 'vip')}
                disabled={!customers || customers.length === 0}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-white text-[#2D5A3D] border border-[#E8E4DA]
                           hover:bg-[#F5F5EC] transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:shadow-sm"
              >
                📊 엑셀 저장
              </button>
              <button
                type="button"
                onClick={() => setShowSmsModal(true)}
                disabled={selectedIds.size === 0}
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-[#2D5A3D] text-white
                           hover:bg-[#245032] hover:shadow-md transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                💬 문자 ({selectedIds.size})
              </button>
              <button
                type="button"
                disabled
                title="추후 지원 예정입니다."
                className="px-5 py-3 rounded-xl text-sm font-semibold bg-white text-[#999] border border-[#E8E4DA]
                           opacity-50 cursor-not-allowed"
              >
                💭 톡
              </button>
            </div>

            {!customers ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 rounded-xl bg-[#E8E8E0] animate-pulse" />
                ))}
              </div>
            ) : customers.length === 0 ? (
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
                <p className="text-[15px] text-[#6B6B5E]">
                  {filter === 'visitedStore' && !storeId
                    ? '위에서 매장을 선택해 주세요.'
                    : '검색 결과가 없습니다.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-[#E8E4DA]">
                <table className="w-full text-sm min-w-[1020px]">
                  <thead>
                    <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#6B6B5E]">
                      <th className="px-4 py-3 font-medium w-10">
                        <input
                          type="checkbox"
                          checked={selectedIds.size === customers.length}
                          onChange={toggleSelectAll}
                          className="w-4 h-4 accent-[#2D5A3D]"
                          aria-label="전체 선택"
                        />
                      </th>
                      <th className="px-4 py-3 font-medium">성함</th>
                      <th className="px-4 py-3 font-medium">여권번호</th>
                      <th className="px-4 py-3 font-medium">연락처</th>
                      <th className="px-4 py-3 font-medium">가입매장</th>
                      <th className="px-4 py-3 font-medium text-right">방문 횟수</th>
                      <th className="px-4 py-3 font-medium">등급</th>
                      <th className="px-4 py-3 font-medium">가입일</th>
                      <th className="px-4 py-3 font-medium">최근 방문일</th>
                      <th className="px-4 py-3 font-medium">수신동의</th>
                      {filter === 'vip' && (
                        <>
                          <th className="px-4 py-3 font-medium">VIP 달성일</th>
                          <th className="px-4 py-3 font-medium">감사 할인권</th>
                          <th className="px-4 py-3 font-medium">관리자 메모</th>
                        </>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {customers.map((c) => {
                      const storeColor = getStoreAdminColor(c.signupStoreName);
                      return (
                        <tr
                          key={c.id}
                          onClick={() => router.push(`/admin/customers/${c.id}`)}
                          className="border-b border-[#F0EDE6] last:border-0 cursor-pointer border-l-4
                                     hover:bg-[#F5F5EC] transition-colors duration-200"
                          style={{ borderLeftColor: storeColor.border }}
                        >
                          <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedIds.has(c.id)}
                              onChange={() => toggleSelect(c.id)}
                              className="w-4 h-4 accent-[#2D5A3D]"
                              aria-label={`${c.name} 선택`}
                            />
                          </td>
                          <td className="px-4 py-3 font-bold text-[#2D5A3D] whitespace-nowrap">{c.name}</td>
                          <td className="px-4 py-3 text-[#555] whitespace-nowrap">{c.customerNumber}</td>
                          <td className="px-4 py-3 font-bold text-[#232320] whitespace-nowrap">{maskPhone(c.phone)}</td>
                          <td className="px-4 py-3 font-semibold whitespace-nowrap" style={{ color: storeColor.text }}>
                            {c.signupStoreName}
                          </td>
                          <td className="px-4 py-3 text-right text-[#555] whitespace-nowrap">{c.visitCount}회</td>
                          <td className="px-4 py-3 text-[#555] whitespace-nowrap">
                            {getVisitTierInfo(c.visitCount).label}
                          </td>
                          <td className="px-4 py-3 text-[#6B6B5E] whitespace-nowrap">{formatDateKR(c.createdAt)}</td>
                          <td className="px-4 py-3 text-[#6B6B5E] whitespace-nowrap">
                            {c.recentVisitDate ? formatDateKR(c.recentVisitDate) : '-'}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            {c.marketingConsent ? (
                              <span className="text-xs font-semibold text-[#2D5A3D]">동의</span>
                            ) : (
                              <span className="text-xs text-[#6B6B5E]">미동의</span>
                            )}
                          </td>
                          {filter === 'vip' && (
                            <>
                              <td className="px-4 py-3 whitespace-nowrap text-[#333]">
                                {c.vipAchievedAt ? formatDateKR(c.vipAchievedAt) : '-'}
                              </td>
                              <td className="px-4 py-3 whitespace-nowrap">
                                {c.giftUsed ? (
                                  <span className="text-xs text-[#6B6B5E] font-semibold">사용 완료</span>
                                ) : (
                                  <span className="text-xs text-[#8A5800] font-semibold">미사용</span>
                                )}
                              </td>
                              <td className="px-4 py-3 min-w-[220px]">
                                <AdminNoteCell customerId={c.id} note={c.adminNote} onSaved={() => fetchCustomers(query)} />
                              </td>
                            </>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {showSmsModal && customers && (
        <SmsComposeModal
          customerIds={[...selectedIds]}
          consentedCount={customers.filter((c) => selectedIds.has(c.id) && c.marketingConsent).length}
          onClose={() => setShowSmsModal(false)}
        />
      )}
    </main>
  );
}
