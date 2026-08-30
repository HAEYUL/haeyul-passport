'use client';

import { useState } from 'react';
import AdminNav from '../../_components/AdminNav';
import QrManagement from './QrManagement';
import StatsOverview from './StatsOverview';
import StoreLocationSettings from './StoreLocationSettings';
import AdminAccountSettings from './AdminAccountSettings';
import AuditLogView from './AuditLogView';

type Section = 'qr' | 'location' | 'stats' | 'account' | 'audit';

const SECTIONS: { key: Section; label: string }[] = [
  { key: 'qr', label: 'QR 관리' },
  { key: 'location', label: '매장 위치' },
  { key: 'stats', label: '통계' },
  { key: 'account', label: '계정' },
  { key: 'audit', label: '활동이력' },
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

export default function AdminSettings() {
  const [section, setSection] = useState<Section>('qr');

  return (
    <main className="flex flex-col min-h-screen px-6 py-8">
      <div className="w-full max-w-5xl mx-auto space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-[#2D5A3D]">설정</h1>
          <p className="text-sm text-[#6B6B5E]">매장 및 관리자 관련 설정을 관리하는 화면입니다.</p>
        </header>

        <AdminNav active="settings" />

        <div className="flex flex-wrap gap-2">
          {SECTIONS.map((s) => (
            <TabButton key={s.key} label={s.label} active={section === s.key} onClick={() => setSection(s.key)} />
          ))}
        </div>

        {section === 'qr' && (
          <div className="max-w-2xl">
            <QrManagement />
          </div>
        )}
        {section === 'location' && (
          <div className="max-w-2xl">
            <StoreLocationSettings />
          </div>
        )}
        {section === 'stats' && <StatsOverview />}
        {section === 'account' && <AdminAccountSettings />}
        {section === 'audit' && <AuditLogView />}
      </div>
    </main>
  );
}
