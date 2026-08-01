import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import AdminDashboard from './_components/AdminDashboard';

/**
 * 관리자 대시보드
 * URL: /admin
 * 로그인되지 않은 경우 /admin/login 으로 리다이렉트
 */
export default async function AdminPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return <AdminDashboard username={session.username} />;
}
