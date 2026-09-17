'use client';

import { useState } from 'react';
import { getBackupData, type BackupCustomerRow, type BackupRewardRow } from '../../actions';
import { getTodayKST } from '@/lib/utils';

function csvCell(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
}

// CSV를 엑셀에서 열 때 한글이 깨지지 않도록 붙이는 UTF-8 BOM
const BOM = String.fromCharCode(0xfeff);

function downloadCsv(filename: string, headers: string[], rows: string[][]) {
  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n');
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

const SOURCE_LABEL: Record<BackupRewardRow['source'], string> = {
  visit: '방문 할인권',
  birthday: '생일 쿠폰',
  comeback: '컴백 쿠폰',
};

const STATUS_LABEL: Record<BackupRewardRow['status'], string> = {
  available: '사용가능',
  requested: '요청됨',
  used: '사용완료',
};

function customersToCsvRows(customers: BackupCustomerRow[]): string[][] {
  return customers.map((c) => [
    c.customerNumber,
    c.name,
    c.phone,
    c.birthDate || '-',
    `${c.visitCount}회`,
    c.marketingConsent ? '동의' : '미동의',
    c.signupStoreName || '-',
    c.referralSource || '-',
    c.isActive ? '활성' : '비활성',
    c.createdAt.slice(0, 10),
  ]);
}

function rewardsToCsvRows(rewards: BackupRewardRow[]): string[][] {
  return rewards.map((r) => [
    r.customerNumber,
    r.customerName,
    r.phone,
    `${r.amount.toLocaleString()}원`,
    r.thresholdVisits ? `${r.thresholdVisits}회` : '-',
    SOURCE_LABEL[r.source],
    STATUS_LABEL[r.status],
    r.issuedAt.slice(0, 10),
    r.expiresAt ? r.expiresAt.slice(0, 10) : '-',
    r.usedAt ? r.usedAt.slice(0, 10) : '-',
  ]);
}

export default function DataBackup() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ customerCount: number; rewardCount: number; date: string } | null>(null);

  async function handleDownload() {
    setLoading(true);
    setError('');
    try {
      const res = await getBackupData();
      if (!res.success || !res.data) {
        setError(res.error || '백업 데이터를 불러오지 못했습니다.');
        return;
      }

      const today = getTodayKST();

      downloadCsv(
        `고객명단_백업_${today}.csv`,
        ['회원번호', '성함', '연락처', '생년월일', '방문횟수', '혜택·소식 수신동의', '가입매장', '유입경로', '상태', '가입일'],
        customersToCsvRows(res.data.customers)
      );

      // 두 파일을 한 번에 내려받으면 브라우저가 두 번째 다운로드를 막는 경우가 있어
      // 아주 짧게 시간차를 둡니다.
      await new Promise((resolve) => setTimeout(resolve, 300));

      downloadCsv(
        `할인권현황_백업_${today}.csv`,
        ['회원번호', '성함', '연락처', '금액', '방문기준', '발급유형', '상태', '발급일', '만료일', '사용일'],
        rewardsToCsvRows(res.data.rewards)
      );

      setResult({ customerCount: res.data.customers.length, rewardCount: res.data.rewards.length, date: today });
    } catch (err) {
      console.error('백업 다운로드 오류:', err);
      setError('백업 중 오류가 발생했습니다.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="max-w-2xl space-y-6">
      <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] space-y-4">
        <div className="space-y-1">
          <h2 className="text-lg font-bold text-[#2D5A3D]">데이터 백업</h2>
          <p className="text-sm text-[#6B6B5E] leading-relaxed">
            전체 고객 명단(이름·전화번호·생년월일 등)과 할인권 발급/사용 현황을 엑셀(CSV) 파일로 내려받습니다.
            혹시라도 해율여권 프로그램 자체에 문제가 생기더라도, 전화번호를 기준으로 다른 곳에서 다시 활용할 수
            있는 형태로 만들어집니다.
          </p>
        </div>

        <button
          type="button"
          onClick={handleDownload}
          disabled={loading}
          className="px-5 py-3 rounded-xl text-sm font-semibold bg-[#2D5A3D] text-white
                     hover:bg-[#245032] hover:shadow-md transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {loading ? '백업 파일 준비 중...' : '📥 백업 파일 다운로드 (2개 파일)'}
        </button>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {result && !error && (
          <p className="text-sm text-[#2D5A3D] bg-[#F0F5EC] rounded-xl px-4 py-3">
            {result.date} 기준 백업이 완료되었습니다. 고객 {result.customerCount}명, 할인권 {result.rewardCount}건이
            저장되었습니다.
          </p>
        )}

        <p className="text-xs text-[#999]">
          ⚠️ 이 파일에는 고객 개인정보가 그대로 담겨 있습니다. 다운로드한 파일은 외부에 공유하지 마시고, 안전한
          곳에 보관해 주세요.
        </p>
      </div>
    </div>
  );
}
