'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { getCustomerList, type CustomerListItem } from '@/app/admin/actions';
import { formatDateKR } from '@/lib/utils';
import AdminNav from '../../_components/AdminNav';

export default function CustomerList() {
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState<CustomerListItem[] | null>(null);
  const [error, setError] = useState('');

  const fetchCustomers = useCallback(async (q: string) => {
    const result = await getCustomerList(q);
    if (result.success && result.data) {
      setCustomers(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '고객 목록을 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchCustomers('');
  }, [fetchCustomers]);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchCustomers(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, fetchCustomers]);

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-2xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">고객관리</h1>
          <p className="text-sm text-[#8C8C80]">이름, 전화번호, 회원번호로 검색할 수 있습니다.</p>
        </header>

        <AdminNav active="customers" />

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="이름 / 전화번호 / 회원번호 검색"
          className="w-full px-4 py-3.5 text-[17px] border-2 border-[#D4D0C8] rounded-xl
                     bg-white placeholder-[#B0B0A0]
                     focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
        />

        {error && (
          <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        {!customers ? (
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-16 rounded-xl bg-[#E8E8E0] animate-pulse" />
            ))}
          </div>
        ) : customers.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
            <p className="text-[15px] text-[#8C8C80]">검색 결과가 없습니다.</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {customers.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/admin/customers/${c.id}`}
                  className="flex items-center justify-between bg-white rounded-xl px-5 py-4
                             border border-[#E8E4DA] hover:bg-[#F5F5EC] transition-colors duration-200"
                >
                  <div>
                    <p className="text-base font-semibold text-[#2D5A3D]">{c.name}</p>
                    <p className="text-sm text-[#8C8C80]">
                      {c.customerNumber} · {c.phone}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-lg font-bold text-[#2D5A3D]">{c.visitCount}회</p>
                    <p className="text-xs text-[#AAA]">{formatDateKR(c.createdAt)} 가입</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </main>
  );
}
