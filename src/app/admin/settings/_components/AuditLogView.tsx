'use client';

import { useState, useEffect, useCallback } from 'react';
import { getAuditLogs, type AuditLogItem } from '@/app/admin/actions';

const ACTION_LABELS: Record<string, string> = {
  visit_cancel: '방문 취소',
  visit_add: '방문 추가',
  reward_restore: '할인권 복구',
  reward_catalog_update: '할인권 카탈로그 수정',
  reward_rule_create: '할인권 규칙 생성',
  reward_rule_update: '할인권 규칙 수정',
  reward_rule_delete: '할인권 규칙 삭제',
  employee_create: '직원 등록',
  employee_update: '직원 정보 수정',
  table_create: '테이블 등록',
  table_update: '테이블 정보 수정',
  customer_update: '고객 정보 수정',
  customer_delete: '고객 삭제(관리자)',
  customer_withdraw: '회원 탈퇴(고객 본인)',
  qr_reissue: 'QR 재발행',
  store_location_update: '매장 위치 설정 변경',
  sms_send: '문자 발송',
};

function formatDateTimeKR(iso: string): string {
  return new Date(iso).toLocaleString('ko-KR', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * 방문취소·할인권복구·고객삭제·회원탈퇴·QR재발행·SMS발송 등
 * 지금까지 DB에만 쌓이고 있던 활동 이력을 관리자가 화면에서 볼 수 있게 합니다.
 */
export default function AuditLogView() {
  const [logs, setLogs] = useState<AuditLogItem[] | null>(null);
  const [error, setError] = useState('');

  const fetchLogs = useCallback(async () => {
    const result = await getAuditLogs();
    if (result.success && result.data) {
      setLogs(result.data);
    } else if (!result.success) {
      setError(result.error || '활동 이력을 불러올 수 없습니다.');
    }
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <p className="text-sm text-[#6B6B5E]">
        최근 활동 {logs?.length ?? 0}건을 보여줍니다 (방문취소·할인권복구·고객삭제·회원탈퇴·QR재발행·문자발송 등).
      </p>

      {error && (
        <div className="bg-[#FFF3E4] border border-[#EAC28E] text-[#7A4A16] px-4 py-3 rounded-xl text-sm">
          {error}
        </div>
      )}

      {!logs ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-12 rounded-xl bg-[#E8E8E0] animate-pulse" />
          ))}
        </div>
      ) : logs.length === 0 ? (
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-[#E8E4DA] text-center">
          <p className="text-[15px] text-[#6B6B5E]">아직 기록된 활동이 없습니다.</p>
        </div>
      ) : (
        <div className="overflow-x-auto bg-white rounded-2xl shadow-sm border border-[#E8E4DA]">
          <table className="w-full text-sm min-w-[720px]">
            <thead>
              <tr className="border-b border-[#F0EDE6] text-left text-xs text-[#6B6B5E]">
                <th className="px-4 py-3 font-medium">시각</th>
                <th className="px-4 py-3 font-medium">작업</th>
                <th className="px-4 py-3 font-medium">대상</th>
                <th className="px-4 py-3 font-medium">처리자</th>
                <th className="px-4 py-3 font-medium">사유</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-[#F0EDE6] last:border-0">
                  <td className="px-4 py-3 text-[#6B6B5E] whitespace-nowrap">{formatDateTimeKR(log.createdAt)}</td>
                  <td className="px-4 py-3 font-semibold text-[#2D5A3D] whitespace-nowrap">
                    {ACTION_LABELS[log.action] || log.action}
                  </td>
                  <td className="px-4 py-3 text-[#555] whitespace-nowrap">{log.targetType}</td>
                  <td className="px-4 py-3 text-[#555] whitespace-nowrap">
                    {log.adminUsername || <span className="text-[#999]">고객 본인</span>}
                  </td>
                  <td className="px-4 py-3 text-[#6B6B5E]">{log.reason || '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
