import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import AdminLoginForm from './_components/AdminLoginForm';

/**
 * 관리자 로그인 페이지
 * URL: /admin/login
 * 이미 로그인된 경우 /admin 으로 리다이렉트
 */
export default async function AdminLoginPage() {
  const session = await getAdminSession();

  if (session) {
    redirect('/admin');
  }

  return <AdminLoginForm />;
}
