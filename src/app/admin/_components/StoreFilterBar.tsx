'use client';

import { useState, useEffect, useCallback } from 'react';
import { getStores } from '@/app/admin/actions';
import { getStoreAdminColor } from '@/lib/storeColors';
import type { Store } from '@/types/database';

interface StoreFilterBarProps {
  value: string | null;
  onChange: (storeId: string | null) => void;
}

/**
 * 관리자 화면 공용 매장 필터. null이면 "전체"입니다.
 */
export default function StoreFilterBar({ value, onChange }: StoreFilterBarProps) {
  const [stores, setStores] = useState<Store[] | null>(null);

  const fetchStores = useCallback(async () => {
    const result = await getStores();
    if (result.success && result.data) {
      setStores(result.data);
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  if (!stores || stores.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onChange(null)}
        className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
          value === null
            ? 'bg-[#2D5A3D] text-white'
            : 'bg-white text-[#2D5A3D] border-2 border-[#D4D0C8] hover:bg-[#F5F5EC]'
        }`}
      >
        전체
      </button>
      {stores.map((s) => {
        const color = getStoreAdminColor(s.name);
        const selected = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            aria-pressed={selected}
            className="min-h-[40px] px-4 py-2 rounded-xl text-sm font-semibold border-2 transition-colors duration-200"
            style={
              selected
                ? { backgroundColor: color.border, borderColor: color.border, color: '#FFFFFF' }
                : { backgroundColor: '#FFFFFF', borderColor: color.border, color: color.text }
            }
          >
            {s.name}
          </button>
        );
      })}
    </div>
  );
}
