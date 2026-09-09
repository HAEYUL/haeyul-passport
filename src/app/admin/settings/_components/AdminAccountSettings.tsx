'use client';

import { useState } from 'react';
import { changeAdminPassword } from '@/app/admin/actions';

/**
 * 관리자 본인 비밀번호 변경 화면.
 */
export default function AdminAccountSettings() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (newPassword !== newPasswordConfirm) {
      setError('새 비밀번호가 서로 일치하지 않습니다.');
      return;
    }

    setSaving(true);
    const result = await changeAdminPassword(currentPassword, newPassword);
    setSaving(false);

    if (result.success) {
      setSuccessMessage('비밀번호가 변경되었습니다.');
      setCurrentPassword('');
      setNewPassword('');
      setNewPasswordConfirm('');
    } else {
      setError(result.error || '변경 중 오류가 발생했습니다.');
    }
  }

  return (
    <div className="max-w-md space-y-4">
      <p className="text-sm text-[#6B6B5E]">
        관리자 계정 비밀번호를 변경합니다. 8자 이상으로 설정해 주세요.
      </p>

      {error && (
        <div className="bg-[#FFF3E4] border border-[#EAC28E] text-[#7A4A16] px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}
      {successMessage && (
        <div className="bg-[#EAF3EC] border border-[#B9D8C2] text-[#2D5A3D] px-4 py-3 rounded-xl text-sm">
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4 bg-white rounded-2xl p-6 border border-[#E8E4DA]">
        <div>
          <label className="block text-sm font-medium text-[#333] mb-1.5">현재 비밀번호</label>
          <input
            type="password"
            required
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border-2 border-[#D4D0C8] rounded-xl
                       focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#333] mb-1.5">새 비밀번호</label>
          <input
            type="password"
            required
            minLength={8}
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border-2 border-[#D4D0C8] rounded-xl
                       focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-[#333] mb-1.5">새 비밀번호 확인</label>
          <input
            type="password"
            required
            minLength={8}
            value={newPasswordConfirm}
            onChange={(e) => setNewPasswordConfirm(e.target.value)}
            className="w-full px-3 py-2.5 text-sm border-2 border-[#D4D0C8] rounded-xl
                       focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
          />
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 px-4 bg-[#2D5A3D] text-white text-sm font-semibold rounded-xl
                     hover:bg-[#245032] transition-colors duration-200 disabled:opacity-60"
        >
          {saving ? '변경 중...' : '비밀번호 변경'}
        </button>
      </form>
    </div>
  );
}
