'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  getManagerAccounts,
  createManagerAccount,
  resetManagerPassword,
  setManagerActive,
  type ManagerAccountItem,
} from '@/app/admin/actions';

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const INPUT_CLASS =
  'w-full px-4 py-2.5 rounded-xl border border-[#D4D0C8] text-base focus:border-[#2D5A3D] focus:outline-none';

/**
 * 매니저 계정 관리 — 예약관리 화면만 쓰는 공용 계정을 만들고, 비밀번호를 바꾸고, 사용을 중지합니다.
 * 매니저 계정은 다른 관리자 메뉴에 들어갈 수 없고, 문구 수정·엑셀 다운로드도 할 수 없습니다.
 */
export default function ManagerAccountSettings() {
  const [accounts, setAccounts] = useState<ManagerAccountItem[] | null>(null);
  const [loadError, setLoadError] = useState('');
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [resetTarget, setResetTarget] = useState<string | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const load = useCallback(() => {
    getManagerAccounts().then((result) => {
      if (result.success && result.data) {
        setAccounts(result.data);
        setLoadError('');
      } else {
        setAccounts([]);
        setLoadError(result.error || '매니저 계정을 불러오지 못했습니다.');
      }
    });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    const result = await createManagerAccount(newUsername, newPassword);
    setBusy(false);
    if (result.success) {
      setMessage({ ok: true, text: `매니저 계정 「${newUsername.trim()}」을 만들었습니다.` });
      setNewUsername('');
      setNewPassword('');
      load();
    } else {
      setMessage({ ok: false, text: result.error || '계정 생성 중 오류가 발생했습니다.' });
    }
  }

  async function handleReset(account: ManagerAccountItem) {
    setBusy(true);
    setMessage(null);
    const result = await resetManagerPassword(account.id, resetPassword);
    setBusy(false);
    if (result.success) {
      setMessage({ ok: true, text: `「${account.username}」 비밀번호를 바꿨습니다. 로그인되어 있던 기기는 모두 로그아웃됩니다.` });
      setResetTarget(null);
      setResetPassword('');
    } else {
      setMessage({ ok: false, text: result.error || '비밀번호 변경 중 오류가 발생했습니다.' });
    }
  }

  async function handleToggle(account: ManagerAccountItem) {
    const next = !account.isActive;
    if (!window.confirm(next ? `「${account.username}」 계정을 다시 사용할까요?` : `「${account.username}」 계정 사용을 중지할까요?\n중지하면 바로 로그인이 막힙니다.`)) {
      return;
    }
    setBusy(true);
    setMessage(null);
    const result = await setManagerActive(account.id, next);
    setBusy(false);
    setMessage(
      result.success
        ? { ok: true, text: next ? '계정을 다시 사용합니다.' : '계정 사용을 중지했습니다.' }
        : { ok: false, text: result.error || '처리 중 오류가 발생했습니다.' }
    );
    load();
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="space-y-1">
        <h2 className="text-lg font-bold text-[#2D5A3D]">매니저 계정 (예약관리 전용)</h2>
        <p className="text-sm text-[#6B6B5E] leading-relaxed">
          매니저 계정으로 로그인하면 <strong>예약관리 화면만</strong> 보입니다. 예약 입력·안내 문자 보내기·명단 보기·예약
          수정·취소를 할 수 있고, 문구 수정·엑셀 다운로드와 다른 관리자 메뉴는 쓸 수 없습니다. 로그인은 한 달 유지되며, 비밀번호를 바꾸면 로그인되어 있던 기기가 모두 로그아웃됩니다. 비밀번호를 5번 틀리면 15분간 로그인이 잠깁니다.
        </p>
      </div>

      {message && (
        <div
          className={`px-4 py-3 rounded-xl text-sm border ${
            message.ok ? 'bg-[#EAF3EC] border-[#B9D8C2] text-[#2D5A3D]' : 'bg-[#FFF3E4] border-[#EAC28E] text-[#7A4A16]'
          }`}
        >
          {message.text}
        </div>
      )}
      {loadError && <p className="text-sm font-semibold text-[#B3261E]">{loadError}</p>}

      <div className="bg-white rounded-2xl border border-[#E8E4DA] divide-y divide-[#F0EDE6]">
        {accounts === null ? (
          <p className="p-4 text-sm text-[#6B6B5E]">불러오는 중...</p>
        ) : accounts.length === 0 ? (
          <p className="p-4 text-sm text-[#6B6B5E]">아직 매니저 계정이 없습니다. 아래에서 만들어 주세요.</p>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="text-base font-bold text-[#333]">
                    {a.username}
                    <span
                      className={`ml-2 inline-block px-2 py-0.5 rounded-full text-xs font-bold border ${
                        a.isActive ? 'bg-[#F0F7F2] text-[#1F4A2E] border-[#8FC49F]' : 'bg-[#F0EFE9] text-[#6B6B5E] border-[#D4D0C8]'
                      }`}
                    >
                      {a.isActive ? '사용 중' : '사용 중지'}
                    </span>
                  </p>
                  <p className="text-xs text-[#6B6B5E]">
                    최근 로그인: {a.lastLoginAt ? formatDateTime(a.lastLoginAt) : '없음'} · 만든 날: {formatDateTime(a.createdAt)}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setResetTarget(resetTarget === a.id ? null : a.id);
                      setResetPassword('');
                    }}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg border border-[#D4D0C8] text-sm font-semibold text-[#2D5A3D] hover:bg-[#F5F5EC] disabled:opacity-40"
                  >
                    비밀번호 바꾸기
                  </button>
                  <button
                    type="button"
                    onClick={() => handleToggle(a)}
                    disabled={busy}
                    className="px-3 py-1.5 rounded-lg border border-[#F0D4B8] text-sm font-semibold text-[#B3261E] hover:bg-[#FFF8F0] disabled:opacity-40"
                  >
                    {a.isActive ? '사용 중지' : '다시 사용'}
                  </button>
                </div>
              </div>
              {resetTarget === a.id && (
                <div className="flex flex-wrap gap-2">
                  <label htmlFor={`reset-${a.id}`} className="sr-only">
                    새 비밀번호
                  </label>
                  <input
                    id={`reset-${a.id}`}
                    type="password"
                    autoComplete="new-password"
                    value={resetPassword}
                    onChange={(e) => setResetPassword(e.target.value)}
                    placeholder="새 비밀번호"
                    className={`${INPUT_CLASS} flex-1 min-w-[180px]`}
                  />
                  <button
                    type="button"
                    onClick={() => handleReset(a)}
                    disabled={busy || !resetPassword}
                    className="px-4 py-2.5 rounded-xl bg-[#2D5A3D] text-white text-sm font-semibold disabled:bg-[#999]"
                  >
                    저장
                  </button>
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <form onSubmit={handleCreate} className="bg-white rounded-2xl p-6 border border-[#E8E4DA] space-y-4">
        <p className="text-base font-bold text-[#333]">새 매니저 계정 만들기</p>
        <div>
          <label htmlFor="manager-username" className="block text-sm font-medium text-[#333] mb-1.5">
            아이디 (영문·숫자)
          </label>
          <input
            id="manager-username"
            value={newUsername}
            onChange={(e) => setNewUsername(e.target.value)}
            autoComplete="off"
            className={INPUT_CLASS}
          />
        </div>
        <div>
          <label htmlFor="manager-password" className="block text-sm font-medium text-[#333] mb-1.5">
            비밀번호
          </label>
          <input
            id="manager-password"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className={INPUT_CLASS}
          />
        </div>
        <button
          type="submit"
          disabled={busy || !newUsername.trim() || !newPassword}
          className="w-full py-3 rounded-xl bg-[#2D5A3D] text-white font-semibold hover:bg-[#245032] disabled:bg-[#999]"
        >
          매니저 계정 만들기
        </button>
      </form>
    </div>
  );
}
