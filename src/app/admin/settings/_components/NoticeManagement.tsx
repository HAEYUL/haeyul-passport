'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getNotices,
  createNotice,
  updateNotice,
  endNoticeNow,
  type NoticeAdminItem,
  type NoticeInput,
} from '@/app/admin/actions';
import type { NoticeKind } from '@/types/database';

function formatDateTimeKR(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function toDateInputValue(iso: string): string {
  // starts_at/ends_at은 KST 자정/23:59:59로 저장되므로 KST 기준 날짜만 뽑아냅니다.
  return new Date(iso).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

type NoticeStatus = 'scheduled' | 'ongoing' | 'ended' | 'stopped';

function getNoticeStatus(notice: NoticeAdminItem): NoticeStatus {
  if (!notice.isActive) return 'stopped';
  const now = new Date();
  if (now < new Date(notice.startsAt)) return 'scheduled';
  if (now > new Date(notice.endsAt)) return 'ended';
  return 'ongoing';
}

const STATUS_LABEL: Record<NoticeStatus, string> = {
  scheduled: '게시 예정',
  ongoing: '게시 중',
  ended: '기간 종료',
  stopped: '중단됨',
};

const STATUS_STYLE: Record<NoticeStatus, string> = {
  scheduled: 'bg-[#EEF4FB] text-[#2B4F78] border-[#B9D3EC]',
  ongoing: 'bg-[#F0F7F2] text-[#1F4A2E] border-[#8FC49F]',
  ended: 'bg-[#F0EFE9] text-[#6B6B5E] border-[#D4D0C8]',
  stopped: 'bg-[#FFF3E4] text-[#7A4A16] border-[#EAC28E]',
};

const EMPTY_FORM: NoticeInput = {
  kind: 'event',
  title: '',
  body: '',
  startDate: '',
  endDate: '',
};

/**
 * 고객 전자여권 홈 화면에 노출할 알림/이벤트를 작성·수정하고,
 * 지금까지 작성된 알림/이벤트 이력을 관리합니다.
 */
export default function NoticeManagement() {
  const [notices, setNotices] = useState<NoticeAdminItem[] | null>(null);
  const [error, setError] = useState('');
  const [form, setForm] = useState<NoticeInput>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [endingId, setEndingId] = useState<string | null>(null);

  const fetchNotices = useCallback(async () => {
    const result = await getNotices();
    if (result.success && result.data) {
      setNotices(result.data);
      setError('');
    } else if (!result.success) {
      setError(result.error || '알림/이벤트 목록을 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchNotices();
  }, [fetchNotices]);

  function startNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setSaveError('');
    setSuccessMessage('');
  }

  function startEdit(notice: NoticeAdminItem) {
    setEditingId(notice.id);
    setForm({
      kind: notice.kind,
      title: notice.title,
      body: notice.body,
      startDate: toDateInputValue(notice.startsAt),
      endDate: toDateInputValue(notice.endsAt),
    });
    setSaveError('');
    setSuccessMessage('');
  }

  async function handleSave() {
    setSaving(true);
    setSaveError('');
    setSuccessMessage('');

    const result = editingId ? await updateNotice(editingId, form) : await createNotice(form);

    setSaving(false);

    if (result.success) {
      setSuccessMessage(editingId ? '수정되었습니다.' : '등록되었습니다. 고객 화면에 곧 반영됩니다.');
      startNew();
      fetchNotices();
    } else {
      setSaveError(result.error || '저장 중 오류가 발생했습니다.');
    }
  }

  async function handleEndNow(noticeId: string) {
    setEndingId(noticeId);
    const result = await endNoticeNow(noticeId);
    setEndingId(null);

    if (result.success) {
      fetchNotices();
    } else {
      setError(result.error || '중단 처리 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-[#6B6B5E]">
        여기서 작성한 알림/이벤트는 게시 시작일부터 종료일까지, 해율만두전골·곤드레밥집·정담명가 남원추어탕
        3개 매장 고객 페이지에 동시에 노출됩니다. 한 번에 1건만 보여지며, 겹치는 기간이 있으면 가장 최근에
        작성한 글이 우선합니다. 게시기간이 지나면 자동으로 사라집니다.
      </p>

      {error && (
        <div className="bg-[#FFF8F0] border border-[#F0D4B8] text-[#996633] px-4 py-3 rounded-xl text-[15px]">
          {error}
        </div>
      )}

      {/* 작성/수정 폼 */}
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-bold text-[#2D5A3D]">
            {editingId ? '알림/이벤트 수정' : '새 알림/이벤트 작성'}
          </h3>
          {editingId && (
            <button type="button" onClick={startNew} className="text-sm font-semibold text-[#6B6B5E] underline">
              새로 작성하기
            </button>
          )}
        </div>

        <div>
          <label className="block text-sm font-medium text-[#555] mb-1.5">구분</label>
          <div className="flex gap-2">
            {(['event', 'notice'] as NoticeKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setForm({ ...form, kind: k })}
                className={`flex-1 py-2.5 px-4 rounded-xl text-sm font-bold border-2 transition-colors duration-200 ${
                  form.kind === k
                    ? k === 'event'
                      ? 'bg-[#FBF0F4] border-[#C15B82] text-[#7D2F51]'
                      : 'bg-[#EEF4FB] border-[#4E7DB5] text-[#2B4F78]'
                    : 'bg-white border-[#D4D0C8] text-[#6B6B5E]'
                }`}
              >
                {k === 'event' ? '이벤트' : '알림'}
              </button>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-[#555] mb-1">제목</label>
          <input
            type="text"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="예: 추석맞이 감사 이벤트"
            className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-[#555] mb-1">내용</label>
          <textarea
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            rows={6}
            placeholder="고객에게 보여줄 내용을 입력해 주세요. 줄바꿈은 그대로 표시됩니다."
            className="w-full px-4 py-3 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none resize-y"
          />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-[#555] mb-1">게시 시작일</label>
            <input
              type="date"
              value={form.startDate}
              onChange={(e) => setForm({ ...form, startDate: e.target.value })}
              className="w-full px-3 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-[#555] mb-1">게시 종료일</label>
            <input
              type="date"
              value={form.endDate}
              onChange={(e) => setForm({ ...form, endDate: e.target.value })}
              className="w-full px-3 py-2.5 text-[15px] border-2 border-[#D4D0C8] rounded-xl bg-white focus:border-[#2D5A3D] focus:outline-none"
            />
          </div>
        </div>

        {saveError && <p className="text-sm text-[#D4442A]">{saveError}</p>}
        {successMessage && <p className="text-sm text-[#2D5A3D] font-semibold">{successMessage}</p>}

        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="w-full py-3 px-4 bg-[#2D5A3D] text-white text-base font-semibold rounded-xl
                     shadow-sm hover:bg-[#245032] transition-colors duration-200
                     disabled:bg-[#999] disabled:cursor-not-allowed"
        >
          {saving ? '저장 중...' : editingId ? '수정 저장' : '등록하기'}
        </button>
      </div>

      {/* 작성 이력 */}
      <div className="space-y-3">
        <h3 className="text-base font-bold text-[#2D5A3D] px-1">작성 이력</h3>

        {!notices ? (
          <div className="space-y-2">
            {[1, 2].map((i) => (
              <div key={i} className="h-20 rounded-2xl bg-[#E8E8E0] animate-pulse" />
            ))}
          </div>
        ) : notices.length === 0 ? (
          <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
            <p className="text-[15px] text-[#6B6B5E]">아직 작성된 알림/이벤트가 없습니다.</p>
          </div>
        ) : (
          notices.map((notice) => {
            const status = getNoticeStatus(notice);
            const canEndNow = status === 'ongoing' || status === 'scheduled';
            return (
              <div key={notice.id} className="bg-white rounded-2xl p-4 shadow-sm border border-[#E8E4DA] space-y-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold text-white ${
                          notice.kind === 'event' ? 'bg-[#C15B82]' : 'bg-[#4E7DB5]'
                        }`}
                      >
                        {notice.kind === 'event' ? '이벤트' : '알림'}
                      </span>
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold border ${STATUS_STYLE[status]}`}>
                        {STATUS_LABEL[status]}
                      </span>
                    </div>
                    <p className="font-bold text-[#2C2C2C] truncate">{notice.title}</p>
                    <p className="text-xs text-[#8C8C80]">
                      {formatDateTimeKR(notice.startsAt)} ~ {formatDateTimeKR(notice.endsAt)}
                    </p>
                    <p className="text-xs text-[#8C8C80]">
                      작성: {notice.createdByUsername ?? '-'} · {formatDateTimeKR(notice.createdAt)}
                    </p>
                  </div>
                  <div className="flex flex-col gap-1.5 flex-shrink-0">
                    <button
                      type="button"
                      onClick={() => startEdit(notice)}
                      className="px-3 py-1.5 text-xs font-semibold text-[#2D5A3D] bg-white border border-[#D4D0C8] rounded-lg hover:bg-[#F5F5EC]"
                    >
                      수정
                    </button>
                    {canEndNow && (
                      <button
                        type="button"
                        onClick={() => handleEndNow(notice.id)}
                        disabled={endingId === notice.id}
                        className="px-3 py-1.5 text-xs font-semibold text-[#D4442A] bg-white border border-[#F0D4B8] rounded-lg hover:bg-[#FFF8F0] disabled:opacity-50"
                      >
                        {endingId === notice.id ? '처리 중...' : '지금 중단'}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
