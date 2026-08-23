'use client';

import Link from 'next/link';
import { adminLogout } from '@/app/admin/actions';

interface AdminNavProps {
  active: 'dashboard' | 'customers' | 'visits' | 'rewards' | 'vip' | 'settings';
}

const TABS: { key: AdminNavProps['active']; href: string; label: string; icon: string }[] = [
  { key: 'dashboard', href: '/admin', label: '대시보드', icon: '📊' },
  { key: 'customers', href: '/admin/customers', label: '고객관리', icon: '👥' },
  { key: 'visits', href: '/admin/visits', label: '방문관리', icon: '📍' },
  { key: 'rewards', href: '/admin/rewards', label: '할인권관리', icon: '🎁' },
  { key: 'vip', href: '/admin/vip', label: 'VIP관리', icon: '⭐' },
  { key: 'settings', href: '/admin/settings', label: '설정', icon: '⚙️' },
];

export default function AdminNav({ active }: AdminNavProps) {
  async function handleLogout() {
    await adminLogout();
    window.location.href = '/admin/login';
  }

  return (
    <nav className="flex flex-wrap items-center justify-between gap-y-3 border-b border-[#E8E4DA] pb-5">
      <div className="flex flex-wrap gap-2.5">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`inline-flex items-center gap-2 px-5 py-3 rounded-xl font-semibold text-base transition-all duration-200 ${
              active === tab.key
                ? 'bg-[#2D5A3D] text-white shadow-md hover:shadow-lg hover:scale-105'
                : 'bg-white text-[#2D5A3D] border border-[#E8E4DA] hover:bg-[#F5F5EC] hover:border-[#D4D0C8] hover:shadow-sm'
            }`}
          >
            <span className="text-lg">{tab.icon}</span>
            <span>{tab.label}</span>
          </Link>
        ))}
      </div>
      <button
        onClick={handleLogout}
        className="px-4 py-2.5 text-sm font-semibold text-[#D4442A] bg-[#FFF8F0] border border-[#F0D4B8] rounded-lg hover:bg-[#FFF0E0] transition-colors duration-200"
      >
        로그아웃
      </button>
    </nav>
  );
}
