import { redirect } from 'next/navigation';
import { getStaffSession } from '@/lib/adminSession';
import AdminLoginForm from './_components/AdminLoginForm';

/**
 * 관리자 로그인 페이지
 * URL: /admin/login
 * 이미 로그인된 경우 /admin(매니저 계정은 /admin/reservations)으로 리다이렉트
 */
export default async function AdminLoginPage() {
  const session = await getStaffSession();

  if (session) {
    redirect(session.role === 'manager' ? '/admin/reservations' : '/admin');
  }

  return <AdminLoginForm />;
}
