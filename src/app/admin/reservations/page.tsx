import { redirect } from 'next/navigation';
import { getStaffSession } from '@/lib/adminSession';
import ReservationManagement from './_components/ReservationManagement';

/**
 * 예약관리 페이지 — 전화 예약 입력 · 예약 안내 문자 · 예약자 명단
 * URL: /admin/reservations
 * 전체 관리자와 매니저 계정 모두 들어올 수 있습니다. (매니저는 문구 수정·엑셀 다운로드 불가)
 */
export default async function AdminReservationsPage() {
  const session = await getStaffSession();

  if (!session) {
    redirect('/admin/login');
  }

  return <ReservationManagement isOwner={session.role === 'owner'} />;
}
