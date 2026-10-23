import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import ReservationManagement from './_components/ReservationManagement';

/**
 * 예약관리 페이지 — 전화 예약 입력 · 예약 안내 문자 · 예약자 명단
 * URL: /admin/reservations
 */
export default async function AdminReservationsPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return <ReservationManagement />;
}
