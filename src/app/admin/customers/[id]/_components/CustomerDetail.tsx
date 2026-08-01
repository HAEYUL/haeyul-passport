'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getCustomerDetail, type CustomerDetail as CustomerDetailData } from '@/app/admin/actions';
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

export default function CustomerDetail({ customerId }: CustomerDetailProps) {
  const [data, setData] = useState<CustomerDetailData | null>(null);
  const [error, setError] = useState('');

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
                  <span className="text-[#8C8C80]">가입일</span>
                  <span className="text-[#333]">{formatDateKR(data.customer.created_at)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-[#8C8C80]">마케팅 수신 동의</span>
                  <span className="text-[#333]">{data.customer.marketing_consent ? '동의' : '미동의'}</span>
                </div>
              </div>
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
                        <p className="text-[15px] font-medium text-[#333]">{r.rewardName}</p>
                        <p className="text-xs text-[#AAA]">발급일: {formatDateKR(r.issuedAt)}</p>
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
