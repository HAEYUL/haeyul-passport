'use client';

import { useState, useEffect, useCallback } from 'react';
import { getStores, updateStoreLocation } from '@/app/admin/actions';
import type { Store } from '@/types/database';

interface EditForm {
  latitude: string;
  longitude: string;
  radiusMeters: string;
}

/**
 * 매장별 위치 좌표(위도/경도)와 방문 등록 허용 반경을 관리합니다.
 * QR 부정 스캔 방지(위치 확인) 기능에서 사용하는 기준값입니다.
 */
export default function StoreLocationSettings() {
  const [stores, setStores] = useState<Store[] | null>(null);
  const [selectedStoreId, setSelectedStoreId] = useState('');
  const [error, setError] = useState('');
  const [editForm, setEditForm] = useState<EditForm | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const fetchStores = useCallback(async () => {
    const result = await getStores();
    if (result.success && result.data && result.data.length > 0) {
      setStores(result.data);
      setSelectedStoreId((prev) => prev || result.data![0].id);
    } else if (!result.success) {
      setError(result.error || '매장 목록을 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchStores();
  }, [fetchStores]);

  const selectedStore = stores?.find((s) => s.id === selectedStoreId) || null;

  // selectedStoreId가 바뀔 때(매장 탭 전환)만 폼을 다시 채웁니다. 저장 후 목록을
  // 새로고침해도 selectedStoreId 자체는 그대로이므로 방금 뜬 저장 완료 메시지가
  // 곧바로 지워지지 않습니다.
  useEffect(() => {
    if (!selectedStore) return;
    setEditForm({
      latitude: selectedStore.latitude != null ? String(selectedStore.latitude) : '',
      longitude: selectedStore.longitude != null ? String(selectedStore.longitude) : '',
      radiusMeters: String(selectedStore.radius_meters),
    });
    setSaveError('');
    setSuccessMessage('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStoreId]);

  async function handleSave() {
    if (!selectedStore || !editForm) return;

    const latitude = Number(editForm.latitude);
    const longitude = Number(editForm.longitude);
    const radiusMeters = Number(editForm.radiusMeters);

    if (!editForm.latitude.trim() || !editForm.longitude.trim()) {
      setSaveError('위도와 경도를 모두 입력해 주세요.');
      return;
    }

    setSaving(true);
    setSaveError('');
    setSuccessMessage('');

    const result = await updateStoreLocation(selectedStore.id, { latitude, longitude, radiusMeters });

    setSaving(false);

    if (result.success) {
      setSuccessMessage('매장 위치가 저장되었습니다.');
      fetchStores();
    } else {
      setSaveError(result.error || '저장 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="space-y-4">
      {stores && stores.length > 1 && (
        <div className="flex flex-wrap gap-2">
          {stores.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelectedStoreId(s.id)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold transition-colors duration-200 ${
                selectedStoreId === s.id
                  ? 'bg-[#2D5A3D] text-white'
                  : 'bg-white text-[#2D5A3D] border-2 border-[#D4D0C8] hover:bg-[#F5F5EC]'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      <p className="text-sm text-[#8C8C80]">
        고객이 QR을 스캔해 방문을 등록할 때, 이 좌표를 기준으로 허용 반경 이내에 있는지 확인합니다.
        위치 정보를 가져오지 못한 경우(권한 거부·미지원)에는 등록을 막지 않습니다.
      </p>

      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-[#F0F7F2] border border-[#C4DCC9] text-[#2D5A3D] px-4 py-3 rounded-xl text-[15px]">
          {successMessage}
        </div>
      )}

      {!editForm ? (
        <div className="h-64 rounded-2xl bg-[#E8E8E0] animate-pulse" />
      ) : (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] space-y-4">
          <div>
            <label className="block text-sm font-medium text-[#555] mb-1">위도 (latitude)</label>
            <input
              type="text"
              inputMode="decimal"
              value={editForm.latitude}
              onChange={(e) => setEditForm({ ...editForm, latitude: e.target.value })}
              placeholder="예: 37.3498089"
              className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#555] mb-1">경도 (longitude)</label>
            <input
              type="text"
              inputMode="decimal"
              value={editForm.longitude}
              onChange={(e) => setEditForm({ ...editForm, longitude: e.target.value })}
              placeholder="예: 127.0857600"
              className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#555] mb-1">허용 반경 (m)</label>
            <input
              type="number"
              min={1}
              value={editForm.radiusMeters}
              onChange={(e) => setEditForm({ ...editForm, radiusMeters: e.target.value })}
              className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
            />
            <p className="mt-1 text-xs text-[#AAA]">이 반경(미터) 밖에서는 방문 등록이 거부됩니다.</p>
          </div>

          {saveError && <p className="text-sm text-[#D4442A]">{saveError}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="w-full py-3 px-4 bg-[#2D5A3D] text-white text-base font-semibold rounded-xl
                       shadow-sm hover:bg-[#245032] transition-colors duration-200
                       disabled:bg-[#999] disabled:cursor-not-allowed"
          >
            {saving ? '저장 중...' : '저장'}
          </button>
        </div>
      )}
    </div>
  );
}
