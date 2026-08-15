'use client';

import Link from 'next/link';
import { adminLogout } from '@/app/admin/actions';

interface AdminNavProps {
  active: 'dashboard' | 'customers' | 'visits' | 'rewards' | 'vip' | 'settings';
}

const TABS: { key: AdminNavProps['active']; href: string; label: string }[] = [
  { key: 'dashboard', href: '/admin', label: '대시보드' },
  { key: 'customers', href: '/admin/customers', label: '고객관리' },
  { key: 'visits', href: '/admin/visits', label: '방문관리' },
  { key: 'rewards', href: '/admin/rewards', label: '선물관리' },
  { key: 'vip', href: '/admin/vip', label: 'VIP관리' },
  { key: 'settings', href: '/admin/settings', label: '설정' },
];

export default function AdminNav({ active }: AdminNavProps) {
  async function handleLogout() {
    await adminLogout();
    window.location.href = '/admin/login';
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-y-3 border-b border-[#E8E4DA] pb-4">
      <div className="flex flex-wrap gap-2">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`min-h-[44px] inline-flex items-center px-4 py-2.5 rounded-xl text-base font-semibold transition-colors duration-200 ${
              active === tab.key
                ? 'bg-[#2D5A3D] text-white'
                : 'bg-white text-[#2D5A3D] border-2 border-[#D4D0C8] hover:bg-[#F5F5EC]'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </div>
      <button onClick={handleLogout} className="text-sm text-[#6B6B5E] underline">
        로그아웃
      </button>
    </nav>
  );
}
