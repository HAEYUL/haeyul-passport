'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  getCustomerDetail,
  updateCustomer,
  deleteCustomer,
  type CustomerDetail as CustomerDetailData,
} from '@/app/admin/actions';
import { formatDateKR } from '@/lib/utils';
import { getVisitTierInfo } from '@/lib/tiers';

interface CustomerDetailProps {
  customerId: string;
}

function RewardStatusBadge({ status }: { status: string }) {
  if (status === 'available') {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#FFFDF0] text-[#B8860B] border border-[#E8D88C]">
        사용 가능
      </span>
    );
  }
  if (status === 'requested') {
    return (
      <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F0F7F2] text-[#2D5A3D] border border-[#C4DCC9]">
        확인 요청 중
      </span>
    );
  }
  return (
    <span className="px-2.5 py-1 rounded-full text-xs font-semibold bg-[#F5F5EC] text-[#8C8C80] border border-[#E0E0D0]">
      사용 완료
    </span>
  );
}

interface EditForm {
  name: string;
  phone: string;
  birthDate: string;
  marketingConsent: boolean;
  visitCount: string;
}

export default function CustomerDetail({ customerId }: CustomerDetailProps) {
  const router = useRouter();
  const [data, setData] = useState<CustomerDetailData | null>(null);
  const [error, setError] = useState('');

  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const fetchDetail = useCallback(async () => {
    const result = await getCustomerDetail(customerId);
    if (result.success && result.data) {
      setData(result.data);
    } else if (!result.success) {
      setError(result.error || '고객 정보를 불러올 수 없습니다.');
    }
  }, [customerId]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  function startEdit() {
    if (!data) return;
    setEditForm({
      name: data.customer.name,
      phone: data.customer.phone,
      birthDate: data.customer.birth_date || '',
      marketingConsent: data.customer.marketing_consent,
      visitCount: String(data.customer.visit_count),
    });
    setSaveError('');
    setEditMode(true);
  }

  async function handleSave() {
    if (!editForm) return;

    const visitCount = Number(editForm.visitCount);
    if (!Number.isInteger(visitCount) || visitCount < 0) {
      setSaveError('방문 횟수는 0 이상의 정수여야 합니다.');
      return;
    }

    setSaving(true);
    setSaveError('');

    const result = await updateCustomer(customerId, {
      name: editForm.name,
      phone: editForm.phone,
      birthDate: editForm.birthDate || null,
      marketingConsent: editForm.marketingConsent,
      visitCount,
    });

    setSaving(false);

    if (result.success) {
      setEditMode(false);
      fetchDetail();
    } else {
      setSaveError(result.error || '수정 중 오류가 발생했습니다.');
    }
  }

  async function handleDelete() {
    setDeleting(true);
    setDeleteError('');

    const result = await deleteCustomer(customerId);

    setDeleting(false);

    if (result.success) {
      router.push('/admin/customers');
    } else {
      setDeleteError(result.error || '삭제 중 오류가 발생했습니다.');
    }
  }

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <Link href="/admin/customers" className="flex items-center text-[#2D5A3D] text-base font-medium w-fit">
          <svg className="w-5 h-5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
          고객관리로 돌아가기
        </Link>

        {error && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        {!data ? (
          <div className="space-y-3">
            <div className="h-32 rounded-2xl bg-[#E8E8E0] animate-pulse" />
            <div className="h-48 rounded-2xl bg-[#E8E8E0] animate-pulse" />
          </div>
        ) : (
          <>
            {/* 고객 정보 */}
            <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] space-y-3">
              <div className="flex items-center justify-between">
                <h1 className="text-xl font-bold text-[#2D5A3D]">{data.customer.name} 고객님</h1>
                <span className="text-sm text-[#AAA]">{data.customer.customer_number}</span>
              </div>

              {editMode && editForm ? (
                <div className="border-t border-[#F0EDE6] pt-3 space-y-4">
                  <div>
                    <label className="block text-sm text-[#8C8C80] mb-1">성함</label>
                    <input
                      type="text"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      className="w-full px-3 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                                 focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#8C8C80] mb-1">전화번호</label>
                    <input
                      type="tel"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                      className="w-full px-3 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                                 focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#8C8C80] mb-1">생년월일</label>
                    <input
                      type="date"
                      value={editForm.birthDate}
                      onChange={(e) => setEditForm({ ...editForm, birthDate: e.target.value })}
                      className="w-full px-3 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                                 focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
                    />
                  </div>
                  <div>
                    <label className="block text-sm text-[#8C8C80] mb-1">
                      총 방문 횟수
                    </label>
                    <input
                      type="number"
                      min={0}
                      value={editForm.visitCount}
                      onChange={(e) => setEditForm({ ...editForm, visitCount: e.target.value })}
                      className="w-full px-3 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl
                                 focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
                    />
                    <p className="mt-1 text-xs text-[#AAA]">
                      변경하면 등급과 방문 선물이 자동으로 다시 계산됩니다.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="edit-marketing"
                      type="checkbox"
                      checked={editForm.marketingConsent}
                      onChange={(e) => setEditForm({ ...editForm, marketingConsent: e.target.checked })}
                      className="w-5 h-5 accent-[#2D5A3D] cursor-pointer"
                    />
                    <label htmlFor="edit-marketing" className="text-[15px] text-[#333] cursor-pointer">
                      마케팅 수신 동의
                    </label>
                  </div>

                  {saveError && (
                    <p className="text-sm text-[#D4442A]">{saveError}</p>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => setEditMode(false)}
                      disabled={saving}
                      className="flex-1 py-3 px-4 bg-white text-[#8C8C80] text-base font-medium rounded-xl
                                 border border-[#D4D0C8] hover:bg-[#F5F5EC] transition-colors duration-200
                                 disabled:cursor-not-allowed"
                    >
                      취소
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex-1 py-3 px-4 bg-[#2D5A3D] text-white text-base font-semibold rounded-xl
                                 hover:bg-[#245032] transition-colors duration-200
                                 disabled:bg-[#999] disabled:cursor-not-allowed"
                    >
                      {saving ? '저장 중...' : '저장'}
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="border-t border-[#F0EDE6] pt-3 space-y-2 text-[15px]">
                    <div className="flex justify-between">
                      <span className="text-[#8C8C80]">전화번호</span>
                      <span className="text-[#333]">{data.customer.phone}</span>
                    </div>
                    {data.customer.birth_date && (
                      <div className="flex justify-between">
                        <span className="text-[#8C8C80]">생년월일</span>
                        <span className="text-[#333]">{formatDateKR(data.customer.birth_date)}</span>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <span className="text-[#8C8C80]">현재 등급</span>
                      <span className="font-semibold text-[#2D5A3D]">
                        {getVisitTierInfo(data.customer.visit_count).label}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8C8C80]">총 방문 횟수</span>
                      <span className="font-semibold text-[#2D5A3D]">{data.customer.visit_count}회</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8C8C80]">가입 매장</span>
                      <span className="text-[#333]">{data.signupStoreName || '-'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8C8C80]">가입일</span>
                      <span className="text-[#333]">{formatDateKR(data.customer.created_at)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-[#8C8C80]">마케팅 수신 동의</span>
                      <span className="text-[#333]">{data.customer.marketing_consent ? '동의' : '미동의'}</span>
                    </div>
                  </div>

                  {data.storeVisitBreakdown.length > 0 && (
                    <div className="grid gap-2 pt-3 border-t border-[#F0EDE6]" style={{ gridTemplateColumns: `repeat(${data.storeVisitBreakdown.length}, minmax(0, 1fr))` }}>
                      {data.storeVisitBreakdown.map((s) => (
                        <div key={s.storeId} className="bg-[#F5F5EC] rounded-xl px-3 py-2 text-center">
                          <p className="text-xs text-[#8C8C80]">{s.storeName}</p>
                          <p className="mt-0.5 text-lg font-bold text-[#2D5A3D]">{s.count}회</p>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex gap-2 pt-3 border-t border-[#F0EDE6]">
                    <button
                      onClick={startEdit}
                      className="flex-1 py-3 px-4 bg-white text-[#2D5A3D] text-base font-semibold rounded-xl
                                 border-2 border-[#D4D0C8] hover:bg-[#F5F5EC] transition-colors duration-200"
                    >
                      수정
                    </button>
                    <button
                      onClick={() => {
                        setDeleteError('');
                        setDeleteConfirm(true);
                      }}
                      className="flex-1 py-3 px-4 bg-white text-[#D4442A] text-base font-semibold rounded-xl
                                 border-2 border-[#F0C4B8] hover:bg-[#FFF5F0] transition-colors duration-200"
                    >
                      삭제
                    </button>
                  </div>

                  {deleteConfirm && (
                    <div className="bg-[#FFF5F0] border border-[#F0C4B8] rounded-xl p-4 space-y-3">
                      <p className="text-[15px] text-[#996633] leading-relaxed">
                        정말 삭제하시겠습니까?<br />
                        방문기록·선물·동의기록이 모두 함께 삭제되며 되돌릴 수 없습니다.
                      </p>
                      {deleteError && <p className="text-sm text-[#D4442A]">{deleteError}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={() => setDeleteConfirm(false)}
                          disabled={deleting}
                          className="flex-1 py-2.5 px-4 bg-white text-[#8C8C80] text-sm font-medium rounded-xl
                                     border border-[#D4D0C8] hover:bg-[#F5F5EC] transition-colors duration-200
                                     disabled:cursor-not-allowed"
                        >
                          취소
                        </button>
                        <button
                          onClick={handleDelete}
                          disabled={deleting}
                          className="flex-1 py-2.5 px-4 bg-[#D4442A] text-white text-sm font-semibold rounded-xl
                                     hover:bg-[#B8371F] transition-colors duration-200
                                     disabled:bg-[#999] disabled:cursor-not-allowed"
                        >
                          {deleting ? '삭제 중...' : '삭제 확인'}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>

            {/* 선물함 */}
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-[#555]">선물함</h2>
              {data.rewards.length === 0 ? (
                <p className="text-[15px] text-[#AAA] py-2">아직 받은 선물이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {data.rewards.map((r) => (
                    <li
                      key={r.id}
                      className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-[#F0EDE6]"
                    >
                      <div>
                        <p className="text-[15px] font-medium text-[#333]">
                          {r.amount.toLocaleString()}원 할인권 <span className="text-xs text-[#AAA]">({r.thresholdVisits}회)</span>
                        </p>
                        <p className="text-xs text-[#AAA]">
                          발급일: {formatDateKR(r.issuedAt)} · {r.issuedStoreName}
                        </p>
                        {r.status === 'used' && r.usedAt && (
                          <p className="text-xs text-[#AAA]">
                            사용일: {formatDateKR(r.usedAt)}
                            {r.usedStoreName && ` · ${r.usedStoreName}`}
                          </p>
                        )}
                      </div>
                      <RewardStatusBadge status={r.status} />
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* 방문 기록 */}
            <div className="space-y-2">
              <h2 className="text-base font-semibold text-[#555]">방문기록 ({data.visits.length}회)</h2>
              {data.visits.length === 0 ? (
                <p className="text-[15px] text-[#AAA] py-2">방문 기록이 없습니다.</p>
              ) : (
                <ul className="space-y-2">
                  {data.visits.map((v, i) => (
                    <li
                      key={`${v.visitDate}-${i}`}
                      className="flex items-center justify-between bg-white rounded-xl px-4 py-3 border border-[#F0EDE6]"
                    >
                      <span className="text-[15px] text-[#333]">{formatDateKR(v.visitDate)}</span>
                      <span className="text-xs text-[#8C8C80]">{v.storeName}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </>
        )}

        <div className="pb-8" />
      </div>
    </main>
  );
}
