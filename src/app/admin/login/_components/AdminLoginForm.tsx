'use client';

import { useState } from 'react';
import { adminLogin } from '@/app/admin/actions';
import BrandLogo from '@/components/BrandLogo';

export default function AdminLoginForm() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const result = await adminLogin(username, password);

    setLoading(false);

    if (result.success) {
      window.location.href = '/admin';
    } else {
      setError(result.error || '로그인 중 오류가 발생했습니다.');
    }
  }

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6 py-12">
      <div className="w-full max-w-sm space-y-8">
        <header className="text-center space-y-3">
          <BrandLogo height={48} textClassName="text-lg" />
          <h1 className="text-xl font-bold text-[#2D5A3D]">관리자 로그인</h1>
        </header>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-xl text-[15px]">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label htmlFor="input-username" className="block text-base font-medium text-[#333] mb-2">
              아이디
            </label>
            <input
              id="input-username"
              name="username"
              type="text"
              required
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-4 py-3.5 text-[17px] border-2 border-[#D4D0C8] rounded-xl
                         bg-white focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
            />
          </div>

          <div>
            <label htmlFor="input-password" className="block text-base font-medium text-[#333] mb-2">
              비밀번호
            </label>
            <input
              id="input-password"
              name="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 text-[17px] border-2 border-[#D4D0C8] rounded-xl
                         bg-white focus:border-[#2D5A3D] focus:outline-none transition-colors duration-200"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 px-6 bg-[#2D5A3D] text-white text-lg font-semibold rounded-2xl
                       shadow-md hover:bg-[#245032] active:scale-[0.98]
                       transition-all duration-200 disabled:bg-[#999] disabled:cursor-not-allowed"
          >
            {loading ? '로그인 중...' : '로그인'}
          </button>
        </form>
      </div>
    </main>
  );
}
