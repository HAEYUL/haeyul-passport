import { redirect } from 'next/navigation';
import { getAdminSession } from '@/lib/adminSession';
import AdminSettings from './_components/AdminSettings';

/**
 * 설정 페이지
 * URL: /admin/settings
 */
export default async function AdminSettingsPage() {
  const session = await getAdminSession();

  if (!session) {
    redirect('/admin/login');
  }

  return <AdminSettings />;
}
